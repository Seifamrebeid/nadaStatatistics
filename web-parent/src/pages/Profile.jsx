import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

export default function Profile() {
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!profile?.linked_id) return;
    getDoc(doc(db, "parents", profile.linked_id))
      .then((snap) => {
        if (snap.exists()) setName(snap.data().name || "");
      })
      .catch((e) => setErr(e.message));
  }, [profile?.linked_id]);

  async function save() {
    try {
      setErr(null);
      setStatus(null);
      await updateDoc(doc(db, "parents", profile.linked_id), { name });
      setStatus("Profile updated.");
    } catch (e) {
      setErr(e.message);
    }
  }

  if (!profile) return null;
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">My profile</h1>
      <div className="bg-white rounded-lg shadow p-5 max-w-md space-y-4">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">UID</dt>
          <dd className="font-mono">{profile.uid}</dd>
          <dt className="text-slate-500">Role</dt>
          <dd>{profile.role}</dd>
          <dt className="text-slate-500">Linked ID</dt>
          <dd className="font-mono">{profile.linked_id}</dd>
          <dt className="text-slate-500">Email</dt>
          <dd>{profile.email}</dd>
        </dl>

        <label className="block">
          <span className="text-sm text-slate-600">Display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>

        <div className="flex gap-2 items-center">
          <button
            onClick={save}
            className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded"
          >
            Save changes
          </button>
          {status && <span className="text-sm text-emerald-700">{status}</span>}
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>
    </div>
  );
}
