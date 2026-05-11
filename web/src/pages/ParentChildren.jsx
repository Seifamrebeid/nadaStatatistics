import { useChildren } from "../context/ChildContext";

export default function ParentChildren() {
  const { children: kids, selectedId, setSelected, loading, err } = useChildren();

  if (err) {
    return (
      <div className="card p-6 text-red-700 bg-red-50 border-red-200">
        Error: {err}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="h-4 w-24 bg-slate-200 rounded" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          Children
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a child to view their subjects, weeks, lectures and stats.
        </p>
      </div>

      {kids.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          No children linked to your account yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kids.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`card p-5 text-left transition-colors ${
                selectedId === c.id
                  ? "ring-2 ring-brand-500 bg-brand-50"
                  : "hover:bg-slate-50"
              }`}
            >
              <div className="font-semibold text-slate-900">
                {c.name || c.id}
              </div>
              <div className="text-xs text-slate-500 mt-1">{c.email}</div>
              <div className="text-[11px] text-slate-400 mt-2">
                ID: {c.id}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
