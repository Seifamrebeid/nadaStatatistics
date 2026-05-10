/* ─── StatCard — teal-branded KPI card ──────────────────────────────────── */

const ACCENT_MAP = {
  brand:  { from: "#14b8a6", to: "#5eead4", bg: "rgba(20,184,166,.1)",  text: "#0d9488", iconBg: "rgba(20,184,166,.12)"  },
  green:  { from: "#10b981", to: "#6ee7b7", bg: "rgba(16,185,129,.1)",  text: "#059669", iconBg: "rgba(16,185,129,.12)"  },
  cyan:   { from: "#06b6d4", to: "#67e8f9", bg: "rgba(6,182,212,.1)",   text: "#0891b2", iconBg: "rgba(6,182,212,.12)"   },
  amber:  { from: "#f59e0b", to: "#fcd34d", bg: "rgba(245,158,11,.1)",  text: "#d97706", iconBg: "rgba(245,158,11,.12)"  },
  red:    { from: "#f43f5e", to: "#fda4af", bg: "rgba(244,63,94,.1)",   text: "#e11d48", iconBg: "rgba(244,63,94,.12)"   },
  slate:  { from: "#64748b", to: "#94a3b8", bg: "rgba(100,116,139,.1)", text: "#475569", iconBg: "rgba(100,116,139,.12)" },
  purple: { from: "#7c3aed", to: "#a78bfa", bg: "rgba(124,58,237,.1)",  text: "#6d28d9", iconBg: "rgba(124,58,237,.12)"  },
  orange: { from: "#f97316", to: "#fdba74", bg: "rgba(249,115,22,.1)",  text: "#ea580c", iconBg: "rgba(249,115,22,.12)"  },
};

/* Static decorative sparkline points */
const SPARK_POINTS = "0,28 18,22 36,25 54,14 72,18 90,10 108,15 126,8 144,12 162,6 180,10";

function TrendArrow({ value }) {
  if (value === undefined || value === null) return null;
  const up = value > 0;
  const flat = value === 0;
  const color = flat ? "#94a3b8" : up ? "#10b981" : "#f43f5e";
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color }}>
      {flat ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor"><rect x="2" y="7" width="12" height="2" rx="1" /></svg>
      ) : up ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4,12 8,5 12,12" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4,5 8,12 12,5" />
        </svg>
      )}
      {Math.abs(value)}%
    </span>
  );
}

export default function StatCard({
  label,
  value,
  accent = "brand",
  icon: Icon,
  trend,
  hint,
}) {
  const a = ACCENT_MAP[accent] || ACCENT_MAP.brand;

  return (
    <div
      className="card kpi-animate relative flex flex-col overflow-hidden"
      style={{ paddingBottom: 0 }}
    >
      {/* Colored bottom border */}
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-[14px]"
        style={{ background: `linear-gradient(90deg, ${a.from}, ${a.to})` }}
      />

      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {label}
          </p>
          {Icon && (
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
              style={{ background: a.iconBg, color: a.text }}
            >
              <Icon className="h-[18px] w-[18px]" />
            </div>
          )}
        </div>

        {/* Value */}
        <div
          className="text-3xl font-extrabold tracking-tight leading-none"
          style={{ color: a.text }}
        >
          {value ?? "—"}
        </div>

        {/* Trend + hint */}
        {(trend !== undefined || hint) && (
          <div className="flex items-center gap-2 flex-wrap">
            {trend !== undefined && <TrendArrow value={trend} />}
            {hint && (
              <span className="text-[11px] text-slate-400 font-medium">{hint}</span>
            )}
          </div>
        )}
      </div>

      {/* Decorative sparkline */}
      <div className="px-5 pb-4 mt-auto">
        <svg
          viewBox="0 0 180 36"
          className="w-full"
          style={{ height: 36, display: "block" }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`spark-fill-${accent}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={a.from} stopOpacity="0.18" />
              <stop offset="100%" stopColor={a.from} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Fill area */}
          <polygon
            points={`0,36 ${SPARK_POINTS} 180,36`}
            fill={`url(#spark-fill-${accent})`}
          />
          {/* Stroke line */}
          <polyline
            className="spark-line"
            points={SPARK_POINTS}
            fill="none"
            stroke={a.from}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
