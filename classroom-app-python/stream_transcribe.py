"""Streaming Arabic transcription via faster-whisper + silero-vad.

Runs during the lecture in a worker thread, in parallel with the OpenCV
capture loop. Students see live captions via onSnapshot on the
transcripts/{id}/segments subcollection.

Pipeline:

    sounddevice input (int16, 16 kHz mono)
            |
            v    feed() converts int16 -> float32 [-1, 1]
    audio queue
            |
            v    worker thread
    silero-vad per 512-sample frame (probability of speech)
            |
            v    speech-start / speech-end detection, segment buffer
    faster-whisper (single WhisperModel, "small" + int8 on CPU)
            |
            v    per-segment text + timestamps + rolling initial_prompt context
    firebase_writer.save_transcript_segment
            (one doc per segment under transcripts/{id}/segments, live)
"""

import os
import queue
import threading
import time
from typing import Optional

import numpy as np
import torch
from faster_whisper import WhisperModel
from silero_vad import load_silero_vad

from firebase_writer import (
    create_transcript_doc,
    mark_transcript_completed,
    save_transcript_segment,
)


_FRAME_SIZE = 512  # silero-vad frame size at 16 kHz
_SILENCE_END_MS = 500  # trailing silence before closing a speech segment


class StreamTranscriber:
    def __init__(self, on_segment=None):
        self.sample_rate = int(os.getenv("AUDIO_SAMPLE_RATE", "16000"))
        self.model_size = os.getenv("WHISPER_MODEL_SIZE", "small")
        self.compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
        self.language = (os.getenv("WHISPER_LANGUAGE", "") or "").strip() or None
        self.initial_prompt = os.getenv("WHISPER_INITIAL_PROMPT", "")
        self.max_chunk_sec = int(os.getenv("STREAM_MAX_CHUNK_SEC", "28"))
        self.min_chunk_sec = int(os.getenv("STREAM_MIN_CHUNK_SEC", "2"))
        self.vad_threshold = float(os.getenv("STREAM_VAD_THRESHOLD", "0.45"))
        # Approximate token count to char count for the rolling initial_prompt.
        self.context_chars = int(os.getenv("STREAM_CONTEXT_TOKENS", "224")) * 4

        self._model: Optional[WhisperModel] = None
        self._vad = None
        self._audio_q: "queue.Queue[np.ndarray]" = queue.Queue()
        self._worker: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._lecture_start: Optional[float] = None
        self._transcript_id: Optional[str] = None
        self._rolling_context = ""
        self._chunk_idx = 0
        self._on_segment = on_segment

    def _load_models(self) -> bool:
        try:
            cpu_threads = max(1, (os.cpu_count() or 4) - 2)
            print(f"[StreamTranscriber] loading Whisper '{self.model_size}' model"
                  " (first run downloads ~75 MB for tiny / ~480 MB for small)...",
                  flush=True)
            self._model = WhisperModel(
                self.model_size,
                device="cpu",
                compute_type=self.compute_type,
                cpu_threads=cpu_threads,
                num_workers=1,
            )
            self._vad = load_silero_vad()
            print("[StreamTranscriber] Whisper + VAD ready — live captions active.",
                  flush=True)
            return True
        except Exception as e:
            # Per spec: skip silently on model download / init failure.
            print(f"[StreamTranscriber] model load failed ({e}); transcription disabled.",
                  flush=True)
            self._model = None
            self._vad = None
            return False

    def start(self, lecture_id: str, language: Optional[str] = None) -> None:
        """Non-blocking. Webcam capture starts immediately; Whisper loads in a
        background thread. `feed()` drops audio until the model is ready."""
        self._stop.clear()
        lang = language or self.language or "ar"
        # Run model load + processing loop on the same worker thread — load
        # happens first, then _run() enters its main loop.
        self._worker = threading.Thread(
            target=self._load_and_run, args=(lecture_id, lang), daemon=True,
        )
        self._worker.start()

    def _load_and_run(self, lecture_id: str, language: str) -> None:
        if not self._load_models():
            return
        try:
            self._transcript_id = create_transcript_doc(lecture_id, language)
        except Exception as e:
            print(f"[StreamTranscriber] transcript doc create failed: {e}", flush=True)
            return
        self._lecture_start = time.time()
        self._run()

    def feed(self, pcm_int16: np.ndarray) -> None:
        if self._model is None or pcm_int16.dtype != np.int16:
            return
        audio_f32 = pcm_int16.astype(np.float32).flatten() / 32768.0
        self._audio_q.put(audio_f32)

    def _run(self) -> None:
        rolling = np.zeros(0, dtype=np.float32)
        seg_buf = np.zeros(0, dtype=np.float32)
        seg_start_offset = 0.0
        total_samples = 0
        in_speech = False
        silence_frames = 0
        silence_limit = int(_SILENCE_END_MS * self.sample_rate / 1000 / _FRAME_SIZE)

        while not self._stop.is_set():
            try:
                chunk = self._audio_q.get(timeout=0.1)
            except queue.Empty:
                continue
            rolling = np.concatenate([rolling, chunk])

            while len(rolling) >= _FRAME_SIZE:
                frame = rolling[:_FRAME_SIZE]
                rolling = rolling[_FRAME_SIZE:]
                try:
                    prob = float(self._vad(torch.from_numpy(frame), self.sample_rate).item())
                except Exception:
                    prob = 0.0
                speech = prob > self.vad_threshold

                if speech:
                    if not in_speech:
                        in_speech = True
                        seg_start_offset = total_samples / self.sample_rate
                    seg_buf = np.concatenate([seg_buf, frame])
                    silence_frames = 0
                elif in_speech:
                    seg_buf = np.concatenate([seg_buf, frame])
                    silence_frames += 1
                    if silence_frames >= silence_limit:
                        seg_end_offset = total_samples / self.sample_rate
                        self._publish(seg_buf, seg_start_offset, seg_end_offset)
                        seg_buf = np.zeros(0, dtype=np.float32)
                        in_speech = False
                        silence_frames = 0
                total_samples += _FRAME_SIZE

                if len(seg_buf) / self.sample_rate >= self.max_chunk_sec:
                    seg_end_offset = total_samples / self.sample_rate
                    self._publish(seg_buf, seg_start_offset, seg_end_offset)
                    seg_buf = np.zeros(0, dtype=np.float32)
                    in_speech = False
                    silence_frames = 0

        # Drain any in-flight speech on stop.
        if len(seg_buf) / self.sample_rate >= self.min_chunk_sec:
            seg_end_offset = total_samples / self.sample_rate
            self._publish(seg_buf, seg_start_offset, seg_end_offset)

    def _publish(self, audio_f32: np.ndarray, start_sec: float, end_sec: float) -> None:
        if self._model is None or self._transcript_id is None:
            return
        if (end_sec - start_sec) < self.min_chunk_sec:
            return
        try:
            prompt = (self._rolling_context + " " + self.initial_prompt).strip()
            segments, _ = self._model.transcribe(
                audio_f32,
                language=self.language,
                task="transcribe",
                beam_size=5,
                best_of=5,
                patience=2.0,
                temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0),
                compression_ratio_threshold=2.4,
                log_prob_threshold=-1.0,
                no_speech_threshold=0.55,
                condition_on_previous_text=True,
                initial_prompt=prompt if prompt else None,
                word_timestamps=True,
                vad_filter=False,
                hallucination_silence_threshold=2.0,
            )
            for seg in segments:
                text = seg.text.strip()
                if not text:
                    continue
                save_transcript_segment(
                    self._transcript_id,
                    chunk_index=self._chunk_idx,
                    start=start_sec + seg.start,
                    end=start_sec + seg.end,
                    text=text,
                )
                if self._on_segment is not None:
                    try:
                        self._on_segment(text, start_sec + seg.start, start_sec + seg.end)
                    except Exception:
                        pass
                self._chunk_idx += 1
                self._rolling_context = (self._rolling_context + " " + text)[-self.context_chars:]
        except Exception:
            return

    def stop(self) -> None:
        if self._worker is None:
            return
        self._stop.set()
        self._worker.join(timeout=5.0)
        self._worker = None
        if self._transcript_id is not None:
            try:
                mark_transcript_completed(self._transcript_id)
            except Exception:
                pass
