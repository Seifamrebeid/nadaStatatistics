import { useAuth } from "../context/AuthContext";

export default function Profile() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">My profile</h1>
      <div className="bg-white rounded-lg shadow p-5 max-w-md">
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
      </div>
    </div>
  );
}
