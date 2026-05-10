import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { db } from "../firebase";
import {
  onSnapshot,
  collection,
  query,
  orderBy,
  doc,
} from "firebase/firestore";
import { FileText, ArrowLeft, ExternalLink } from "lucide-react";

export default function StudentLiveLecture() {
  const { lectureId } = useParams();
  const navigate = useNavigate();
  const [segments, setSegments] = useState([]);
  const [lectureTitle, setLectureTitle] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [reportUrl, setReportUrl] = useState(null);
  const [transcriptId, setTranscriptId] = useState(null);
  const [err, setErr] = useState(null);
  const bottomRef = useRef(null);

  // Auto-scroll to bottom whenever segments update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments]);

  useEffect(() => {
    if (!lectureId) { setErr("No lecture ID provided."); return; }

    // Step 1: watch lecture doc for transcript_id + status
    const lectureUnsub = onSnapshot(doc(db, "lectures", lectureId), (snap) => {
      if (!snap.exists()) { setErr("Lecture not found."); return; }
      const data = snap.data();
      setLectureTitle(data.title || lectureId);
      setIsLive(data.status === "recording");
      setCompleted(data.status === "finished" || !!data.finalized_at);
      if (data.report_pdf_url) setReportUrl(data.report_pdf_url);
      if (data.transcript_id) setTranscriptId(data.transcript_id);
    }, (e) => setErr(e.message));

    return () => lectureUnsub();
  }, [lectureId]);

  useEffect(() => {
    if (!transcriptId) return;

    // Step 2: once we have transcript_id, subscribe to its segments
    const segUnsub = onSnapshot(
      query(collection(db, "transcripts", transcriptId, "segments"), orderBy("chunk_index")),
      (snap) => setSegments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => setErr(e.message),
    );

    return () => segUnsub();
  }, [transcriptId]);

  function fmtTime(sec) {
    if (sec == null) return "";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  if (err) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        {err}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Link to="/transcripts" className="mt-0.5 text-slate-400 hover:text-slate-700 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-semibold text-slate-900">{lectureTitle || "Lecture"}</h1>
                {isLive && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    LIVE
                  </span>
                )}
                {completed && (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                    Completed
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {completed ? "Full transcript" : isLive ? "Live captions — updating as the doctor speaks" : "Waiting for lecture to start…"}
              </p>
            </div>
          </div>

          {completed && reportUrl && (
            <a href={reportUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <ExternalLink className="h-4 w-4" />
              View Report
            </a>
          )}
        </div>
      </div>

      {/* Transcript panel */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <FileText className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">
            {completed ? "Transcript" : "Live Captions"}
          </span>
          {segments.length > 0 && (
            <span className="ml-auto text-xs text-slate-400">{segments.length} segment{segments.length !== 1 ? "s" : ""}</span>
          )}
        </div>

        <div className="h-[28rem] overflow-y-auto px-5 py-4 space-y-3">
          {segments.length > 0 ? (
            <>
              {segments.map((seg) => (
                <div key={seg.id} className="flex gap-3">
                  <span className="shrink-0 w-16 text-right text-xs text-slate-400 mt-0.5 font-mono">
                    {fmtTime(seg.start)}
                  </span>
                  <p className="text-sm text-slate-800 leading-relaxed" dir="auto">{seg.text}</p>
                </div>
              ))}
              <div ref={bottomRef} />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
              {!transcriptId ? (
                <>
                  <FileText className="h-8 w-8 opacity-30" />
                  <p className="text-sm">{isLive ? "Transcription starting…" : "No transcript yet"}</p>
                </>
              ) : (
                <>
                  <FileText className="h-8 w-8 opacity-30" />
                  <p className="text-sm">Waiting for first segment…</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
