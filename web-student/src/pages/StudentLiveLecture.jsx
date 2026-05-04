import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { onSnapshot, collection, query, orderBy } from "firebase/firestore";

export default function StudentLiveLecture() {
  const { lectureId } = useParams();
  const navigate = useNavigate();
  const [transcriptSegments, setTranscriptSegments] = useState([]);
  const [completed, setCompleted] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!lectureId) {
      setErr("No lecture ID provided");
      return;
    }

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

      // Also check if the transcript is completed
      const transcriptRef = collection(db, "transcripts");
      const transcriptQuery = query(transcriptRef);

      const unsubscribeTrans = onSnapshot(transcriptQuery, (snapshot) => {
        snapshot.forEach((doc) => {
          if (doc.id === lectureId && doc.data().completed === true) {
            setCompleted(true);
          }
        });
      });

      return () => {
        unsubscribe();
        unsubscribeTrans();
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

      {completed && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded">
          <p className="text-blue-800">
            Lecture recording is complete. You can now{" "}
            <a
              href={`/api/lectures/${lectureId}/report`}
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
