import { TrendingUp, TrendingDown, Minus } from "lucide-react";

/* ── Accent palette ────────────────────────────────── */
const ACCENTS = {
  brand:  { from: "#3b82f6", to: "#93c5fd", text: "text-blue-700",    bg: "bg-blue-50",    ring: "ring-blue-100",    val: "text-blue-700"    },
  green:  { from: "#10b981", to: "#6ee7b7", text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-100", val: "text-emerald-700" },
  teal:   { from: "#14b8a6", to: "#5eead4", text: "text-teal-700",    bg: "bg-teal-50",    ring: "ring-teal-100",    val: "text-teal-700"    },
  amber:  { from: "#f59e0b", to: "#fcd34d", text: "text-amber-700",   bg: "bg-amber-50",   ring: "ring-amber-100",   val: "text-amber-700"   },
  red:    { from: "#f43f5e", to: "#fda4af", text: "text-rose-700",    bg: "bg-rose-50",    ring: "ring-rose-100",    val: "text-rose-700"    },
  slate:  { from: "#64748b", to: "#94a3b8", text: "text-slate-700",   bg: "bg-slate-100",  ring: "ring-slate-200",   val: "text-slate-800"   },
  purple: { from: "#7c3aed", to: "#a78bfa", text: "text-violet-700",  bg: "bg-violet-50",  ring: "ring-violet-100",  val: "text-violet-700"  },
  orange: { from: "#f97316", to: "#fdba74", text: "text-orange-700",  bg: "bg-orange-50",  ring: "ring-orange-100",  val: "text-orange-700"  },
};

/* ── Decorative sparkline ──────────────────────────── */
function Sparkline({ from, to }) {
  return (
    <svg
      width="80"
      height="28"
      viewBox="0 0 80 28"
      fill="none"
      className="absolute bottom-3 right-3 opacity-30"
      aria-hidden="true"
    >
      <polyline
        className="spark-line"
        points="0,22 13,18 26,20 39,10 52,14 65,6 80,10"
        stroke={`url(#sg-${from.replace("#", "")})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <defs>
        <linearGradient id={`sg-${from.replace("#", "")}`} x1="0" y1="0" x2="80" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── StatCard ──────────────────────────────────────── */
export default function StatCard({
  label,
  value,
  accent = "slate",
  icon: Icon,
  hint,
  trend,
}) {
  const c = ACCENTS[accent] || ACCENTS.slate;

  const TrendIcon =
    trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor =
    trend > 0
      ? "text-emerald-600"
      : trend < 0
      ? "text-rose-500"
      : "text-slate-400";

  return (
    <div
      className="kpi-animate card relative overflow-hidden p-5"
      style={{
        borderBottom: `3px solid transparent`,
        borderImage: `linear-gradient(90deg, ${c.from}, ${c.to}) 1`,
      }}
    >
      {/* Header row: label + icon */}
      <div className="flex items-start justify-between gap-3 relative z-10">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          {label}
        </p>
        {Icon && (
          <div
            className={`h-9 w-9 rounded-xl ${c.bg} ${c.text} flex items-center justify-center ring-1 ${c.ring} shrink-0`}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Value */}
      <div className={`mt-3 text-3xl font-extrabold tracking-tight relative z-10 ${c.val}`}>
        {value ?? "—"}
      </div>

      {/* Trend + hint */}
      {(hint !== undefined || trend !== undefined) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 relative z-10">
          {trend !== undefined && (
            <span
              className={`inline-flex items-center gap-0.5 font-semibold ${trendColor}`}
            >
              <TrendIcon className="h-3 w-3" />
              {Math.abs(trend)}%
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}

      {/* Decorative sparkline */}
      <Sparkline from={c.from} to={c.to} />
    </div>
  );
}
