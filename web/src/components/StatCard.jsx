/* StatCard — professional KPI card with accent border, sparkline & trend */

const ACCENT_MAP = {
  brand:  { from: "#7c3aed", to: "#a78bfa", icon: "rgba(124,58,237,.12)", text: "#6d28d9", iconText: "#7c3aed" },
  purple: { from: "#7c3aed", to: "#a78bfa", icon: "rgba(124,58,237,.12)", text: "#6d28d9", iconText: "#7c3aed" },
  green:  { from: "#10b981", to: "#6ee7b7", icon: "rgba(16,185,129,.12)", text: "#065f46", iconText: "#10b981" },
  teal:   { from: "#14b8a6", to: "#5eead4", icon: "rgba(20,184,166,.12)", text: "#0f766e", iconText: "#14b8a6" },
  amber:  { from: "#f59e0b", to: "#fcd34d", icon: "rgba(245,158,11,.12)", text: "#92400e", iconText: "#f59e0b" },
  red:    { from: "#f43f5e", to: "#fda4af", icon: "rgba(244,63,94,.12)",  text: "#9f1239", iconText: "#f43f5e" },
  slate:  { from: "#64748b", to: "#94a3b8", icon: "rgba(100,116,139,.10)",text: "#334155", iconText: "#64748b" },
  cyan:   { from: "#06b6d4", to: "#67e8f9", icon: "rgba(6,182,212,.12)",  text: "#0e7490", iconText: "#06b6d4" },
  orange: { from: "#f97316", to: "#fdba74", icon: "rgba(249,115,22,.12)", text: "#9a3412", iconText: "#f97316" },
};

/* Static sparkline paths — each accent gets a different shape */
const SPARK_PATHS = {
  brand:  "M0,20 C8,18 12,8  20,10 S32,4  40,6  S52,14 60,10",
  purple: "M0,20 C8,18 12,8  20,10 S32,4  40,6  S52,14 60,10",
  green:  "M0,16 C6,14 10,6  18,8  S28,2  38,4  S50,12 60,8",
  teal:   "M0,18 C8,16 14,10 22,12 S34,6  44,8  S54,16 60,12",
  amber:  "M0,14 C6,12 12,4  20,6  S30,14 40,10 S52,6  60,8",
  red:    "M0,18 C8,20 14,12 22,14 S34,8  44,10 S52,18 60,14",
  slate:  "M0,16 C8,14 16,12 24,13 S36,10 46,11 S54,13 60,12",
  cyan:   "M0,14 C6,12 12,6  20,8  S32,2  42,4  S52,12 60,8",
  orange: "M0,16 C6,14 14,8  22,10 S34,6  44,8  S54,14 60,10",
};

export default function StatCard({
  label,
  value,
  accent = "slate",
  icon: Icon,
  trend,   /* { direction: 'up'|'down'|'neutral', label: string } */
  hint,
}) {
  const a = ACCENT_MAP[accent] || ACCENT_MAP.slate;
  const sparkPath = SPARK_PATHS[accent] || SPARK_PATHS.slate;

  /* trend direction */
  const dir = trend?.direction ?? "neutral";
  const trendColor = dir === "up" ? "#10b981" : dir === "down" ? "#f43f5e" : "#94a3b8";

  const TrendArrow = () => {
    if (dir === "up") return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke={trendColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 15l-6-6-6 6" />
      </svg>
    );
    if (dir === "down") return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke={trendColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    );
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke={trendColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" />
      </svg>
    );
  };

  return (
    <div className="card kpi-animate" style={{ padding: "18px 20px 14px", position: "relative", overflow: "hidden" }}>
      {/* Colored bottom border */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${a.from}, ${a.to})`,
        borderRadius: "0 0 14px 14px",
      }} />

      {/* Faint background glow */}
      <div style={{
        position: "absolute", top: -30, right: -20,
        width: 100, height: 100, borderRadius: "50%",
        background: a.icon, filter: "blur(24px)", pointerEvents: "none",
      }} />

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {label}
        </div>
        {Icon && (
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: a.icon, display: "flex", alignItems: "center", justifyContent: "center",
            color: a.iconText,
          }}>
            <Icon size={16} />
          </div>
        )}
      </div>

      {/* Value */}
      <div style={{
        fontSize: 28, fontWeight: 900, color: "#0f172a",
        lineHeight: 1.1, marginTop: 10, letterSpacing: "-0.02em",
      }}>
        {value ?? "—"}
      </div>

      {/* Sparkline */}
      <div style={{ marginTop: 10, marginBottom: 6, height: 28, overflow: "visible" }}>
        <svg width="100%" height="28" viewBox="0 0 60 24" preserveAspectRatio="none"
          style={{ display: "block" }}>
          {/* Fill gradient under line */}
          <defs>
            <linearGradient id={`sg-${accent}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={a.from} stopOpacity="0.18" />
              <stop offset="100%" stopColor={a.from} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={sparkPath + " L60,24 L0,24 Z"}
            fill={`url(#sg-${accent})`}
          />
          <path
            className="spark-line"
            d={sparkPath}
            fill="none"
            stroke={a.from}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Trend + hint */}
      {(trend || hint) && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          {trend && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 11.5, fontWeight: 700, color: trendColor,
            }}>
              <TrendArrow />
              {trend.label}
            </span>
          )}
          {hint && (
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>
              {trend ? `· ${hint}` : hint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
