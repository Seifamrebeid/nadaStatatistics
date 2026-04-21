"""Background-thread microphone recorder.

Captures mic audio in parallel with the OpenCV loop. The final WAV is the
archival Whisper input; registered listeners (the streaming transcriber) get
each PCM frame in real time on the audio thread.

Format: 16-bit int, mono, AUDIO_SAMPLE_RATE Hz (default 16 kHz — what Whisper
expects).
"""

import os
import queue
import threading
from pathlib import Path
from typing import Callable, List, Optional

import numpy as np
import sounddevice as sd
from scipy.io import wavfile


class AudioRecorder:
    def __init__(self):
        self.sample_rate = int(os.getenv("AUDIO_SAMPLE_RATE", "16000"))
        dev = os.getenv("AUDIO_DEVICE_INDEX", "").strip()
        self.device: Optional[int] = int(dev) if dev else None
        self._queue: "queue.Queue[np.ndarray]" = queue.Queue()
        self._buffer: List[np.ndarray] = []
        self._stream: Optional[sd.InputStream] = None
        self._drain_thread: Optional[threading.Thread] = None
        self._drain_stop = threading.Event()
        self._lecture_id: Optional[str] = None
        self._listeners: List[Callable[[np.ndarray], None]] = []

    def add_listener(self, fn: Callable[[np.ndarray], None]) -> None:
        """Register a PCM-frame callback. Runs on the drain thread, not the
        audio thread, so listeners can do moderate work without overrunning
        the input stream."""
        self._listeners.append(fn)

    def _callback(self, indata, frames, time_info, status):
        # Called on the audio thread. Must be non-blocking.
        self._queue.put(indata.copy())

    def _drain(self):
        while not self._drain_stop.is_set():
            try:
                chunk = self._queue.get(timeout=0.1)
            except queue.Empty:
                continue
            self._buffer.append(chunk)
            for fn in self._listeners:
                try:
                    fn(chunk)
                except Exception:
                    # A broken listener must not kill recording.
                    continue

    def start(self, lecture_id: str) -> None:
        if self._stream is not None:
            raise RuntimeError("recorder already started")
        self._lecture_id = lecture_id
        self._drain_stop.clear()
        self._stream = sd.InputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype="int16",
            device=self.device,
            callback=self._callback,
        )
        self._stream.start()
        self._drain_thread = threading.Thread(target=self._drain, daemon=True)
        self._drain_thread.start()

    def stop(self) -> Path:
        if self._stream is None:
            raise RuntimeError("recorder not started")
        self._stream.stop()
        self._stream.close()
        self._stream = None

        self._drain_stop.set()
        if self._drain_thread is not None:
            self._drain_thread.join(timeout=2.0)
        # Flush anything still queued after the drain thread exits.
        while True:
            try:
                self._buffer.append(self._queue.get_nowait())
            except queue.Empty:
                break

        out_dir = Path("recordings")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{self._lecture_id}.wav"
        if self._buffer:
            all_audio = np.concatenate(self._buffer, axis=0).flatten().astype(np.int16)
        else:
            all_audio = np.zeros(0, dtype=np.int16)
        wavfile.write(str(out_path), self.sample_rate, all_audio)
        return out_path
