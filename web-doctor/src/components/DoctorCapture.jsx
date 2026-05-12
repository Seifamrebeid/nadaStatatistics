import { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

export default function DoctorCapture({ lectureId }) {
  const [detections, setDetections] = useState([]);
  const [detectionLog, setDetectionLog] = useState([]);
  const [studentsLookup, setStudentsLookup] = useState({});

  // Load student names
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "students"));
        const map = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data().name || d.id;
        });
        setStudentsLookup(map);
      } catch (e) {
        console.error("Failed to load students:", e);
      }
    })();
  }, []);

  // Subscribe to emotions
  useEffect(() => {
    if (!lectureId) return;

    const q = query(
      collection(db, "emotions"),
      where("lecture_id", "==", lectureId),
      orderBy("timestamp", "desc"),
      limit(100)
    );

    const unsub = onSnapshot(q, (snap) => {
      const emotions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      console.log("[DoctorCapture] Emotions received:", emotions.length);

      // Latest per student
      const latestByStudent = new Map();
      emotions.forEach((e) => {
        if (!e.student_id || e.student_id === "unknown") return;
        const existing = latestByStudent.get(e.student_id);
        const eTime = e.timestamp?.toMillis?.() || 0;
        const existingTime = existing?.timestamp?.toMillis?.() || 0;
        if (!existing || eTime > existingTime) {
          latestByStudent.set(e.student_id, e);
        }
      });

      setDetections(Array.from(latestByStudent.values()));
      setDetectionLog(emotions.slice(0, 30));
    });

    return unsub;
  }, [lectureId]);

  return (
    <div className="space-y-6">
      {/* Live Detection Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800">
            📹 Live Face Detection
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {detections.length} detected • GREEN = awake • RED = sleeping
          </p>
        </div>

        {detections.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <div className="text-sm font-medium">No faces detected</div>
            <div className="text-xs mt-2">Start a lecture to see detections</div>
          </div>
        ) : (
          <div className="p-4 bg-slate-900 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {detections.map((detection) => (
              <div
                key={detection.student_id}
                className={`rounded-lg p-3 text-white text-center font-medium ring-4 transition-all ${
                  detection.state === "sleeping"
                    ? "ring-red-500 bg-red-900"
                    : "ring-green-500 bg-emerald-900"
                }`}
              >
                <div className="text-sm truncate">
                  {studentsLookup[detection.student_id] || detection.student_id}
                </div>
                <div className="text-xs mt-1 opacity-90">
                  {detection.emotion || "—"}
                </div>
                <div className="text-xs font-bold mt-1">
                  {Number(detection.engagement_score || 0).toFixed(0)}%
                </div>
                {detection.state === "sleeping" && (
                  <div className="text-lg mt-1">😴</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detection Log */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800">
            📋 Detection Log
          </h2>
          <p className="text-sm text-slate-500 mt-1">Real-time detections</p>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y">
          {detectionLog.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">
              No detections logged
            </div>
          ) : (
            detectionLog.map((log) => (
              <div
                key={log.id}
                className={`px-4 py-3 text-sm flex justify-between items-center ${
                  log.state === "sleeping" ? "bg-red-50" : "bg-slate-50"
                }`}
              >
                <div>
                  <div className="font-medium text-slate-900">
                    {studentsLookup[log.student_id] || log.student_id}
                  </div>
                  <div className="text-xs text-slate-600">
                    {log.emotion} • Score: {Number(log.engagement_score || 0).toFixed(0)}%
                    {log.state === "sleeping" && " • Sleeping"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
