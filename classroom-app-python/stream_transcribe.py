"""Real-time transcription via Deepgram nova-2 WebSocket.

Replaces the local faster-whisper+silero-vad pipeline with Deepgram's hosted
streaming API. Audio bytes flow:

    AudioRecorder (sounddevice, int16, 16 kHz mono)
            |
            v    feed() pushes raw int16 bytes
    asyncio queue (cross-thread via run_coroutine_threadsafe)
            |
            v    Deepgram WebSocket (nova-2, smart_format, endpointing)
    JSON Results messages
            |
            v    only is_final=true non-empty transcripts are persisted
    firebase_writer.save_transcript_segment
            (one doc per segment under transcripts/{id}/segments, live)

The public class interface (start / feed / stop / on_segment) is unchanged so
capture_app.py wires it up exactly the same way as the old Whisper backend.
"""

import asyncio
import json
import os
import threading
import time
from typing import Optional

import numpy as np
import websockets

from firebase_writer import (
    create_transcript_doc,
    mark_transcript_completed,
    save_transcript_segment,
)


class StreamTranscriber:
    def __init__(self, on_segment=None):
        self.api_key = os.getenv("DEEPGRAM_API_KEY", "").strip()
        self.sample_rate = int(os.getenv("AUDIO_SAMPLE_RATE", "16000"))
        self.model = os.getenv("DEEPGRAM_MODEL", "nova-2")
        # WHISPER_LANGUAGE kept as the language source so .env stays compatible.
        self.language = (os.getenv("WHISPER_LANGUAGE", "") or "").strip() or "en"

        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._worker: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._audio_q: Optional[asyncio.Queue] = None
        self._transcript_id: Optional[str] = None
        self._chunk_idx = 0
        self._on_segment = on_segment
        self._lecture_start: Optional[float] = None

    def start(self, lecture_id: str, language: Optional[str] = None) -> None:
        """Non-blocking. Spawns a worker thread that owns the asyncio loop +
        WebSocket. feed() is safe to call before the loop is ready (bytes are
        dropped until the queue exists)."""
        if not self.api_key:
            print("[StreamTranscriber] DEEPGRAM_API_KEY not set — transcription disabled.",
                  flush=True)
            return
        self._stop.clear()
        lang = (language or self.language or "en").lower()
        self._worker = threading.Thread(
            target=self._run_loop, args=(lecture_id, lang), daemon=True,
        )
        self._worker.start()

    def feed(self, pcm_int16: np.ndarray) -> None:
        """Called from the AudioRecorder drain thread. Push raw int16 bytes
        onto the asyncio queue if the loop is ready, otherwise drop."""
        if self._loop is None or self._audio_q is None:
            return
        if pcm_int16.dtype != np.int16:
            return
        data = pcm_int16.tobytes()
        try:
            asyncio.run_coroutine_threadsafe(self._audio_q.put(data), self._loop)
        except RuntimeError:
            # Loop closed mid-shutdown — drop silently.
            pass

    def stop(self) -> None:
        self._stop.set()
        if self._transcript_id:
            try:
                mark_transcript_completed(self._transcript_id)
            except Exception:
                pass

    def _run_loop(self, lecture_id: str, language: str) -> None:
        loop = asyncio.new_event_loop()
        self._loop = loop
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._main(lecture_id, language))
        except Exception as e:
            print(f"[StreamTranscriber] loop error: {e}", flush=True)
        finally:
            try:
                loop.close()
            except Exception:
                pass
            self._loop = None

    async def _main(self, lecture_id: str, language: str) -> None:
        try:
            self._transcript_id = create_transcript_doc(lecture_id, language)
        except Exception as e:
            print(f"[StreamTranscriber] transcript doc create failed: {e}", flush=True)
            return

        self._lecture_start = time.time()
        self._audio_q = asyncio.Queue()

        url = (
            "wss://api.deepgram.com/v1/listen"
            f"?model={self.model}"
            f"&language={language}"
            "&smart_format=true"
            "&punctuate=true"
            "&interim_results=false"
            "&encoding=linear16"
            f"&sample_rate={self.sample_rate}"
            "&channels=1"
            "&endpointing=300"
        )
        headers = {"Authorization": f"Token {self.api_key}"}

        try:
            async with websockets.connect(url, additional_headers=headers) as ws:
                print(f"[StreamTranscriber] Deepgram connected (model={self.model},"
                      f" lang={language}) — live captions active.", flush=True)
                sender = asyncio.create_task(self._send_audio(ws))
                receiver = asyncio.create_task(self._receive(ws))
                pending = (await asyncio.wait(
                    [sender, receiver],
                    return_when=asyncio.FIRST_COMPLETED,
                ))[1]
                for t in pending:
                    t.cancel()
                # Best-effort close-stream signal to drain any final transcript.
                try:
                    await ws.send(json.dumps({"type": "CloseStream"}))
                except Exception:
                    pass
        except Exception as e:
            print(f"[StreamTranscriber] connection failed: {e}", flush=True)

    async def _send_audio(self, ws) -> None:
        try:
            while not self._stop.is_set():
                try:
                    data = await asyncio.wait_for(self._audio_q.get(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue
                await ws.send(data)
        except websockets.ConnectionClosed:
            return
        except Exception as e:
            print(f"[StreamTranscriber] send error: {e}", flush=True)

    async def _receive(self, ws) -> None:
        try:
            async for message in ws:
                try:
                    result = json.loads(message)
                except Exception:
                    continue
                if result.get("type") != "Results":
                    continue
                if not result.get("is_final", False):
                    continue
                channel = result.get("channel", {})
                alternatives = channel.get("alternatives", [])
                if not alternatives:
                    continue
                text = (alternatives[0].get("transcript") or "").strip()
                if not text:
                    continue

                start = float(result.get("start", 0.0))
                duration = float(result.get("duration", 0.0))
                end = start + duration

                try:
                    save_transcript_segment(
                        self._transcript_id, self._chunk_idx, start, end, text,
                    )
                except Exception as e:
                    print(f"[StreamTranscriber] firestore write failed: {e}", flush=True)
                self._chunk_idx += 1

                if self._on_segment:
                    try:
                        self._on_segment(text, start, end)
                    except Exception:
                        pass

                print(f"[StreamTranscriber] {start:6.1f}-{end:6.1f}s | {text}",
                      flush=True)
        except websockets.ConnectionClosed:
            return
        except Exception as e:
            print(f"[StreamTranscriber] receive error: {e}", flush=True)
