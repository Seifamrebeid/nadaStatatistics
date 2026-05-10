import { TrendingUp, TrendingDown, Minus } from "lucide-react";

/* ── Accent palette ─────────────────────────────────────── */
const ACCENTS = {
  brand:  { from: "#f97316", to: "#fdba74", light: "#fff7ed", text: "#c2410c", border: "#fb923c" },
  orange: { from: "#f97316", to: "#fdba74", light: "#fff7ed", text: "#c2410c", border: "#fb923c" },
  green:  { from: "#10b981", to: "#6ee7b7", light: "#ecfdf5", text: "#065f46", border: "#34d399" },
  teal:   { from: "#14b8a6", to: "#5eead4", light: "#f0fdfa", text: "#0f766e", border: "#2dd4bf" },
  amber:  { from: "#f59e0b", to: "#fcd34d", light: "#fffbeb", text: "#92400e", border: "#fbbf24" },
  red:    { from: "#f43f5e", to: "#fda4af", light: "#fff1f2", text: "#9f1239", border: "#fb7185" },
  slate:  { from: "#64748b", to: "#94a3b8", light: "#f8fafc", text: "#334155", border: "#cbd5e1" },
  purple: { from: "#7c3aed", to: "#a78bfa", light: "#f5f3ff", text: "#5b21b6", border: "#8b5cf6" },
  blue:   { from: "#3b82f6", to: "#93c5fd", light: "#eff6ff", text: "#1e40af", border: "#60a5fa" },
};

/* ── Tiny sparkline (decorative) ────────────────────────── */
function Sparkline({ from, to }) {
  // A simple decorative wave path
  const path = "M0,28 C10,22 18,30 28,18 C38,6 46,24 56,16 C66,8 74,20 84,14 C94,8 102,18 112,12";
  return (
    <svg
      viewBox="0 0 112 36"
      fill="none"
      className="absolute bottom-0 right-0 w-28 h-9 opacity-25 pointer-events-none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`spark-${from}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <path
        d={path}
        stroke={`url(#spark-${from})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="spark-line"
      />
    </svg>
  );
}

/* ── StatCard ───────────────────────────────────────────── */
export default function StatCard({
  label,
  value,
  accent = "slate",
  icon: Icon,
  hint,
  trend,
  delay = 0,
}) {
  const c = ACCENTS[accent] || ACCENTS.slate;

  const TrendIcon =
    trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor =
    trend > 0 ? "#10b981" : trend < 0 ? "#f43f5e" : "#94a3b8";
  const trendBg =
    trend > 0 ? "#ecfdf5" : trend < 0 ? "#fff1f2" : "#f8fafc";

  return (
    <div
      className="kpi-animate card relative overflow-hidden p-5"
      style={{
        animationDelay: `${delay}ms`,
        borderBottom: `3px solid ${c.border}`,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <span
          className="label"
          style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.07em" }}
        >
          {label}
        </span>

        {Icon && (
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
            style={{ background: c.light }}
          >
            <Icon className="h-4 w-4" style={{ color: c.text }} />
          </div>
        )}
      </div>

      {/* Big value */}
      <div
        className="text-3xl font-extrabold tracking-tight mb-2"
        style={{ color: c.text }}
      >
        {value ?? "—"}
      </div>

      {/* Trend + hint row */}
      {(trend !== undefined || hint) && (
        <div className="flex items-center gap-2 flex-wrap">
          {trend !== undefined && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
              style={{ background: trendBg, color: trendColor }}
            >
              <TrendIcon className="h-3 w-3" />
              {Math.abs(trend)}%
            </span>
          )}
          {hint && (
            <span className="text-[12px] text-slate-500">{hint}</span>
          )}
        </div>
      )}

      {/* Decorative gradient bar at top-left */}
      <div
        className="absolute top-0 left-0 h-[3px] w-16 rounded-br-full"
        style={{ background: `linear-gradient(90deg,${c.from},${c.to})` }}
      />

      {/* Sparkline */}
      <Sparkline from={c.from} to={c.to} />
    </div>
  );
}
