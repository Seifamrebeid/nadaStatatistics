import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  onSnapshot,
  collection,
  query,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";

export default function StudentLiveLecture() {
  const { lectureId } = useParams();
  const navigate = useNavigate();
  const [transcriptSegments, setTranscriptSegments] = useState([]);
  const [completed, setCompleted] = useState(false);
  const [reportUrl, setReportUrl] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!lectureId) {
      setErr("No lecture ID provided");
      return;
    }

    try {
      // Subscribe to transcript segments
      const segmentsRef = collection(db, "transcripts", lectureId, "segments");
      const q = query(segmentsRef, orderBy("chunk_index"));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const segments = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setTranscriptSegments(segments);
      });

      // Subscribe to the lecture doc to detect finalization and get report URL
      const lectureRef = doc(db, "lectures", lectureId);
      const unsubscribeLecture = onSnapshot(lectureRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.status === "finished" || data.finalized_at) {
            setCompleted(true);
          }
          if (data.report_pdf_url) {
            setReportUrl(data.report_pdf_url);
          }
        }
      });

      return () => {
        unsubscribe();
        unsubscribeLecture();
      };
    } catch (error) {
      console.error("Error subscribing to transcripts:", error);
      setErr(error.message);
    }
  }, [lectureId]);

  if (err) {
    return <div className="text-red-600 p-4">Error: {err}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Live Lecture Transcript</h1>
        {completed && (
          <button
            onClick={() => navigate("/lectures")}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Back to Lectures
          </button>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">
          {completed ? "Transcript (Completed)" : "Live Captions"}
        </h2>
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
            <div className="text-gray-500 text-center py-8">
              {completed ? "No transcript available" : "Waiting for captions…"}
            </div>
          )}
        </div>
      </div>

      {completed && reportUrl && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded">
          <p className="text-blue-800">
            Lecture recording is complete. You can now{" "}
            <a
              href={reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:underline"
            >
              view the full report
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
