import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Camera, CameraOff, Play, Square, Activity, AlertCircle, ArrowLeft,
  ScrollText, User, RefreshCw,
} from "lucide-react";
import {
  doc, getDoc, updateDoc, serverTimestamp,
  collection, query, orderBy, onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

import { ensureModelsLoaded, detectorOptions, faceapi } from "../lib/capture/faceapi-loader";
import { dominantEmotion, engagementScore } from "../lib/capture/engagement";
import { CaptureWriter } from "../lib/capture/writer";
import { loadEnrolledEmbeddings, buildMatcher, resetEmbeddings } from "../lib/capture/enrollment";
import { TrackStateBuffer, classifyFrame } from "../lib/capture/metrics";
import { FaceTracker } from "../lib/capture/tracker";
import { ensureHandLandmarker, detectHandsForVideo } from "../lib/capture/mediapipe-loader";
import { attachGesturesToFaces } from "../lib/capture/gestures";
import { LiveTranscriber } from "../lib/capture/transcription";
import { ensurePhoneDetector, detectPhones, attachPhonesToFaces } from "../lib/capture/phone-detector";
import { Mic, MicOff } from "lucide-react";

// Phase 1 MVP:
//   - Camera preview at 30 fps
//   - face-api.js: TinyFaceDetector + FaceExpressionNet on every frame
//   - Overlay shows boxes + emotion labels
//   - Per-second batched write to Firestore `emotions`
// Phase 2 will add face identification + state/gesture/yawn detection.

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
  const rafRef      = useRef(null);
  const writerRef   = useRef(null);
  const trackerRef  = useRef(new FaceTracker());
  const stateBufRef = useRef(new TrackStateBuffer());
  const matcherRef  = useRef(null);     // face-api FaceMatcher, set after enroll
  const studentsRef = useRef({});       // { sid -> {name, email} } for labels
  const fpsRef      = useRef({ count: 0, last: performance.now(), fps: 0 });
  const frameNoRef  = useRef(0);
  const handsReadyRef = useRef(false);
  const lastGesturesRef = useRef({});   // trackKey -> last gesture (sticky across non-hand frames)
  const transcriberRef = useRef(null);
  const phoneReadyRef  = useRef(false);
  const lastPhonesRef  = useRef({});    // trackKey -> { on_phone, phone_box, ... } (sticky)
  const lastPhoneBoxesRef = useRef([]); // raw boxes for the overlay
  const lastMatchesRef = useRef({});    // trackKey -> { label, distance } for the overlay debug pip

  const [modelsReady, setModelsReady]   = useState(false);
  const [modelsError, setModelsError]   = useState(null);
  const [cameraReady, setCameraReady]   = useState(false);
  const [capturing,   setCapturing]     = useState(false);
  const [lecture,     setLecture]       = useState(null);
  const [stats,       setStats]         = useState({ fps: 0, facesNow: 0, written: 0, identified: 0 });
  const [enroll,      setEnroll]        = useState({ status: "idle", done: 0, total: 0, count: 0 });
  const [audioStatus, setAudioStatus]   = useState("off");    // off | connecting | live | error
  const [audioError,  setAudioError]    = useState(null);
  const [segmentCount, setSegmentCount] = useState(0);
  const [transcriptId, setTranscriptId] = useState(null);
  const [segments,    setSegments]      = useState([]);
  const [err,         setErr]           = useState(null);
  const transcriptScrollRef = useRef(null);

  // ── Load models on mount ────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    ensureModelsLoaded()
      .then(() => alive && setModelsReady(true))
      .catch((e) => alive && setModelsError(e.message));
    // Parallel: warm up MediaPipe HandLandmarker. Not blocking — if it
    // hasn't finished by the time recording starts, gestures stay "none"
    // until it lands.
    ensureHandLandmarker()
      .then(() => { if (alive) handsReadyRef.current = true; })
      .catch((e) => console.warn("[capture] hand landmarker:", e?.message));
    ensurePhoneDetector()
      .then(() => { if (alive) phoneReadyRef.current = true; })
      .catch((e) => console.warn("[capture] phone detector:", e?.message));
    return () => { alive = false; };
  }, []);

  // ── Fetch lecture + enroll students ────────────────────────────
  useEffect(() => {
    if (!lectureId) return;
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "lectures", lectureId));
        if (!alive) return;
        const lec = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        setLecture(lec);
        const enrolled = lec?.enrolled_student_ids || [];
        if (!enrolled.length) return;

        // Wait for face-api recognition net before starting enrollment.
        await ensureModelsLoaded();
        if (!alive) return;

        setEnroll({ status: "loading", done: 0, total: enrolled.length, count: 0 });
        const labeled = await loadEnrolledEmbeddings(enrolled, {
          onProgress: ({ done, total }) => alive && setEnroll((s) => ({ ...s, done, total })),
        });
        if (!alive) return;
        matcherRef.current = buildMatcher(labeled, 0.65);

        // Fetch display names so the overlay shows student names, not ids.
        const studentMap = {};
        // chunk into 30 to fit Firestore's `in` limit
        for (let i = 0; i < enrolled.length; i += 30) {
          const chunk = enrolled.slice(i, i + 30);
          const qs = await import("firebase/firestore").then(({ collection: c, getDocs: g,
            query: q, where: w, documentId: did }) =>
            g(q(c(db, "students"), w(did(), "in", chunk))));
          qs.docs.forEach((d) => {
            const data = d.data() || {};
            studentMap[d.id] = { name: data.name, email: data.email };
          });
        }
        studentsRef.current = studentMap;

        setEnroll({ status: "ready", done: labeled.length, total: enrolled.length, count: labeled.length });
      } catch (e) {
        if (alive) {
          setEnroll((s) => ({ ...s, status: "error" }));
          setErr(`Enrollment failed: ${e.message}`);
        }
      }
    })();
    return () => { alive = false; };
  }, [lectureId]);

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

      // Kick off the detection loop immediately so the user sees boxes
      // during the preview phase. The loop is idempotent — calling
      // startCapture() later just attaches the Firestore writer.
      if (!rafRef.current) {
        if (modelsReady) {
          tick();
        } else {
          // Wait for models, then start ticking.
          ensureModelsLoaded()
            .then(() => { if (streamRef.current) tick(); })
            .catch(() => {});
        }
      }
    } catch (e) {
      setErr(`Couldn't open camera: ${e.message}`);
    }
  }

  function closeCamera() {
    stopCapture();
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      const c = canvasRef.current;
      if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height);
    }
    setCameraReady(false);
  }

  useEffect(() => () => { closeCamera(); }, []);  // cleanup on unmount

  // ── Per-frame loop ─────────────────────────────────────────────
  async function tick() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    if (!modelsReady) {
      // Models haven't finished loading yet — retry next frame.
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    // FPS counter
    const now = performance.now();
    fpsRef.current.count++;
    if (now - fpsRef.current.last > 1000) {
      fpsRef.current.fps = fpsRef.current.count;
      fpsRef.current.count = 0;
      fpsRef.current.last = now;
    }

    frameNoRef.current++;
    const frameNo = frameNoRef.current;

    let results = [];
    try {
      // Heavy detection chain — landmarks + expressions every frame; descriptor
      // every 3rd frame (recognition is ~40ms; identity is stable so we don't
      // need it per-frame). On non-descriptor frames the IoU tracker
      // preserves the previously-assigned label.
      const includeDescriptor = frameNo % 3 === 0;
      let detector = faceapi.detectAllFaces(video, detectorOptions).withFaceLandmarks().withFaceExpressions();
      if (includeDescriptor) detector = detector.withFaceDescriptors();
      results = await detector;
    } catch (e) {
      // Surface detection errors instead of swallowing them.
      if (!err) setErr(`Detection error: ${e.message}`);
      console.error("[capture] detection chain:", e);
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    try {

      // Run them through the IoU tracker so each face gets a stable _trackKey.
      trackerRef.current.update(results);

      // Identify on the frames that have descriptors.
      let identifiedThisTick = 0;
      if (includeDescriptor && matcherRef.current) {
        for (const r of results) {
          if (!r.descriptor) continue;
          const m = matcherRef.current.findBestMatch(r.descriptor);
          if (m) {
            // Store closest match info regardless of threshold so the
            // overlay can show "no match — closest was X at 0.72".
            lastMatchesRef.current[r._trackKey] = { label: m.label, distance: m.distance };
            if (m.label !== "unknown") {
              trackerRef.current.setLabel(r._trackKey, m.label);
              identifiedThisTick++;
            }
          }
        }
      }

      // Phone / cheat detection — every 10 frames (~3 Hz). COCO-SSD is
      // the heaviest of the lot; running it less keeps the preview fast.
      if (phoneReadyRef.current && frameNo % 10 === 0 && results.length > 0) {
        const phones = await detectPhones(video);
        lastPhoneBoxesRef.current = phones;
        const map = attachPhonesToFaces({ phones, faceResults: results });
        // Refresh sticky cache: drop tracks that no longer have a phone
        const newCache = {};
        for (const r of results) {
          if (map[r._trackKey]) newCache[r._trackKey] = map[r._trackKey];
        }
        lastPhonesRef.current = newCache;
      }

      // Hand gestures — every 3 frames (~10 Hz) to balance accuracy vs cost.
      if (handsReadyRef.current && frameNo % 3 === 0 && results.length > 0) {
        const handRes = detectHandsForVideo(video, performance.now());
        if (handRes) {
          const map = attachGesturesToFaces({
            handResult: handRes,
            faceResults: results,
            videoW: video.videoWidth,
            videoH: video.videoHeight,
          });
          // Merge into the sticky cache so the gesture persists until the
          // next hand pass (otherwise we'd report "none" on the 2/3 frames
          // when hands aren't run).
          for (const [k, g] of Object.entries(map)) lastGesturesRef.current[k] = g;
          // Decay: drop entries whose tracks no longer exist
          const liveKeys = new Set(results.map((r) => r._trackKey));
          for (const k of Object.keys(lastGesturesRef.current)) {
            if (!liveKeys.has(k)) delete lastGesturesRef.current[k];
          }
        }
      }

      // Push observations + draw labels
      if (writerRef.current && results.length > 0) {
        for (const r of results) {
          const { emotion, confidence } = dominantEmotion(r.expressions);
          const sid = trackerRef.current.getLabel(r._trackKey) || `cam_${r._trackKey}`;
          const cls = classifyFrame(r._trackKey, r.landmarks, stateBufRef.current);
          const gesture = lastGesturesRef.current[r._trackKey] || "none";
          const phoneInfo = lastPhonesRef.current[r._trackKey];
          const onPhone = !!phoneInfo?.on_phone;
          // Cheat scoring mirrors the Python heuristic:
          //   base 10
          //   + 55 on_phone
          //   + 18 low_attention (sleeping → attention 0.1 < 0.45 threshold)
          //   + 12 per extra_face (face_count > 1)
          let cheat_score = 10;
          if (onPhone)                cheat_score += 55;
          if (cls.state === "sleeping") cheat_score += 18;
          if (results.length > 1)     cheat_score += 12 * Math.max(0, results.length - 1);
          cheat_score = Math.min(100, cheat_score);
          const cheat_warning = cheat_score >= 60;
          writerRef.current.push({
            student_id:        sid,
            emotion,
            confidence,
            state:             cls.state,
            sleep_reason:      cls.sleep_reason,
            gesture,
            engagement_score:  engagementScore({ emotion, state: cls.state, gesture }),
            yawning:           cls.yawning,
            yawn_reason:       cls.yawn_reason,
            attention_score:   cls.state === "sleeping" ? 0.1 : (onPhone ? 0.3 : 1),
            face_count:        results.length,
            on_phone:          onPhone,
            cheat_score,
            cheat_warning,
            ear:               cls.ear,
            mar:               cls.mar,
            head_pitch:        cls.head_pitch,
          });
        }
      }
      stateBufRef.current.prune();

      drawOverlay(results);

      const identifiedTotal = results.reduce((acc, r) => {
        const lbl = trackerRef.current.getLabel(r._trackKey);
        return acc + (lbl ? 1 : 0);
      }, 0);

      setStats({
        fps:        fpsRef.current.fps,
        facesNow:   results.length,
        written:    writerRef.current?.stats?.written ?? 0,
        identified: identifiedTotal,
      });
    } catch (e) {
      console.error("[capture] tick:", e);
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  function drawOverlay(results) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !video) return;
    // Size canvas to the video element
    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw && vh && (canvas.width !== vw || canvas.height !== vh)) {
      canvas.width = vw; canvas.height = vh;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Phone detections — red boxes so the doctor can see what triggered the alert.
    for (const ph of lastPhoneBoxesRef.current || []) {
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "#dc2626";
      ctx.strokeRect(ph.box.x, ph.box.y, ph.box.width, ph.box.height);
      ctx.setLineDash([]);
      ctx.font = "600 11px Inter, sans-serif";
      ctx.fillStyle = "rgba(220,38,38,0.92)";
      ctx.fillRect(ph.box.x, ph.box.y - 16, 56, 14);
      ctx.fillStyle = "white";
      ctx.fillText("phone", ph.box.x + 5, ph.box.y - 5);
    }

    for (const r of results) {
      const { box } = r.detection;
      const { emotion, confidence } = dominantEmotion(r.expressions);
      const color = EMOTION_COLOR[emotion] || "#a3a3a3";

      const trackKey = r._trackKey;
      const sid = trackerRef.current.getLabel(trackKey);
      const known = !!sid;
      const stu = sid ? studentsRef.current[sid] : null;
      const displayName = stu?.name || sid || "Unknown face";

      // Bold colored box for known students; dashed gray for unknown.
      ctx.lineWidth = known ? 3 : 2;
      ctx.strokeStyle = known ? color : "#94a3b8";
      ctx.setLineDash(known ? [] : [6, 4]);
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.setLineDash([]);

      // Name label above the box
      ctx.font = "bold 14px Inter, sans-serif";
      const nameLabel = displayName.length > 22 ? displayName.slice(0, 22) + "…" : displayName;
      const nameW = ctx.measureText(nameLabel).width + 14;
      ctx.fillStyle = known ? color : "#475569";
      ctx.fillRect(box.x, box.y - 22, nameW, 20);
      ctx.fillStyle = "white";
      ctx.fillText(nameLabel, box.x + 7, box.y - 7);

      // Diagnostic pip — show closest-match distance for unmatched faces.
      // Helps you see whether matching is a threshold issue (distance
      // close to threshold) or a model issue (all distances huge).
      const matchInfo = lastMatchesRef.current[trackKey];
      if (!known && matchInfo && matchInfo.distance != null) {
        const closestName = studentsRef.current[matchInfo.label]?.name || matchInfo.label;
        const txt = `closest: ${closestName} (${matchInfo.distance.toFixed(2)})`;
        ctx.font = "600 10px Inter, sans-serif";
        const dw = ctx.measureText(txt).width + 10;
        ctx.fillStyle = "rgba(15,23,42,0.78)";
        ctx.fillRect(box.x, box.y - 44, dw, 16);
        ctx.fillStyle = "#fde68a";   // amber — diagnostic color
        ctx.fillText(txt, box.x + 5, box.y - 32);
      }

      // Emotion + state badge inside, top-right of the box
      const cls = classifyFrame(trackKey, r.landmarks, stateBufRef.current);
      const isSleep = cls.state === "sleeping";
      const tag = isSleep ? "💤 sleeping" : `${emotion} ${(confidence * 100).toFixed(0)}%`;
      ctx.font = "600 12px Inter, sans-serif";
      const tagW = ctx.measureText(tag).width + 12;
      ctx.fillStyle = isSleep ? "rgba(239,68,68,0.92)" : "rgba(15,23,42,0.75)";
      ctx.fillRect(box.x + box.width - tagW - 4, box.y + 4, tagW, 20);
      ctx.fillStyle = "white";
      ctx.fillText(tag, box.x + box.width - tagW + 2, box.y + 18);

      // Yawn pip
      if (cls.yawning) {
        ctx.fillStyle = "rgba(245,158,11,0.92)";
        ctx.fillRect(box.x + 4, box.y + 4, 64, 20);
        ctx.fillStyle = "white";
        ctx.font = "600 11px Inter, sans-serif";
        ctx.fillText("yawning", box.x + 8, box.y + 18);
      }

      // Phone-on-face alert pip (top, between name and face). High-priority
      // — gets a red pulsing chip so the doctor sees it immediately.
      const phoneInfo = lastPhonesRef.current[trackKey];
      if (phoneInfo?.on_phone) {
        const txt = "📱 phone";
        ctx.font = "700 12px Inter, sans-serif";
        const pw = ctx.measureText(txt).width + 14;
        ctx.fillStyle = "rgba(220,38,38,0.95)";
        ctx.fillRect(box.x + (box.width - pw) / 2, box.y - 46, pw, 20);
        ctx.fillStyle = "white";
        ctx.fillText(txt, box.x + (box.width - pw) / 2 + 7, box.y - 32);
      }

      // Gesture pip (under the box). Bigger pop than the yawn — gestures
      // are the doctor's primary action signal.
      const gesture = lastGesturesRef.current[trackKey];
      if (gesture && gesture !== "none") {
        const gMap = {
          hand_raised:    { txt: "🖐 hand raised", bg: "rgba(99,102,241,0.95)" },
          thumbs_up:      { txt: "👍 thumbs up",   bg: "rgba(34,197,94,0.95)" },
          thumbs_down:    { txt: "👎 thumbs down", bg: "rgba(239,68,68,0.95)" },
          pointing:       { txt: "☝ pointing",     bg: "rgba(14,165,233,0.95)" },
          toilet_request: { txt: "🚻 toilet",       bg: "rgba(245,158,11,0.95)" },
        };
        const gi = gMap[gesture] || { txt: gesture, bg: "rgba(100,116,139,0.95)" };
        ctx.font = "700 12px Inter, sans-serif";
        const gw = ctx.measureText(gi.txt).width + 14;
        ctx.fillStyle = gi.bg;
        ctx.fillRect(box.x, box.y + box.height + 4, gw, 22);
        ctx.fillStyle = "white";
        ctx.fillText(gi.txt, box.x + 7, box.y + box.height + 19);
      }
    }
  }

  // ── Start / Stop ───────────────────────────────────────────────
  async function startCapture() {
    if (!modelsReady || !cameraReady || capturing) return;
    setErr(null);
    try {
      await updateDoc(doc(db, "lectures", lectureId), {
        status: "recording",
        started_at: serverTimestamp(),
      });
      writerRef.current = new CaptureWriter({ lectureId });
      writerRef.current.start();
      setCapturing(true);
      // The tick loop is already running (started when camera opened).
      // Attaching the writer means observations now flow to Firestore.

      // Auto-start transcription if Deepgram is configured.
      const probe = new LiveTranscriber({ lectureId });
      if (probe.configured()) {
        await startTranscription();
      }
    } catch (e) {
      setErr(`Couldn't start: ${e.message}`);
    }
  }

  function stopCapture() {
    // Don't kill the preview loop — only detach the writer. The user may
    // want to keep the camera + face boxes visible after stopping the
    // Firestore stream.
    if (writerRef.current) {
      writerRef.current.stop();
      writerRef.current.flush().catch(()=>{});
      writerRef.current = null;
    }
    stopTranscription();
    setCapturing(false);
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
      // After start() the LiveTranscriber has minted transcriptId.
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

  async function reenrollAll() {
    if (!lecture?.enrolled_student_ids?.length) return;
    setEnroll({ status: "loading", done: 0, total: lecture.enrolled_student_ids.length, count: 0 });
    matcherRef.current = null;
    try {
      await resetEmbeddings(lecture.enrolled_student_ids);
      const labeled = await loadEnrolledEmbeddings(lecture.enrolled_student_ids, {
        onProgress: ({ done, total }) => setEnroll((s) => ({ ...s, done, total })),
      });
      matcherRef.current = buildMatcher(labeled, 0.65);
      setEnroll({ status: "ready", done: labeled.length, total: lecture.enrolled_student_ids.length, count: labeled.length });
    } catch (e) {
      setErr(`Re-enrollment failed: ${e.message}`);
      setEnroll((s) => ({ ...s, status: "error" }));
    }
  }

  // Subscribe to the segments subcollection so the doctor sees finalized
  // text appear here in real time (LiveTranscriber writes to Firestore;
  // we read it back so the order / timing matches what the LiveClassroom
  // monitor sees on the other side).
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

  // Auto-scroll the transcript pane on new segments
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [segments.length]);

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

  const readyToStart = modelsReady && cameraReady && !capturing;

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
            face detection + emotion + gesture analysis run in your browser. Observations stream to Firestore live.
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
          <button
            onClick={reenrollAll}
            disabled={enroll.status === "loading"}
            title="Wipe face_encoding_web for all enrolled students and recompute from their photos"
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${enroll.status === "loading" ? "animate-spin" : ""}`} />
            Re-enroll
          </button>
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

      {(modelsError || err) && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{modelsError || err}</span>
        </div>
      )}

      {/* Status strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Models"   value={modelsReady ? "Loaded" : (modelsError ? "Error" : "Loading…")}
              tone={modelsReady ? "green" : (modelsError ? "red" : "amber")} />
        <Stat label="Enrollment"
              value={enroll.status === "ready"   ? `${enroll.count}/${enroll.total} students`
                   : enroll.status === "loading" ? `${enroll.done}/${enroll.total}`
                   : enroll.status === "error"   ? "Error"
                   : "idle"}
              tone={enroll.status === "ready" ? "green"
                  : enroll.status === "loading" ? "amber"
                  : enroll.status === "error" ? "red" : "slate"} />
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

      {/* Camera + overlay */}
      <div className="card overflow-hidden">
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
        <div className="font-semibold text-slate-800">Phase 4 — full feature parity with the Python capture app</div>
        <div>
          <b>Vision</b>: face detect + emotion + identity (128-D match) + EAR/MAR sleep & yawn + hand gestures (raised, thumbs, pointing, toilet) + phone-on-face cheat detection (COCO-SSD).
          <br/>
          <b>Audio</b>: mic → 16-bit PCM @ 16 kHz → Deepgram nova-2 over WebSocket → transcript segments shown live in the panel below and at <Link to={`/doctor/lectures/${lectureId}/live`} className="text-indigo-600 hover:underline">LiveClassroom</Link>.
        </div>
        <div className="text-slate-500">
          Per-face per-second observation includes <code>emotion · state · gesture · yawning · on_phone · cheat_score · engagement_score</code> — same schema as the Python app, so every downstream analytics view keeps working.
        </div>
        <div className="mt-2 pt-2 border-t border-slate-200 text-amber-700">
          <b>Testing tip:</b> your own face won't show a name — you're signed in as a doctor, not a student. To verify identification works, hold a printed (or on-screen) photo of one of the seeded students from <code>طلاب_photos/</code> in front of the camera. Check the browser console for "best dist=" diagnostics if matches aren't firing.
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
