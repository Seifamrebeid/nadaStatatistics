import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  limit,
} from "firebase/firestore";

export default function LiveClassroom() {
  const { lectureId } = useParams();
  const [currentState, setCurrentState] = useState({
    awakeCount: 0,
    sleepingCount: 0,
    handRaisedCount: 0,
    toiletRequestCount: 0,
    attentionAlertsCount: 0,
    cheatAlertsCount: 0,
  });
  const [attendance, setAttendance] = useState(null);
  const [transcriptSegments, setTranscriptSegments] = useState([]);
  const [err, setErr] = useState(null);

  // Real-time emotions via Firestore onSnapshot
  useEffect(() => {
    if (!lectureId) return;

    try {
      const q = query(
        collection(db, "emotions"),
        where("lecture_id", "==", lectureId),
        orderBy("timestamp", "desc"),
        limit(50),
      );

      const unsub = onSnapshot(
        q,
        (snap) => {
          const emotions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

          let awake = 0,
            sleeping = 0,
            handRaised = 0,
            toiletRequest = 0;

          emotions.forEach((e) => {
            if (e.state === "sleeping") {
              sleeping++;
            } else {
              awake++;
            }
            if (e.gesture === "hand_raised") handRaised++;
            if (e.gesture === "toilet_request") toiletRequest++;
          });

          // Attendance: students with emotion record in last 10 minutes
          const tenMinAgo = Date.now() - 10 * 60 * 1000;
          const recentStudents = new Set();
          const allStudentIds = new Set();
          emotions.forEach((e) => {
            if (e.student_id) allStudentIds.add(e.student_id);
            const ts = e.timestamp?.toMillis
              ? e.timestamp.toMillis()
              : e.timestamp
                ? new Date(e.timestamp).getTime()
                : 0;
            if (ts > tenMinAgo && e.student_id) {
              recentStudents.add(e.student_id);
            }
          });
          const presentCount = recentStudents.size;
          const absentCount = allStudentIds.size - presentCount;
          const attendanceRate =
            allStudentIds.size > 0 ? presentCount / allStudentIds.size : 0;

          setCurrentState({
            awakeCount: awake,
            sleepingCount: sleeping,
            handRaisedCount: handRaised,
            toiletRequestCount: toiletRequest,
            attentionAlertsCount: emotions.filter(
              (e) => (Number(e.engagement_score) || 0) < 45,
            ).length,
            cheatAlertsCount: 0,
          });
          setAttendance({
            present: presentCount,
            absent: absentCount,
            attendanceRate,
          });
        },
        (error) => {
          console.error("Error subscribing to emotions:", error);
          setErr(error.message);
        },
      );

      return unsub;
    } catch (error) {
      console.error("Error setting up emotions listener:", error);
      setErr(error.message);
    }
  }, [lectureId]);

  // Subscribe to live transcripts
  useEffect(() => {
    if (!lectureId) return;

    try {
      const segmentsRef = collection(db, "transcripts", lectureId, "segments");
      const q = query(segmentsRef, orderBy("chunk_index"));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const segments = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setTranscriptSegments(segments);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Error subscribing to transcripts:", error);
    }
  }, [lectureId]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Live Classroom</h1>

      {err && <div className="text-red-600 p-4 bg-red-50 rounded">{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-green-100 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-800">
            {currentState.awakeCount}
          </div>
          <div className="text-sm text-green-700">Awake Students</div>
        </div>
        <div className="bg-red-100 p-4 rounded-lg">
          <div className="text-2xl font-bold text-red-800">
            {currentState.sleepingCount}
          </div>
          <div className="text-sm text-red-700">Sleeping</div>
        </div>
        <div className="bg-blue-100 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-800">
            {currentState.handRaisedCount}
          </div>
          <div className="text-sm text-blue-700">Hands Raised</div>
        </div>
        <div className="bg-yellow-100 p-4 rounded-lg">
          <div className="text-2xl font-bold text-yellow-800">
            {currentState.toiletRequestCount}
          </div>
          <div className="text-sm text-yellow-700">Toilet Requests</div>
        </div>
      </div>

      {attendance && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-emerald-100 p-4 rounded-lg">
            <div className="text-2xl font-bold text-emerald-800">
              {attendance.present}
            </div>
            <div className="text-sm text-emerald-700">Present now</div>
          </div>
          <div className="bg-slate-100 p-4 rounded-lg">
            <div className="text-2xl font-bold text-slate-800">
              {attendance.absent}
            </div>
            <div className="text-sm text-slate-700">Absent now</div>
          </div>
          <div className="bg-indigo-100 p-4 rounded-lg">
            <div className="text-2xl font-bold text-indigo-800">
              {Math.round(attendance.attendanceRate * 100)}%
            </div>
            <div className="text-sm text-indigo-700">Attendance rate</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
        <div className="bg-amber-100 p-4 rounded-lg">
          <div className="text-2xl font-bold text-amber-800">
            {currentState.attentionAlertsCount}
          </div>
          <div className="text-sm text-amber-700">Attention alerts</div>
        </div>
        <div className="bg-red-100 p-4 rounded-lg">
          <div className="text-2xl font-bold text-red-800">
            {currentState.cheatAlertsCount}
          </div>
          <div className="text-sm text-red-700">Cheat alerts</div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Live Transcript</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto bg-gray-50 p-4 rounded">
          {transcriptSegments.length > 0 ? (
            transcriptSegments.map((seg) => (
              <div key={seg.id} className="text-sm border-b pb-2">
                <span className="text-gray-600 text-xs">
                  {seg.start?.toFixed(1)}s - {seg.end?.toFixed(1)}s
                </span>
                <div className="text-gray-800">{seg.text}</div>
              </div>
            ))
          ) : (
            <div className="text-gray-500">No transcript segments yet…</div>
          )}
        </div>
      </div>
    </div>
  );
}
