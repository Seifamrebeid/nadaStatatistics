// Live transcription via Deepgram's WebSocket streaming API.
//
// Captures microphone audio from the browser, encodes it as 16-bit PCM
// at 16 kHz, streams it over a WebSocket, and writes finalized segments
// to Firestore at:
//   transcripts/{transcript_id}                 (parent metadata)
//   transcripts/{transcript_id}/segments/{auto} (one doc per segment)
//
// Same schema as classroom-app-python/stream_transcribe.py so the existing
// Live Classroom monitor + Shiny transcripts tab keep working unchanged.

import {
  collection, doc, setDoc, addDoc, updateDoc, serverTimestamp,
  increment,
} from "firebase/firestore";
import { db } from "../../firebase";

const DG_MODEL    = "nova-2";
const DG_LANGUAGE = "multi";     // auto Arabic/English
const SAMPLE_RATE = 16000;

export class LiveTranscriber {
  constructor({ lectureId }) {
    this.lectureId   = lectureId;
    this.transcriptId = null;
    this.ws          = null;
    this.audioCtx    = null;
    this.processor   = null;
    this.source      = null;
    this.mediaStream = null;
    this.chunkIndex  = 0;
    this.startedAt   = null;
    this.onSegment   = null;      // optional callback({text, start, end})
    this.onStatus    = null;      // optional callback("connecting"|"open"|"closed"|"error", info)
    this.apiKey      = import.meta.env.VITE_DEEPGRAM_API_KEY || "";
  }

  configured() {
    return !!this.apiKey && !this.apiKey.includes("PUT-YOUR-KEY");
  }

  async start() {
    if (!this.configured()) {
      this.onStatus?.("error", "VITE_DEEPGRAM_API_KEY not set");
      throw new Error("Deepgram API key not set");
    }
    this.onStatus?.("connecting");

    // 1. Create the Firestore parent transcript doc.
    this.transcriptId = `trn_${Date.now()}`;
    this.startedAt    = new Date();
    this.chunkIndex   = 0;
    await setDoc(doc(db, "transcripts", this.transcriptId), {
      transcript_id:   this.transcriptId,
      lecture_id:      this.lectureId,
      language:        DG_LANGUAGE,
      started_at:      this.startedAt.toISOString(),
      last_updated_at: this.startedAt.toISOString(),
      segment_count:   0,
      completed:       false,
    });
    // Link the transcript to the lecture so the Live Classroom monitor finds it.
    await updateDoc(doc(db, "lectures", this.lectureId),
      { transcript_id: this.transcriptId }).catch(() => {});

    // 2. Open the microphone.
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: SAMPLE_RATE, echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    this.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.source = this.audioCtx.createMediaStreamSource(this.mediaStream);

    // 3. Connect to Deepgram. The browser WebSocket doesn't allow custom
    // headers, so we authenticate via the protocols field (`token`, KEY).
    const url = new URL("wss://api.deepgram.com/v1/listen");
    url.searchParams.set("model",        DG_MODEL);
    url.searchParams.set("language",     DG_LANGUAGE);
    url.searchParams.set("encoding",     "linear16");
    url.searchParams.set("sample_rate",  String(SAMPLE_RATE));
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("interim_results", "false");
    url.searchParams.set("endpointing",  "300");
    this.ws = new WebSocket(url.toString(), ["token", this.apiKey]);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen  = () => {
      this.onStatus?.("open");
      this._wireAudioToSocket();
    };
    this.ws.onerror = (e) => this.onStatus?.("error", e?.message || "ws error");
    this.ws.onclose = () => this.onStatus?.("closed");

    this.ws.onmessage = async (msg) => {
      try {
        const data = JSON.parse(typeof msg.data === "string" ? msg.data : new TextDecoder().decode(msg.data));
        if (data.type !== "Results") return;
        const alt = data.channel?.alternatives?.[0];
        const text = (alt?.transcript || "").trim();
        if (!text || !data.is_final) return;
        const start = data.start ?? 0;
        const end   = start + (data.duration ?? 0);
        await addDoc(collection(db, "transcripts", this.transcriptId, "segments"), {
          chunk_index: this.chunkIndex,
          start, end, text,
          created_at: serverTimestamp(),
        });
        await updateDoc(doc(db, "transcripts", this.transcriptId), {
          segment_count: increment(1),
          last_updated_at: new Date().toISOString(),
        });
        this.onSegment?.({ chunk: this.chunkIndex, start, end, text });
        this.chunkIndex++;
      } catch (e) {
        console.warn("[capture] transcript msg parse:", e);
      }
    };
  }

  _wireAudioToSocket() {
    // ScriptProcessorNode is deprecated but still the simplest way to grab
    // raw audio frames in real time. AudioWorklet is the modern path.
    const buf = 4096;
    this.processor = this.audioCtx.createScriptProcessor(buf, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const ch = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        const v = Math.max(-1, Math.min(1, ch[i]));
        pcm[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
      }
      this.ws.send(pcm.buffer);
    };
    this.source.connect(this.processor);
    this.processor.connect(this.audioCtx.destination);
  }

  async stop() {
    try {
      if (this.processor) { this.processor.disconnect(); this.processor.onaudioprocess = null; }
      if (this.source)    this.source.disconnect();
      if (this.audioCtx && this.audioCtx.state !== "closed") await this.audioCtx.close();
      if (this.mediaStream) this.mediaStream.getTracks().forEach((t) => t.stop());
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
        this.ws.close();
      }
    } catch (e) { /* swallow */ }

    if (this.transcriptId) {
      await updateDoc(doc(db, "transcripts", this.transcriptId), {
        completed: true,
        last_updated_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }
}
