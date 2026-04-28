export default function StatCard({ label, value, accent = "brand" }) {
  const colors = {
    brand:  "text-brand",
    green:  "text-emerald-600",
    amber:  "text-amber-600",
    red:    "text-red-600",
    slate:  "text-slate-700",
  };
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-3xl font-semibold mt-1 ${colors[accent] || colors.brand}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}
