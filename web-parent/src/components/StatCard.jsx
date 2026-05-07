import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const accents = {
  brand: { text: "text-brand-700",   bg: "bg-brand-50",   ring: "ring-brand-100" },
  green: { text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-100" },
  amber: { text: "text-amber-700",   bg: "bg-amber-50",   ring: "ring-amber-100" },
  red:   { text: "text-red-700",     bg: "bg-red-50",     ring: "ring-red-100" },
  slate: { text: "text-slate-800",   bg: "bg-slate-100",  ring: "ring-slate-200" },
};

export default function StatCard({ label, value, accent = "slate", icon: Icon, hint, trend }) {
  const c = accents[accent] || accents.slate;
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor =
    trend > 0 ? "text-emerald-600" : trend < 0 ? "text-red-600" : "text-slate-400";

  return (
    <div className="card p-5 hover:shadow-soft transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {label}
        </div>
        {Icon && (
          <div className={`h-9 w-9 rounded-lg ${c.bg} ${c.text} flex items-center justify-center ring-1 ${c.ring}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className={`mt-3 text-3xl font-semibold tracking-tight ${c.text}`}>
        {value ?? "—"}
      </div>
      {(hint || trend !== undefined) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          {trend !== undefined && (
            <span className={`inline-flex items-center gap-0.5 font-medium ${trendColor}`}>
              <TrendIcon className="h-3 w-3" />
              {Math.abs(trend)}%
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </div>
  );
}
