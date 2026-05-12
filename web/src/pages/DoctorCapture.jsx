import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Camera, CameraOff, Play, Square, AlertCircle, ArrowLeft,
  ScrollText, User, Mic, MicOff,
} from "lucide-react";
import {
  doc, getDoc, updateDoc, serverTimestamp,
  collection, query, orderBy, onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { LiveTranscriber } from "../lib/capture/transcription";

// Python API host — same machine, port 8001 by default. Override via env.
const API_BASE = import.meta.env.VITE_CAPTURE_API_URL || "http://127.0.0.1:8001";
const FRAME_INTERVAL_MS = 100;   // target 10 FPS — inflight check skips ticks when API is busy
const JPEG_QUALITY = 0.6;        // smaller payload, still good enough for 480px faces
const SEND_WIDTH = 480;          // downscale before encode — bandwidth + CPU

const EMOTION_COLOR = {
  happy:    "#10b981",
  surprise: "#22d3ee",
  neutral:  "#94a3b8",
  sad:      "#6366f1",
  angry:    "#ef4444",
  fear:     "#a855f7",
  disgust:  "#ca8a04",
};

export default function DoctorCapture() {
  const { lectureId } = useParams();
  const { profile } = useAuth();

  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const sendCanvasRef = useRef(null);   // hidden canvas used to encode JPEG
  const intervalRef = useRef(null);
  const inflightRef = useRef(false);    // skip a tick if the previous request is still in-flight
  const lastFacesRef = useRef([]);      // last API response — kept so the overlay survives between ticks
  const fpsRef      = useRef({ count: 0, last: performance.now(), fps: 0 });
  const writtenRef  = useRef(0);
  const transcriberRef = useRef(null);
  const transcriptScrollRef = useRef(null);

  const [cameraReady, setCameraReady]   = useState(false);
  const [capturing,   setCapturing]     = useState(false);
  const [lecture,     setLecture]       = useState(null);
  const [stats,       setStats]         = useState({ fps: 0, facesNow: 0, written: 0, identified: 0 });
  const [faces,       setFaces]         = useState([]);     // current API response, drives the right-side panel
  const [detectionLog, setDetectionLog] = useState([]);     // rolling history of identified detections
  const [audioStatus, setAudioStatus]   = useState("off");
  const [audioError,  setAudioError]    = useState(null);
  const [segmentCount, setSegmentCount] = useState(0);
  const [transcriptId, setTranscriptId] = useState(null);
  const [segments,    setSegments]      = useState([]);
  const [apiOk,       setApiOk]         = useState(null);   // null = unknown, true/false after probe
  const [err,         setErr]           = useState(null);

  // ── Probe the Python API on mount ──────────────────────────────
  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/health`, { method: "GET" })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(() => alive && setApiOk(true))
      .catch((e) => {
        if (!alive) return;
        setApiOk(false);
        setErr(`Cannot reach detection API at ${API_BASE} — start it with: uvicorn api_server:app --port 8001`);
        console.error("[capture] API probe failed:", e);
      });
    return () => { alive = false; };
  }, []);

  // ── Fetch lecture + refresh server-side enrollment cache ───────
  useEffect(() => {
    if (!lectureId || !apiOk) return;
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "lectures", lectureId));
        if (!alive) return;
        const lec = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        setLecture(lec);
        // Ask the Python API to load (or refresh) the enrolled face encodings.
        await fetch(`${API_BASE}/enrollment/refresh/${lectureId}`, { method: "POST" });
      } catch (e) {
        if (alive) setErr(`Couldn't load lecture: ${e.message}`);
      }
    })();
    return () => { alive = false; };
  }, [lectureId, apiOk]);

  // ── Camera control ─────────────────────────────────────────────
  async function openCamera() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      v.srcObject = stream;
      await v.play();
      setCameraReady(true);
      // Start the send loop immediately so the user sees overlays during preview.
      startSendLoop();
    } catch (e) {
      setErr(`Couldn't open camera: ${e.message}`);
    }
  }

  function closeCamera() {
    stopCapture();
    stopSendLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    const c = canvasRef.current;
    if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setCameraReady(false);
    lastFacesRef.current = [];
  }

  useEffect(() => () => { closeCamera(); }, []);

  // ── Send loop: capture → encode → POST /detect → draw ─────────
  function startSendLoop() {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(sendOneFrame, FRAME_INTERVAL_MS);
  }

  function stopSendLoop() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  async function sendOneFrame() {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || inflightRef.current) return;

    // Lazy-create the hidden encode canvas
    if (!sendCanvasRef.current) sendCanvasRef.current = document.createElement("canvas");
    const sc = sendCanvasRef.current;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const w = SEND_WIDTH;
    const h = Math.round(vh * (w / vw));
    if (sc.width !== w || sc.height !== h) { sc.width = w; sc.height = h; }
    sc.getContext("2d").drawImage(video, 0, 0, w, h);
    const jpeg = sc.toDataURL("image/jpeg", JPEG_QUALITY);

    inflightRef.current = true;
    const t0 = performance.now();
    try {
      const r = await fetch(`${API_BASE}/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lecture_id: lectureId,
          frame: jpeg,
          write_to_firestore: capturingRef.current,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      // Scale boxes from API frame size back to the source video size for the overlay.
      const sx = vw / w, sy = vh / h;
      const faces = (data.faces || []).map((f) => {
        const [top, right, bottom, left] = f.box;
        return {
          ...f,
          drawBox: {
            x: left * sx,
            y: top * sy,
            width:  (right - left) * sx,
            height: (bottom - top) * sy,
          },
        };
      });
      lastFacesRef.current = faces;
      const identified = faces.filter((f) => f.student_id !== "unknown");
      if (capturingRef.current) writtenRef.current += identified.length;

      // FPS = successful round-trips per second
      const now = performance.now();
      fpsRef.current.count++;
      if (now - fpsRef.current.last > 1000) {
        fpsRef.current.fps = fpsRef.current.count;
        fpsRef.current.count = 0;
        fpsRef.current.last = now;
      }
      setStats({
        fps: fpsRef.current.fps,
        facesNow: faces.length,
        written: writtenRef.current,
        identified: identified.length,
      });
      // Drive the right-side panel + a rolling log of identified detections.
      setFaces(faces);
      if (identified.length) {
        const stamped = identified.map((f) => ({ ...f, _at: Date.now() }));
        setDetectionLog((prev) => [...stamped, ...prev].slice(0, 50));
      }
    } catch (e) {
      console.error("[capture] /detect failed:", e);
      // Don't spam the UI banner with transient errors during preview.
    } finally {
      inflightRef.current = false;
      drawOverlay();
    }
  }

  // Keep a ref of `capturing` so the interval closure sees current value
  const capturingRef = useRef(false);
  useEffect(() => { capturingRef.current = capturing; }, [capturing]);

  function drawOverlay() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !video) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw && vh && (canvas.width !== vw || canvas.height !== vh)) {
      canvas.width = vw; canvas.height = vh;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const f of lastFacesRef.current) {
      const { x, y, width, height } = f.drawBox;
      const known = f.student_id && f.student_id !== "unknown";
      const color = EMOTION_COLOR[f.emotion] || "#a3a3a3";
      const displayName = f.name || f.student_id || "Unknown face";

      // Bold colored box for known students; dashed gray for unknown.
      ctx.lineWidth = known ? 3 : 2;
      ctx.strokeStyle = known ? color : "#94a3b8";
      ctx.setLineDash(known ? [] : [6, 4]);
      ctx.strokeRect(x, y, width, height);
      ctx.setLineDash([]);

      // Name label above the box
      ctx.font = "bold 14px Inter, sans-serif";
      const nameLabel = displayName.length > 22 ? displayName.slice(0, 22) + "…" : displayName;
      const nameW = ctx.measureText(nameLabel).width + 14;
      ctx.fillStyle = known ? color : "#475569";
      ctx.fillRect(x, y - 22, nameW, 20);
      ctx.fillStyle = "white";
      ctx.fillText(nameLabel, x + 7, y - 7);

      // Closest-match distance for unknowns — diagnostic
      if (!known && f.distance != null) {
        const txt = `closest dist: ${f.distance.toFixed(2)}`;
        ctx.font = "600 10px Inter, sans-serif";
        const dw = ctx.measureText(txt).width + 10;
        ctx.fillStyle = "rgba(15,23,42,0.78)";
        ctx.fillRect(x, y - 44, dw, 16);
        ctx.fillStyle = "#fde68a";
        ctx.fillText(txt, x + 5, y - 32);
      }

      // Emotion + score badge (top-right of the box)
      const tag = `${f.emotion} ${Math.round(f.engagement_score)}%`;
      ctx.font = "600 12px Inter, sans-serif";
      const tagW = ctx.measureText(tag).width + 12;
      ctx.fillStyle = "rgba(15,23,42,0.78)";
      ctx.fillRect(x + width - tagW - 4, y + 4, tagW, 20);
      ctx.fillStyle = "white";
      ctx.fillText(tag, x + width - tagW + 2, y + 18);
    }
  }

  // ── Start / Stop recording ─────────────────────────────────────
  async function startCapture() {
    if (!cameraReady || capturing) return;
    setErr(null);
    try {
      await updateDoc(doc(db, "lectures", lectureId), {
        status: "recording",
        started_at: serverTimestamp(),
      });
      setCapturing(true);
      const probe = new LiveTranscriber({ lectureId });
      if (probe.configured()) await startTranscription();
    } catch (e) {
      setErr(`Couldn't start: ${e.message}`);
    }
  }

  function stopCapture() {
    stopTranscription();
    setCapturing(false);
  }

  async function stopAndFinalize() {
    stopCapture();
    try {
      await updateDoc(doc(db, "lectures", lectureId), {
        status: "finished",
        finalized_at: serverTimestamp(),
      });
    } catch (e) {
      setErr(`Couldn't finalize: ${e.message}`);
    }
  }

  // ── Transcription ──────────────────────────────────────────────
  async function startTranscription() {
    if (transcriberRef.current) return;
    setAudioError(null);
    setSegmentCount(0);
    setSegments([]);
    const t = new LiveTranscriber({ lectureId });
    transcriberRef.current = t;
    t.onStatus = (s, info) => {
      setAudioStatus(s);
      if (s === "error") setAudioError(typeof info === "string" ? info : "error");
    };
    t.onSegment = () => setSegmentCount((n) => n + 1);
    try {
      await t.start();
      setTranscriptId(t.transcriptId);
    } catch (e) {
      setAudioError(e.message);
      setAudioStatus("error");
      transcriberRef.current = null;
    }
  }

  function stopTranscription() {
    const t = transcriberRef.current;
    if (!t) return;
    transcriberRef.current = null;
    t.stop().catch(() => {}).finally(() => setAudioStatus("off"));
  }

  useEffect(() => {
    if (!transcriptId) { setSegments([]); return; }
    const q = query(
      collection(db, "transcripts", transcriptId, "segments"),
      orderBy("chunk_index", "asc")
    );
    return onSnapshot(q, (snap) => {
      setSegments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [transcriptId]);

  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [segments.length]);

  const readyToStart = cameraReady && !capturing && apiOk === true;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Link to="/doctor/lectures" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Lectures
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              <User className="h-3 w-3" /> {profile?.name || profile?.email || "Doctor"}
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Classroom Capture</h1>
          <p className="text-sm text-slate-500 truncate">
            {lecture?.title ? `${lecture.title} · ` : ""}
            face detection + emotion analysis run on the Python API at {API_BASE}.
          </p>
        </div>
        <div className="flex gap-2">
          {!cameraReady ? (
            <button onClick={openCamera}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800">
              <Camera className="h-4 w-4" /> Open camera
            </button>
          ) : (
            <button onClick={closeCamera}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <CameraOff className="h-4 w-4" /> Close camera
            </button>
          )}
          {audioStatus === "off" ? (
            <button onClick={startTranscription}
              title="Start audio transcription via Deepgram"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Mic className="h-4 w-4" /> Mic
            </button>
          ) : (
            <button onClick={stopTranscription}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
              <MicOff className="h-4 w-4" /> Mic on
            </button>
          )}
          {!capturing ? (
            <button onClick={startCapture} disabled={!readyToStart}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
              <Play className="h-4 w-4" /> Start recording
            </button>
          ) : (
            <button onClick={stopAndFinalize}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700">
              <Square className="h-4 w-4" /> Stop & finalize
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {/* Status strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Python API"
              value={apiOk === true ? "Online" : apiOk === false ? "Offline" : "Checking…"}
              tone={apiOk === true ? "green" : apiOk === false ? "red" : "amber"} />
        <Stat label="Camera"   value={cameraReady ? "Live" : "Off"}
              tone={cameraReady ? "green" : "slate"} />
        <Stat label="Transcript"
              value={audioStatus === "live" || audioStatus === "open"
                ? `${segmentCount} segments`
                : audioStatus === "connecting" ? "Connecting…"
                : audioStatus === "error" ? "Error" : "Off"}
              tone={audioStatus === "live" || audioStatus === "open" ? "green"
                  : audioStatus === "connecting" ? "amber"
                  : audioStatus === "error" ? "red" : "slate"} />
        <Stat label="Recording" value={capturing ? "ON" : "Off"}
              tone={capturing ? "red" : "slate"} pulse={capturing} />
        <Stat label="FPS · Faces · ID"
              value={`${stats.fps} · ${stats.facesNow} · ${stats.identified}`}
              tone="indigo" />
      </div>
      {audioError && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 text-xs">
          Audio: {audioError}
        </div>
      )}

      {/* Camera + side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Camera + overlay — 2/3 width on desktop */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="relative bg-slate-900" style={{ aspectRatio: "16/9" }}>
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
            {!cameraReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70">
                <Camera className="h-16 w-16 opacity-30 mb-3" />
                <div className="text-sm">Click <b>Open camera</b> to begin.</div>
              </div>
            )}
            {capturing && (
              <div className="absolute top-3 right-3 inline-flex items-center gap-2 bg-red-600/90 text-white px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-sm shadow-lg">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                REC
              </div>
            )}
          </div>
        </div>

        {/* Live detection panel — 1/3 width */}
        <div className="card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Currently in frame</div>
              <div className="text-sm font-semibold text-slate-800">{faces.length} face{faces.length === 1 ? "" : "s"}</div>
            </div>
            <span className="text-[10px] font-mono text-slate-400">{stats.fps} fps</span>
          </div>

          {/* Live faces */}
          <div className="p-2 max-h-64 overflow-y-auto divide-y divide-slate-100">
            {faces.length === 0 ? (
              <div className="text-center text-xs text-slate-400 py-6">
                {cameraReady ? "No faces detected" : "Camera off"}
              </div>
            ) : faces.map((f, i) => {
              const known = f.student_id && f.student_id !== "unknown";
              const color = EMOTION_COLOR[f.emotion] || "#a3a3a3";
              return (
                <div key={`${f.student_id}_${i}`} className="flex items-center gap-2 px-2 py-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ background: known ? color : "#cbd5e1" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {f.name || (known ? f.student_id : "Unknown")}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {f.emotion} · {Math.round(f.engagement_score)}%
                      {!known && f.distance != null ? ` · dist ${f.distance.toFixed(2)}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rolling history log */}
          <div className="border-t border-slate-100">
            <div className="px-4 py-2 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Recent log
            </div>
            <div className="max-h-64 overflow-y-auto text-[11px] divide-y divide-slate-100">
              {detectionLog.length === 0 ? (
                <div className="text-center text-slate-400 py-4">No detections yet</div>
              ) : detectionLog.map((d, i) => (
                <div key={`${d._at}_${i}`} className="px-3 py-1.5 flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800 truncate">{d.name || d.student_id}</span>
                  <span className="text-slate-500 flex-shrink-0">{d.emotion}</span>
                  <span className="font-mono text-slate-400 flex-shrink-0">
                    {new Date(d._at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live transcript */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-indigo-500" />
            <h2 className="font-semibold text-slate-800 text-sm">Live transcript</h2>
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
              {segmentCount} segments · {profile?.name || "Doctor"}
            </span>
          </div>
          {audioStatus === "live" || audioStatus === "open" ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">Mic off</span>
          )}
        </div>
        <div
          ref={transcriptScrollRef}
          className="h-56 overflow-y-auto px-5 py-3 bg-slate-50/40 space-y-2 text-sm"
        >
          {segments.length === 0 && (
            <div className="text-center text-slate-400 text-xs py-8">
              {audioStatus === "live" || audioStatus === "open"
                ? "Listening… speak to see transcribed segments appear here."
                : "Click Start recording (or 🎤 Mic) to begin transcription."}
            </div>
          )}
          {segments.map((s) => (
            <div key={s.id} className="flex gap-3 items-start">
              <div className="text-[10px] font-mono text-slate-400 mt-1 flex-shrink-0 w-14">
                {fmtSecond(s.start)}–{fmtSecond(s.end)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="inline-block bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 shadow-sm">
                  {s.text}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Help / phase note */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 space-y-1">
        <div className="font-semibold text-slate-800">Python-backed detection</div>
        <div>
          Frames are encoded to JPEG at {SEND_WIDTH}px wide and POSTed to <code>{API_BASE}/detect</code> every {FRAME_INTERVAL_MS}ms (~{Math.round(1000/FRAME_INTERVAL_MS)} fps).
          The API runs face_recognition + FER and writes one <code>emotions</code> doc per identified face while recording.
        </div>
        <div className="text-amber-700">
          Start the API first: <code>cd classroom-app-python && uvicorn api_server:app --host 127.0.0.1 --port 8001 --reload</code>
        </div>
      </div>
    </div>
  );
}

function fmtSecond(s) {
  if (s == null || isNaN(s)) return "";
  const total = Math.max(0, Math.floor(s));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function Stat({ label, value, tone = "slate", pulse }) {
  const tones = {
    green:  "bg-emerald-50 text-emerald-800 border-emerald-200",
    red:    "bg-red-50 text-red-800 border-red-200",
    amber:  "bg-amber-50 text-amber-800 border-amber-200",
    indigo: "bg-indigo-50 text-indigo-800 border-indigo-200",
    slate:  "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <div className={`rounded-xl border px-4 py-2.5 ${tones[tone] || tones.slate}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${pulse ? "animate-pulse" : ""}`}>
        {value}
      </div>
    </div>
  );
}
