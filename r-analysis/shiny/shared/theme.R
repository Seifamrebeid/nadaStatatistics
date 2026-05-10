PALETTE <- list(
  primary   = "#4f46e5",  # indigo-600
  primary2  = "#7c3aed",
  accent    = "#06b6d4",  # cyan-500
  good      = "#10b981",  # emerald-500
  warn      = "#f59e0b",  # amber-500
  bad       = "#ef4444",  # red-500
  ink       = "#0f172a",  # slate-900
  ink_soft  = "#475569",  # slate-600
  line      = "#e2e8f0",  # slate-200
  bg        = "#f0f1f8"   # matches --surface-2
)

CHART_PALETTE <- c("#4f46e5", "#06b6d4", "#10b981", "#f59e0b",
                   "#f97316", "#f43f5e", "#8b5cf6", "#0ea5e9")

theme_classroom <- function() {
  theme_minimal(base_family = "Inter, system-ui, -apple-system, sans-serif",
                base_size = 13) +
    theme(
      plot.title       = element_text(face = "bold", size = 15, color = PALETTE$ink),
      plot.subtitle    = element_text(color = PALETTE$ink_soft, size = 12),
      panel.grid.major = element_line(color = PALETTE$line, linewidth = 0.4),
      panel.grid.minor = element_blank(),
      axis.text        = element_text(color = PALETTE$ink_soft),
      axis.title       = element_text(color = PALETTE$ink_soft, size = 12),
      legend.position  = "bottom",
      legend.title     = element_text(color = PALETTE$ink_soft, face = "bold"),
      legend.text      = element_text(color = PALETTE$ink_soft),
      strip.text       = element_text(color = PALETTE$ink, face = "bold")
    )
}

style_plotly <- function(p) {
  # Explicit namespacing on plotly::layout / plotly::config â€” when httr is
  # attached transitively (e.g. via factoextra deps) it ships its own
  # `config()` that returns a request object, which then breaks
  # `plotly_build`. plotly::layout has the same masking risk via stats::layout.
  p |> plotly::layout(
    font   = list(family = "Inter, system-ui, sans-serif",
                  size = 13, color = PALETTE$ink),
    paper_bgcolor = "rgba(0,0,0,0)",
    plot_bgcolor  = "rgba(0,0,0,0)",
    margin = list(l = 50, r = 25, t = 30, b = 50),
    xaxis = list(gridcolor = PALETTE$line, zerolinecolor = PALETTE$line,
                 tickfont = list(color = PALETTE$ink_soft),
                 titlefont = list(color = PALETTE$ink_soft)),
    yaxis = list(gridcolor = PALETTE$line, zerolinecolor = PALETTE$line,
                 tickfont = list(color = PALETTE$ink_soft),
                 titlefont = list(color = PALETTE$ink_soft)),
    legend = list(orientation = "h", x = 0, y = -0.2,
                  font = list(color = PALETTE$ink_soft))
  ) |>
    plotly::config(displaylogo = FALSE,
                   modeBarButtonsToRemove = c("lasso2d", "select2d", "autoScale2d"))
}

# Custom CSS layered on top of the AdminLTE skin.
CUSTOM_CSS <- "
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap');

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Design tokens */
:root {
  --brand:        #7c3aed;
  --brand-dark:   #4338ca;
  --brand-light:  #818cf8;
  --brand-glow:   rgba(79,70,229,0.18);
  --cyan:         #22d3ee;
  --emerald:      #10b981;
  --amber:        #f59e0b;
  --rose:         #f43f5e;
  --violet:       #a78bfa;
  --orange:       #f97316;

  --ink:          #0f172a;
  --ink-2:        #1e293b;
  --ink-3:        #334155;
  --muted:        #64748b;
  --subtle:       #94a3b8;
  --line:         #e2e8f0;
  --line-2:       #f1f5f9;

  --surface:      #ffffff;
  --surface-2:    #f0f1f8;
  --surface-3:    #e9eaf4;

  --sidebar-from: #09061a;
  --sidebar-to:   #1a0d2e;
  --sidebar-bg:   #09061a;
  --sidebar-w:    260px;

  --radius-sm:    8px;
  --radius:       12px;
  --radius-lg:    18px;
  --radius-xl:    24px;

  --shadow-sm:    0 1px 2px rgba(15,23,42,0.04);
  --shadow:       0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04);
  --shadow-md:    0 4px 12px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04);
  --shadow-lg:    0 12px 32px rgba(15,23,42,0.10), 0 4px 8px rgba(15,23,42,0.04);
  --shadow-brand: 0 8px 24px rgba(79,70,229,0.22);
  --shadow-warm:  0 8px 24px rgba(249,115,22,0.20);
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Base */
*, *::before, *::after { box-sizing: border-box; }

html, body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
  font-feature-settings: 'cv11', 'ss01';
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  letter-spacing: -0.006em;
  color: var(--ink);
}

body, .content-wrapper, .right-side, .wrapper {
  background: var(--surface-2) !important;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Header */
.main-header { position: sticky; top: 0; z-index: 1030; }

.skin-blue .main-header .navbar {
  background: rgba(255,255,255,0.88) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  border-bottom: 1px solid rgba(226,232,240,0.9) !important;
  box-shadow: 0 1px 0 var(--line), 0 2px 12px rgba(15,23,42,0.04) !important;
  min-height: 64px !important;
  display: flex;
  align-items: center;
}
.skin-blue .main-header .logo {
  background: linear-gradient(145deg, #0f172a 0%, #312e81 48%, #7c3aed 100%) !important;
  color: #fff !important;
  font-family: 'Inter', sans-serif !important;
  font-weight: 700 !important;
  font-size: 15px !important;
  letter-spacing: -0.03em !important;
  border-right: 1px solid rgba(255,255,255,0.06) !important;
  width: var(--sidebar-w) !important;
  height: 64px !important;
  display: flex !important;
  align-items: center !important;
  padding: 0 20px !important;
}
.skin-blue .main-header .navbar .sidebar-toggle {
  color: var(--muted) !important;
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 18px !important;
  font-size: 16px !important;
}
.skin-blue .main-header .navbar .sidebar-toggle:hover {
  background: var(--surface-2) !important;
  color: var(--brand) !important;
}

/* right-side navbar items */
.navbar-custom-right {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 20px;
  margin-left: auto;
}
.navbar-role-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.navbar-role-badge.role-admin   { background: rgba(124,58,237,0.10); color: var(--brand); border: 1px solid rgba(124,58,237,0.20); }
.navbar-role-badge.role-doctor  { background: rgba(16,185,129,0.10); color: #059669;      border: 1px solid rgba(16,185,129,0.20); }
.navbar-role-badge.role-student { background: rgba(245,158,11,0.10); color: #d97706;      border: 1px solid rgba(245,158,11,0.20); }
.navbar-role-badge.role-parent  { background: rgba(167,139,250,0.10); color: #7c3aed;    border: 1px solid rgba(167,139,250,0.20); }

.navbar-divider {
  width: 1px;
  height: 28px;
  background: var(--line);
}
.navbar-avatar {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--brand) 0%, var(--cyan) 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0;
  box-shadow: 0 2px 6px rgba(124,58,237,0.28);
  flex-shrink: 0;
}
.navbar-user-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.2;
}
.navbar-user-name  { font-size: 13px; font-weight: 600; color: var(--ink-2); }
.navbar-user-email { font-size: 11px; color: var(--muted); }

/* hide the default AdminLTE right navbar menu margin */
.navbar-nav { margin: 0 !important; }

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Sidebar */
.skin-blue .main-sidebar {
  background: linear-gradient(160deg, #081120 0%, #111827 34%, #1e1b4b 72%, #312e81 100%) !important;
  width: var(--sidebar-w) !important;
  box-shadow: 2px 0 20px rgba(15,23,42,0.20) !important;
  border-right: none !important;
  position: relative;
}
.skin-blue .main-sidebar::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 130% 35% at 50% 0%, rgba(79,70,229,0.28) 0%, transparent 65%);
  pointer-events: none;
  z-index: 0;
}
.skin-blue .sidebar { position: relative; z-index: 1; }
.skin-blue .sidebar { padding-top: 8px; }

.skin-blue .sidebar-menu > li.header {
  color: rgba(165,180,252,0.82) !important;
  font-size: 9.5px !important;
  font-weight: 700 !important;
  letter-spacing: 0.12em !important;
  text-transform: uppercase !important;
  padding: 20px 18px 6px !important;
  background: transparent !important;
  display: flex !important;
  align-items: center !important;
  gap: 7px !important;
}
.skin-blue .sidebar-menu > li.header::before {
  content: '';
  display: inline-block;
  width: 18px;
  height: 1.5px;
  background: linear-gradient(90deg, rgba(79,70,229,0.7), transparent);
  border-radius: 999px;
  flex-shrink: 0;
}

.skin-blue .sidebar-menu > li > a {
  color: #94a3b8 !important;
  font-size: 13.5px !important;
  font-weight: 500 !important;
  padding: 9px 18px 9px 16px !important;
  margin: 1px 8px !important;
  border-radius: var(--radius-sm) !important;
  border-left: none !important;
  transition: background 0.13s, color 0.13s !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
}
.skin-blue .sidebar-menu > li > a > .fa {
  width: 18px !important;
  font-size: 14px !important;
  opacity: 0.75;
  flex-shrink: 0;
}
.skin-blue .sidebar-menu > li:hover > a {
  background: rgba(255,255,255,0.07) !important;
  color: #e2e8f0 !important;
}
.skin-blue .sidebar-menu > li.active > a {
  background: linear-gradient(90deg, rgba(79,70,229,0.30), rgba(6,182,212,0.16)) !important;
  color: #eef2ff !important;
  border: 1px solid rgba(99,102,241,0.32) !important;
  box-shadow: 0 2px 18px rgba(79,70,229,0.22), inset 0 1px 0 rgba(255,255,255,0.06) !important;
  font-weight: 700 !important;
}
.skin-blue .sidebar-menu > li.active > a > .fa {
  opacity: 1;
  color: #c4b5fd !important;
  text-shadow: 0 0 8px rgba(167,139,250,0.50) !important;
}
.skin-blue .sidebar-menu > li > a:focus { outline: none !important; }

.sidebar hr { border-top: 1px solid rgba(255,255,255,0.07) !important; margin: 10px 18px !important; }

.sidebar .btn-primary {
  background: linear-gradient(135deg, var(--brand) 0%, #06b6d4 100%) !important;
  border: none !important;
  border-radius: var(--radius) !important;
  padding: 9px 16px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  box-shadow: var(--shadow-brand) !important;
  margin: 4px 10px !important;
  width: calc(100% - 20px) !important;
  transition: background 0.13s, box-shadow 0.13s !important;
}
.sidebar .btn-primary:hover {
  background: var(--brand-dark) !important;
  box-shadow: 0 6px 20px rgba(79,70,229,0.30) !important;
}
.sidebar .btn-default {
  background: rgba(255,255,255,0.06) !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  color: #94a3b8 !important;
  border-radius: var(--radius) !important;
  padding: 9px 16px !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  margin: 4px 10px !important;
  width: calc(100% - 20px) !important;
  transition: background 0.13s !important;
}
.sidebar .btn-default:hover {
  background: rgba(255,255,255,0.10) !important;
  color: #e2e8f0 !important;
}

/* Colorful sidebar accents */
.skin-blue .sidebar-menu > li > a { position: relative; padding-left: 22px !important; }
.skin-blue .sidebar-menu > li > a::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 8px;
  bottom: 8px;
  width: 6px;
  border-radius: 6px;
  background: linear-gradient(180deg, var(--brand) 0%, var(--cyan) 60%, var(--emerald) 100%);
  opacity: 0; transform: scaleY(0.85);
  transition: opacity 0.14s ease, transform 0.18s ease;
}
.skin-blue .sidebar-menu > li:hover > a::before,
.skin-blue .sidebar-menu > li.active > a::before { opacity: 1; transform: scaleY(1); }

/* Make icons slightly colorful on hover/active */
.skin-blue .sidebar-menu > li > a > .fa { color: rgba(255,255,255,0.82) !important; transition: color 0.12s ease, transform 0.12s ease; }
.skin-blue .sidebar-menu > li:hover > a > .fa { color: #fff !important; transform: translateX(2px) scale(1.02); }
.skin-blue .sidebar-menu > li.active > a > .fa { color: #fff !important; text-shadow: 0 6px 18px rgba(79,70,229,0.22); }

/* Header chips â€” small gradient pills next to section headers */
.skin-blue .sidebar-menu > li.header::after {
  content: '';
  display: inline-block;
  width: 36px;
  height: 6px;
  margin-left: 10px;
  vertical-align: middle;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--brand) 0%, #06b6d4 50%, var(--emerald) 100%);
  opacity: 0.9;
}

/* Slightly larger clickable area and clearer focus for accessibility */
.skin-blue .sidebar-menu > li > a { padding-top: 12px !important; padding-bottom: 12px !important; }

/* Per-section accent colors */
.skin-blue .sidebar-menu > li.sec-analytics > a::before {
  background: linear-gradient(180deg, #4f46e5 0%, #06b6d4 70%);
}
.skin-blue .sidebar-menu > li.sec-cluster > a::before {
  background: linear-gradient(180deg, #7c3aed 0%, #a78bfa 70%);
}
.skin-blue .sidebar-menu > li.sec-data > a::before {
  background: linear-gradient(180deg, #f97316 0%, #f59e0b 70%);
}
.skin-blue .sidebar-menu > li.sec-insights > a::before {
  background: linear-gradient(180deg, #10b981 0%, #06b6d4 70%);
}

/* Active item backgrounds per section */
.skin-blue .sidebar-menu > li.sec-analytics.active > a {
  background: linear-gradient(90deg, rgba(79,70,229,0.28), rgba(6,182,212,0.08)) !important;
}
.skin-blue .sidebar-menu > li.sec-cluster.active > a {
  background: linear-gradient(90deg, rgba(167,139,250,0.26), rgba(99,102,241,0.06)) !important;
}
.skin-blue .sidebar-menu > li.sec-data.active > a {
  background: linear-gradient(90deg, rgba(249,115,22,0.22), rgba(245,158,11,0.06)) !important;
}
.skin-blue .sidebar-menu > li.sec-insights.active > a {
  background: linear-gradient(90deg, rgba(16,185,129,0.18), rgba(6,182,212,0.06)) !important;
}

/* Selectize inside sidebar */
.sidebar .selectize-input {
  background: rgba(255,255,255,0.08) !important;
  border: 1px solid rgba(255,255,255,0.12) !important;
  color: #e2e8f0 !important;
  border-radius: var(--radius-sm) !important;
}
.sidebar .selectize-input input { color: #e2e8f0 !important; }
.sidebar .control-label { color: rgba(148,163,184,0.8) !important; font-size: 10px !important; padding: 0 10px; }
.sidebar .form-group { margin: 0 0 4px !important; padding: 0 8px !important; }

/* auto-refresh checkbox */
.sidebar .checkbox { margin: 0 !important; }
.sidebar .checkbox label { color: #94a3b8 !important; font-size: 11px !important;
  text-transform: none !important; letter-spacing: 0 !important; font-weight: 500 !important; }
#last_refresh_ui { color: #64748b; font-size: 10px; }

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Content area */
.content { padding: 24px 28px !important; }
.content-header { padding: 20px 28px 4px !important; }
.content-header > h1 {
  font-size: 24px !important;
  font-weight: 800 !important;
  letter-spacing: -0.03em !important;
  background: linear-gradient(135deg, var(--ink) 0%, var(--brand) 120%);
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  background-clip: text !important;
  margin: 0 0 2px !important;
  display: inline-block !important;
}
.content-header > h1 > small {
  font-size: 13px !important;
  font-weight: 400 !important;
  color: var(--muted) !important;
  margin-left: 10px !important;
  letter-spacing: 0 !important;
  -webkit-text-fill-color: var(--muted) !important;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Cards / Boxes */
.box {
  border: 1px solid rgba(226,232,240,0.92) !important;
  border-radius: var(--radius-lg) !important;
  box-shadow: 0 1px 3px rgba(15,23,42,0.05), 0 8px 20px rgba(15,23,42,0.05) !important;
  background: var(--surface) !important;
  transition: box-shadow 0.20s ease, transform 0.20s ease !important;
  overflow: hidden !important;
  margin-bottom: 20px !important;
  position: relative !important;
}
.box::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--brand) 0%, var(--cyan) 52%, var(--emerald) 100%);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  opacity: 0;
  transition: opacity 0.20s;
}
.box:hover { transform: translateY(-2px) !important; box-shadow: var(--shadow-md) !important; }
.box:hover::before { opacity: 1; }

.box > .box-header, .box.box-solid > .box-header {
  background: var(--surface) !important;
  border-bottom: 1px solid var(--line) !important;
  padding: 16px 22px 14px !important;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0 !important;
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
}
.box-header > .box-title {
  font-size: 14px !important;
  font-weight: 700 !important;
  letter-spacing: -0.015em !important;
  color: var(--ink-2) !important;
}
.box-body { padding: 20px 22px !important; }
.box-footer {
  background: linear-gradient(90deg, var(--surface-2), var(--line-2)) !important;
  border-top: 1px solid var(--line) !important;
  padding: 10px 22px !important;
  font-size: 12px !important;
  color: var(--muted) !important;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg) !important;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• KPI / Value boxes */
.small-box {
  border-radius: var(--radius-lg) !important;
  overflow: hidden !important;
  box-shadow: var(--shadow-md) !important;
  border: none !important;
  position: relative !important;
  transition: transform 0.20s ease, box-shadow 0.20s ease !important;
  margin-bottom: 20px !important;
}
.small-box::after {
  content: '';
  position: absolute;
  top: -50%; left: -60%;
  width: 60%; height: 200%;
  background: linear-gradient(105deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0) 70%);
  transform: skewX(-20deg);
  transition: left 0.5s ease;
  pointer-events: none;
  z-index: 3;
}
.small-box:hover::after { left: 130%; }
.small-box:hover {
  transform: translateY(-4px) !important;
  box-shadow: var(--shadow-lg) !important;
}
.small-box > .inner {
  padding: 22px 24px !important;
  position: relative;
  z-index: 2;
}
.small-box > .inner::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at top right, rgba(255,255,255,0.18), transparent 60%);
  pointer-events: none;
}
.small-box > .inner > h3 {
  font-size: 38px !important;
  font-weight: 800 !important;
  letter-spacing: -0.05em !important;
  margin: 0 0 4px !important;
  line-height: 1 !important;
  color: #fff !important;
  text-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
}
.small-box > .inner > p {
  font-size: 11px !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.10em !important;
  color: rgba(255,255,255,0.82) !important;
  margin: 0 !important;
}
.small-box .icon {
  position: absolute !important;
  right: 14px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  font-size: 70px !important;
  color: rgba(255,255,255,0.16) !important;
  z-index: 1 !important;
  transition: color 0.20s, transform 0.20s !important;
}
.small-box:hover .icon {
  color: rgba(255,255,255,0.26) !important;
  transform: translateY(-52%) scale(1.06) !important;
}

.small-box > a.small-box-footer {
  background: rgba(0,0,0,0.14) !important;
  color: rgba(255,255,255,0.88) !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  padding: 8px !important;
  border-top: 1px solid rgba(255,255,255,0.12) !important;
  transition: background 0.15s !important;
}
.small-box > a.small-box-footer:hover { background: rgba(0,0,0,0.22) !important; }

.bg-aqua, .bg-light-blue {
  background: linear-gradient(135deg, #2563eb 0%, #6366f1 45%, #06b6d4 100%) !important;
  box-shadow: 0 10px 28px rgba(37,99,235,0.34) !important;
}
.bg-green {
  background: linear-gradient(135deg, #047857 0%, #059669 50%, #10b981 100%) !important;
  box-shadow: 0 10px 28px rgba(16,185,129,0.35) !important;
}
.bg-yellow {
  background: linear-gradient(135deg, #b45309 0%, #d97706 50%, #f59e0b 100%) !important;
  box-shadow: 0 10px 28px rgba(245,158,11,0.35) !important;
}
.bg-red {
  background: linear-gradient(135deg, #be123c 0%, #e11d48 50%, #f43f5e 100%) !important;
  box-shadow: 0 10px 28px rgba(244,63,94,0.35) !important;
}
.bg-purple {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a78bfa 100%) !important;
  box-shadow: 0 10px 28px rgba(79,70,229,0.34) !important;
}
.bg-navy {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #334155 100%) !important;
  box-shadow: 0 8px 24px rgba(15,23,42,0.35) !important;
}
.bg-teal {
  background: linear-gradient(135deg, #0e7490 0%, #0891b2 50%, #06b6d4 100%) !important;
  box-shadow: 0 10px 28px rgba(6,182,212,0.35) !important;
}
.bg-orange {
  background: linear-gradient(135deg, #c2410c 0%, #ea580c 50%, #f97316 100%) !important;
  box-shadow: 0 10px 28px rgba(249,115,22,0.35) !important;
}

.value-box {
  border-radius: var(--radius-lg) !important;
  overflow: hidden !important;
  box-shadow: 0 10px 28px rgba(15,23,42,0.08) !important;
}

.value-box .small-box { margin-bottom: 0 !important; }

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Inputs */
.form-control {
  border-radius: var(--radius-sm) !important;
  border: 1px solid var(--line) !important;
  background: var(--surface) !important;
  color: var(--ink) !important;
  font-size: 13.5px !important;
  height: 36px !important;
  box-shadow: none !important;
  transition: border-color 0.13s, box-shadow 0.13s !important;
}
.form-control:focus {
  border-color: var(--brand) !important;
  box-shadow: 0 0 0 3px var(--brand-glow) !important;
  outline: none !important;
}
.selectize-input {
  border-radius: var(--radius-sm) !important;
  border: 1px solid var(--line) !important;
  background: var(--surface) !important;
  font-size: 13.5px !important;
  min-height: 36px !important;
  box-shadow: none !important;
  padding: 6px 10px !important;
  transition: border-color 0.13s, box-shadow 0.13s !important;
}
.selectize-input.focus {
  border-color: var(--brand) !important;
  box-shadow: 0 0 0 3px var(--brand-glow) !important;
}
label, .control-label {
  font-size: 11px !important;
  font-weight: 600 !important;
  color: var(--muted) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.06em !important;
  margin-bottom: 5px !important;
}
.selectize-dropdown {
  border: 1px solid var(--line) !important;
  border-radius: var(--radius-sm) !important;
  box-shadow: var(--shadow-md) !important;
  font-size: 13.5px !important;
}
.selectize-dropdown .option.active { background: var(--brand-glow) !important; color: var(--brand-dark) !important; }
.selectize-dropdown .option:hover  { background: var(--surface-2) !important; }

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Buttons */
.btn {
  border-radius: var(--radius-sm) !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  padding: 7px 16px !important;
  transition: background 0.13s, box-shadow 0.13s, transform 0.13s !important;
}
.btn-primary, .btn-primary:visited {
  background: var(--brand) !important;
  border-color: var(--brand) !important;
  color: #fff !important;
  box-shadow: 0 1px 3px rgba(124,58,237,0.30) !important;
}
.btn-primary:hover {
  background: var(--brand-dark) !important;
  border-color: var(--brand-dark) !important;
  box-shadow: var(--shadow-brand) !important;
  transform: translateY(-1px) !important;
}
.btn-default {
  background: var(--surface) !important;
  border: 1px solid var(--line) !important;
  color: var(--ink-3) !important;
}
.btn-default:hover {
  background: var(--surface-2) !important;
  border-color: #cbd5e1 !important;
  color: var(--ink) !important;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• DataTables */
div.dataTables_wrapper { font-size: 13.5px !important; }

table.dataTable {
  border-collapse: separate !important;
  border-spacing: 0 !important;
  width: 100% !important;
}
table.dataTable thead th {
  background: var(--surface-2) !important;
  color: var(--muted) !important;
  border-bottom: 1px solid var(--line) !important;
  border-top: none !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.06em !important;
  padding: 10px 14px !important;
  white-space: nowrap;
}
table.dataTable thead th:first-child { border-radius: var(--radius-sm) 0 0 0; }
table.dataTable thead th:last-child  { border-radius: 0 var(--radius-sm) 0 0; }
table.dataTable tbody td {
  padding: 10px 14px !important;
  border-bottom: 1px solid var(--line-2) !important;
  color: var(--ink-2) !important;
  vertical-align: middle;
}
table.dataTable tbody tr:hover td {
  background: var(--surface-2) !important;
}
table.dataTable tbody tr:last-child td { border-bottom: none !important; }

.dataTables_wrapper .dataTables_filter input {
  border: 1px solid var(--line) !important;
  border-radius: var(--radius-sm) !important;
  padding: 5px 10px !important;
  font-size: 13px !important;
  margin-left: 6px;
}
.dataTables_wrapper .dataTables_length select {
  border: 1px solid var(--line) !important;
  border-radius: var(--radius-sm) !important;
  padding: 4px 8px !important;
  font-size: 13px !important;
}
.dataTables_wrapper .dataTables_info,
.dataTables_wrapper .dataTables_paginate { color: var(--muted) !important; font-size: 12px !important; }
.dataTables_wrapper .dataTables_paginate .paginate_button {
  border-radius: 6px !important;
  font-size: 12px !important;
  border: none !important;
  color: var(--muted) !important;
  padding: 4px 9px !important;
  margin: 0 1px !important;
}
.dataTables_wrapper .dataTables_paginate .paginate_button.current,
.dataTables_wrapper .dataTables_paginate .paginate_button.current:hover {
  background: var(--brand) !important;
  color: #fff !important;
  border: none !important;
  box-shadow: 0 2px 6px rgba(124,58,237,0.30) !important;
}
.dataTables_wrapper .dataTables_paginate .paginate_button:hover {
  background: var(--surface-3) !important;
  color: var(--ink) !important;
  border: none !important;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Page hero banner */
.page-hero {
  border-radius: var(--radius-xl);
  padding: 32px 34px 28px;
  margin-bottom: 24px;
  background: linear-gradient(125deg, #0f172a 0%, #1e3a8a 26%, #4f46e5 52%, #06b6d4 78%, #10b981 100%);
  color: #fff;
  box-shadow: 0 12px 40px rgba(37,99,235,0.26), 0 2px 8px rgba(15,23,42,0.18);
  position: relative;
  overflow: hidden;
}
.page-hero__layout {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(220px, 0.8fr);
  gap: 24px;
  align-items: start;
}
.page-hero__copy {
  min-width: 0;
}
.page-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 80% at 90% -10%, rgba(34,211,238,0.30) 0%, transparent 55%),
    radial-gradient(ellipse 40% 50% at 10% 110%, rgba(251,146,60,0.22) 0%, transparent 50%),
    radial-gradient(ellipse at top right, rgba(255,255,255,0.10) 0%, transparent 45%);
  pointer-events: none;
}
.page-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.03%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E');
  pointer-events: none;
  opacity: 0.6;
}
.page-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(255,255,255,0.72);
  margin-bottom: 10px;
}
.page-hero__title {
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.1;
  margin: 0 0 10px;
  text-shadow: 0 2px 12px rgba(0,0,0,0.18);
}
.page-hero__text {
  font-size: 14px;
  line-height: 1.65;
  color: rgba(255,255,255,0.80);
  max-width: 70ch;
  margin: 0;
}
.page-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}
.page-hero__pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.14);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.18);
  color: rgba(255,255,255,0.92);
  font-size: 12px;
  font-weight: 600;
}
.page-hero__stats {
  margin-left: auto;
  display: grid;
  gap: 10px;
  min-width: 220px;
}
.page-hero__stat {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255,255,255,0.10);
  border: 1px solid rgba(255,255,255,0.12);
  backdrop-filter: blur(8px);
}
.page-hero__stat-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(255,255,255,0.70);
  margin-bottom: 4px;
}
.page-hero__stat-value {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.05;
}
.page-hero__stat-note {
  font-size: 12px;
  color: rgba(255,255,255,0.78);
  margin-top: 4px;
}
@media (max-width: 991px) {
  .page-hero__layout {
    grid-template-columns: 1fr;
  }
  .page-hero__stats {
    margin-left: 0;
    min-width: 0;
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Login */
.login-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px 18px;
  background:
    radial-gradient(ellipse 60% 55% at 5% 10%, rgba(124,58,237,0.18) 0%, transparent 55%),
    radial-gradient(ellipse 55% 50% at 95% 90%, rgba(6,182,212,0.14) 0%, transparent 50%),
    radial-gradient(ellipse 40% 40% at 50% 50%, rgba(167,139,250,0.06) 0%, transparent 60%),
    linear-gradient(160deg, #eff6ff 0%, #f8fafc 45%, #fef3c7 100%);
}
.login-card {
  width: min(1040px, 100%);
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: 0 40px 100px rgba(15,23,42,0.20), 0 2px 4px rgba(15,23,42,0.06), 0 0 0 1px rgba(124,58,237,0.10);
  border: 1px solid rgba(226,232,240,0.60);
}
.login-hero {
  padding: 48px 40px;
  color: #fff;
  background: linear-gradient(145deg, #0f172a 0%, #1e3a8a 32%, #4338ca 62%, #7c3aed 84%, #06b6d4 100%);
  position: relative;
  overflow: hidden;
}
.login-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 70% 50% at 85% 15%, rgba(34,211,238,0.28) 0%, transparent 50%),
    radial-gradient(ellipse 50% 60% at 5% 85%, rgba(167,139,250,0.25) 0%, transparent 50%),
    radial-gradient(ellipse 30% 30% at 50% 50%, rgba(255,255,255,0.04) 0%, transparent 60%);
  pointer-events: none;
}
.login-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: url('data:image/svg+xml,%3Csvg width=%2240%22 height=%2240%22 viewBox=%220 0 40 40%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.025%22%3E%3Ccircle cx=%2220%22 cy=%2220%22 r=%221%22/%3E%3C/g%3E%3C/svg%3E');
  pointer-events: none;
}
.login-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.10);
  border: 1px solid rgba(255,255,255,0.14);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.85);
  position: relative;
  z-index: 1;
}
.login-hero h1 {
  position: relative;
  z-index: 1;
  margin: 20px 0 12px;
  font-size: 38px;
  line-height: 1.06;
  letter-spacing: -0.04em;
  font-weight: 800;
}
.login-hero p {
  position: relative;
  z-index: 1;
  color: rgba(255,255,255,0.76);
  font-size: 14.5px;
  line-height: 1.70;
  max-width: 50ch;
}
.login-points {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 10px;
  margin-top: 28px;
}
.login-point {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius);
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.09);
  color: rgba(255,255,255,0.88);
  font-size: 13.5px;
  font-weight: 500;
}
.login-panel {
  padding: 40px 36px;
  background: var(--surface);
}
.login-panel__topline {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px;
  border-radius: 999px;
  background: rgba(79,70,229,0.08);
  color: #4338ca;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.10em;
  margin-bottom: 14px;
}
.login-panel h2 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.035em;
  color: var(--ink);
  margin: 0 0 6px;
}
.login-panel .form-control,
.login-panel .selectize-input {
  border-radius: 14px !important;
}

.login-panel .btn-primary {
  background: linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%) !important;
  border: none !important;
  box-shadow: 0 10px 22px rgba(79,70,229,0.24) !important;
}

.login-panel .btn-primary:hover {
  box-shadow: 0 12px 28px rgba(79,70,229,0.30) !important;
}
.login-panel .subtle {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
  margin-bottom: 20px;
}
.login-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 20px;
}
.login-role-card {
  border: 1.5px solid var(--line);
  border-radius: var(--radius);
  padding: 14px;
  background: var(--surface-2);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.login-role-card:hover {
  border-color: var(--brand-light);
  box-shadow: 0 4px 14px rgba(124,58,237,0.12);
  transform: translateY(-1px);
}
.login-role-card.active {
  border-color: var(--brand);
  background: linear-gradient(135deg, rgba(124,58,237,0.09) 0%, rgba(34,211,238,0.05) 100%);
  box-shadow: 0 0 0 3px rgba(124,58,237,0.12), 0 4px 14px rgba(124,58,237,0.12);
}
.login-role-card .role-name {
  font-weight: 700;
  font-size: 14px;
  color: var(--ink);
  text-transform: capitalize;
  margin-bottom: 4px;
}
.login-role-card .role-note {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.login-role-card .role-chip {
  display: inline-flex;
  margin-top: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(124,58,237,0.08);
  color: var(--brand);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.login-credentials {
  padding: 14px 16px;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--line);
  margin-bottom: 16px;
}
.login-credentials strong { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
.login-credentials pre {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink-3);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  line-height: 1.7;
}
.login-error {
  margin-top: 12px;
  padding: 11px 14px;
  border-radius: var(--radius-sm);
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #be123c;
  font-size: 13px;
  font-weight: 500;
}
.login-filter-note {
  margin-top: 10px;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: rgba(34,211,238,0.06);
  border: 1px solid rgba(34,211,238,0.18);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 860px) {
  .login-card { grid-template-columns: 1fr; }
  .login-hero { padding: 32px 28px; }
  .login-panel { padding: 28px 24px; }
  .login-grid { grid-template-columns: 1fr; }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Misc polish */
.tab-content > .tab-pane { animation: fadeUp 0.22s ease; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

.alert {
  border-radius: var(--radius) !important;
  border-left-width: 4px !important;
  border-left-style: solid !important;
  border-top: none !important; border-right: none !important; border-bottom: none !important;
  font-size: 13px !important;
  font-weight: 500 !important;
}
.alert-info    { background: rgba(34,211,238,0.08) !important; color: #0e7490 !important; border-left-color: #06b6d4 !important; }
.alert-warning { background: rgba(245,158,11,0.08) !important; color: #92400e !important; border-left-color: #f59e0b !important; }
.alert-danger  { background: rgba(244,63,94,0.08) !important;  color: #be123c !important; border-left-color: #f43f5e !important; }
.alert-success { background: rgba(16,185,129,0.08) !important; color: #065f46 !important; border-left-color: #10b981 !important; }

.progress-bar {
  background: linear-gradient(90deg, var(--brand), var(--cyan)) !important;
  border-radius: 999px !important;
}
.progress { border-radius: 999px !important; background: var(--surface-3) !important; height: 7px !important; }

/* Vibrant DataTable row highlight on hover */
table.dataTable tbody tr:hover td {
  background: linear-gradient(90deg, rgba(124,58,237,0.04), rgba(6,182,212,0.03)) !important;
}
table.dataTable tbody tr.selected td {
  background: rgba(124,58,237,0.08) !important;
  color: var(--brand-dark) !important;
}

/* Recommendation cards */
.rec-card {
  padding: 14px 16px;
  border-radius: var(--radius);
  border-left: 3px solid var(--brand);
  background: linear-gradient(90deg, rgba(124,58,237,0.05) 0%, transparent 100%);
  font-size: 13.5px;
  color: var(--ink-2);
  line-height: 1.6;
  margin-bottom: 8px;
}
.rec-card.good   { border-left-color: var(--emerald); background: linear-gradient(90deg, rgba(16,185,129,0.05) 0%, transparent 100%); }
.rec-card.warn   { border-left-color: var(--amber);   background: linear-gradient(90deg, rgba(245,158,11,0.05) 0%, transparent 100%); }
.rec-card.danger { border-left-color: var(--rose);    background: linear-gradient(90deg, rgba(244,63,94,0.05) 0%, transparent 100%); }

/* Stat number emphasis inside box-body */
.stat-number {
  font-size: 36px !important;
  font-weight: 800 !important;
  letter-spacing: -0.04em !important;
  line-height: 1 !important;
  background: linear-gradient(135deg, var(--brand) 0%, var(--cyan) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
"

