# Shiny dashboard — wraps the Phase 4 analyses into 7 tabs.
#
# Run with:
#   cd r-analysis/shiny
#   Rscript -e "shiny::runApp('.', port = 3838, launch.browser = TRUE)"

user_lib <- file.path(Sys.getenv("LOCALAPPDATA"), "R", "win-library", "4.5")
if (dir.exists(user_lib) && !(user_lib %in% .libPaths())) .libPaths(c(user_lib, .libPaths()))

suppressPackageStartupMessages({
  library(shiny)
  library(shinydashboard)
  library(dplyr)
  library(ggplot2)
  library(plotly)
  library(DT)
  library(lubridate)
  library(cluster)
  library(factoextra)
})

source("../load_data.R")

# ============================================================ Theme =========

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
  # Explicit namespacing on plotly::layout / plotly::config — when httr is
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

/* ═══════════════════════════════════════════════ Design tokens */
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

/* ═══════════════════════════════════════════════ Base */
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

/* ═══════════════════════════════════════════════ Header */
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

/* ═══════════════════════════════════════════════ Sidebar */
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

/* Header chips — small gradient pills next to section headers */
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

/* ═══════════════════════════════════════════════ Content area */
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

/* ═══════════════════════════════════════════════ Cards / Boxes */
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

/* ═══════════════════════════════════════════════ KPI / Value boxes */
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

/* ═══════════════════════════════════════════════ Inputs */
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

/* ═══════════════════════════════════════════════ Buttons */
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

/* ═══════════════════════════════════════════════ DataTables */
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

/* ═══════════════════════════════════════════════ Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* ═══════════════════════════════════════════════ Page hero banner */
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

/* ═══════════════════════════════════════════════ Login */
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

/* ═══════════════════════════════════════════════ Misc polish */
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

ROLE_CREDENTIALS <- list(
  admin   = list(email = "admin@classroom.local",      password = "admin-password-change-me"),
  doctor  = list(email = "mona.saeeed@nada.edu",       password = "Doctor@123"),
  student = list(email = "seif.amr.ebeid@gmail.com",    password = "123456789"),
  parent  = list(email = "parent@classroom.local",     password = "Parent@123")
)

role_cap <- function(role) {
  if (is.null(role) || !nzchar(role)) return("")
  paste0(toupper(substr(role, 1, 1)), substr(role, 2, nchar(role)))
}

`%||%` <- function(x, y) {
  if (is.null(x)) y else x
}

recommendation_text_r <- function(attention, mark = NA_real_, grade = NA_character_, attendance_rate = NA_real_) {
  recs <- character(0)
  if (!is.na(mark) && mark < 70) {
    recs <- c(recs, "Review the last lecture notes and retry the hardest exercises.")
  }
  if (!is.na(attendance_rate) && attendance_rate < 0.8) {
    recs <- c(recs, "Improve attendance to protect your grade trend.")
  }
  if (!is.na(attention) && attention < 50) {
    recs <- c(recs, "Reduce distractions and keep the camera view centered on you.")
  } else if (!is.na(attention) && attention < 70) {
    recs <- c(recs, "Stay active: ask questions or follow along with the lecturer.")
  }
  if (!is.na(grade) && grade %in% c("D", "D-", "F")) {
    recs <- c(recs, "Schedule a quick revision plan with your doctor/teacher.")
  }
  if (length(recs) == 0) {
    recs <- c(recs, "Maintain your current habits and keep the momentum going.")
  }
  recs
}

tabs_for_role <- function(role) {
  switch(role,
    admin   = c("overview", "dist", "emotion_dist", "per_lecture", "trends", "cluster_doc", "cluster_ss", "student_search", "grades", "raw", "attendance", "attention_analysis", "cheating_detection", "recommendations_tab"),
    doctor  = c("overview", "dist", "emotion_dist", "per_lecture", "trends", "student_search", "grades", "raw", "attendance", "attention_analysis", "cheating_detection", "recommendations_tab"),
    student = c("overview", "dist", "emotion_dist", "per_lecture", "doctor_search", "grades", "raw", "attention_analysis", "recommendations_tab"),
    parent  = c("overview", "dist", "emotion_dist", "grades", "raw", "recommendations_tab"),
    character(0)
  )
}

login_ui <- function() {
  fluidPage(
    tags$head(tags$style(HTML(CUSTOM_CSS))),
    div(class = "login-shell",
      div(class = "login-card",
        div(class = "login-hero",
          div(class = "login-badge", icon("right-to-bracket"), "Role access"),
          h1("Sign in to the classroom analytics suite"),
          p("Choose your role, enter the matching demo login, and open the dashboard tailored for that audience. Admin gets the full analytics suite, doctor sees teaching analytics, student sees personal lecture views, and parent sees a simplified overview."),
          div(class = "login-points",
            div(class = "login-point", icon("shield-halved"), span("Role-based access with a tailored dashboard for each user type.")),
            div(class = "login-point", icon("chart-line"), span("Modern analytics shell with polished cards and a clear visual hierarchy.")),
            div(class = "login-point", icon("users"), span("Four login paths: admin, doctor, student, and parent."))
          )
        ),
        div(class = "login-panel",
          div(class = "login-panel__topline", "Demo access"),
          h2("Welcome back"),
          div(class = "subtle", "Pick a role and use the demo account for that portal."),
          div(class = "login-grid",
            lapply(names(ROLE_CREDENTIALS), function(role) {
              div(
                class = "login-role-card",
                `data-role` = role,
                div(class = "role-name", role_cap(role)),
                div(class = "role-note",
                    if (role == "admin")   "Full dashboard access and management tools." else
                    if (role == "doctor")  "Teaching analytics and lecture drill-downs." else
                    if (role == "student") "Personal lecture and engagement views." else
                    "Parent overview with a simplified summary."
                ),
                div(class = "role-chip", role)
              )
            })
          ),
          div(class = "login-credentials",
            strong("Demo credentials"),
            tags$pre("admin@classroom.local / admin-password-change-me\ndoctor:  mona.saeeed@nada.edu / Doctor@123\nstudent: seif.amr.ebeid@gmail.com / 123456789\nparent:  parent@classroom.local / Parent@123")
          ),
          selectInput("login_role", "Role", choices = c("admin", "doctor", "student", "parent"), selected = "doctor"),
          textInput("login_email", "Email", value = ROLE_CREDENTIALS$doctor$email, placeholder = "you@example.com"),
          passwordInput("login_password", "Password", value = ROLE_CREDENTIALS$doctor$password),
          actionButton("login_submit", "Sign in", class = "btn-primary", width = "100%"),
          div(class = "login-error", textOutput("login_error", inline = TRUE))
        )
      )
    )
  )
}

build_dashboard_ui <- function(role) {
  role_email <- ROLE_CREDENTIALS[[role]]$email %||% ""
  initials   <- toupper(substr(role_email, 1, 2))

  dashboardPage(
    skin = "blue",
    dashboardHeader(
      title = tags$span(
        tags$span(style = "font-weight:800; letter-spacing:-0.03em;", "Classroom"),
        tags$span(style = "font-weight:400; opacity:0.55; margin-left:4px;", "Analytics")
      ),
      titleWidth = 260,
      # right-side content injected as a custom dropdown-less li
      tags$li(
        class = "dropdown",
        style = "margin-left:auto;",
        tags$a(
          href = "#", class = "dropdown-toggle", `data-toggle` = "",
          style = "cursor:default; padding:0;",
          div(
            class = "navbar-custom-right",
            div(class = paste0("navbar-role-badge role-", role),
                icon(switch(role, admin="shield-halved", doctor="stethoscope", student="graduation-cap", "users")),
                role_cap(role)
            ),
            div(class = "navbar-divider"),
            div(class = "navbar-avatar", initials),
            div(class = "navbar-user-info",
                div(class = "navbar-user-name",  role_cap(role)),
                div(class = "navbar-user-email", role_email)
            )
          )
        )
      )
    ),
    dashboardSidebar(
      width = 260,
      sidebarMenu(
        tags$li(class = "header", "Analytics"),
        if ("overview" %in% tabs_for_role(role)) menuItem("Overview", tabName = "overview", icon = icon("gauge-high"), class = "sec-analytics"),
        if ("dist" %in% tabs_for_role(role)) menuItem("Distributions", tabName = "dist", icon = icon("chart-pie"), class = "sec-analytics"),
        if ("emotion_dist" %in% tabs_for_role(role)) menuItem("Emotion distribution", tabName = "emotion_dist", icon = icon("chart-column"), class = "sec-analytics"),
        if ("per_lecture" %in% tabs_for_role(role)) menuItem("Per-lecture", tabName = "per_lecture", icon = icon("chalkboard-user"), class = "sec-analytics"),
        if ("trends" %in% tabs_for_role(role)) menuItem("Engagement trends", tabName = "trends", icon = icon("chart-line"), class = "sec-analytics"),
        tags$li(class = "header", "Clustering"),
        if ("cluster_doc" %in% tabs_for_role(role)) menuItem("Lecturer clusters", tabName = "cluster_doc", icon = icon("user-tie"), class = "sec-cluster"),
        if ("cluster_ss" %in% tabs_for_role(role)) menuItem("Student × Subject", tabName = "cluster_ss", icon = icon("users"), class = "sec-cluster"),
        tags$li(class = "header", "Data"),
        if ("doctor_search" %in% tabs_for_role(role)) menuItem("Doctor search", tabName = "doctor_search", icon = icon("search"), class = "sec-data"),
        if ("student_search" %in% tabs_for_role(role)) menuItem("Student search", tabName = "student_search", icon = icon("search"), class = "sec-data"),
        if ("grades" %in% tabs_for_role(role)) menuItem("Grades", tabName = "grades", icon = icon("award"), class = "sec-data"),
        if ("raw" %in% tabs_for_role(role)) menuItem("Raw observations", tabName = "raw", icon = icon("table"), class = "sec-data"),
        tags$li(class = "header", "Insights"),
        if ("attendance" %in% tabs_for_role(role)) menuItem("Attendance", tabName = "attendance", icon = icon("clipboard-check"), class = "sec-insights"),
        if ("attention_analysis" %in% tabs_for_role(role)) menuItem("Attention Analysis", tabName = "attention_analysis", icon = icon("eye"), class = "sec-insights"),
        if ("cheating_detection" %in% tabs_for_role(role)) menuItem("Cheating Detection", tabName = "cheating_detection", icon = icon("shield-halved"), class = "sec-insights"),
        if ("recommendations_tab" %in% tabs_for_role(role)) menuItem("Recommendations", tabName = "recommendations_tab", icon = icon("lightbulb"), class = "sec-insights")
      ),
      selectInput("student_filter", "Student filter", choices = c("All students" = "__all__"), selected = "__all__"),
      div(class = "login-filter-note", "Focus the dashboard on one student at a time. Choose All students to restore the full class view."),
      hr(),
      actionButton("refresh", "↻ Refresh now", class = "btn-primary",
                   width = "calc(100% - 36px)"),
      div(style = "margin: 8px 10px 0; display:flex; align-items:center; gap:8px;",
        checkboxInput("auto_refresh", "Auto-refresh (30s)", value = TRUE),
        uiOutput("last_refresh_ui")
      ),
      actionButton("logout", "Log out", class = "btn-default",
                   width = "calc(100% - 36px)", style = "margin: 6px 18px 0; border-radius: 10px;")
    ),
    dashboardBody(
      tags$head(tags$style(HTML(CUSTOM_CSS))),
      tabItems(
        # -- Overview --
        tabItem(tabName = "overview",
          div(class = "page-hero",
            div(class = "page-hero__layout",
              div(class = "page-hero__copy",
                div(class = "page-hero__eyebrow", icon("star"), paste("Signed in as", role_cap(role))),
                div(class = "page-hero__title", "Overview"),
                p(class = "page-hero__text",
                "Track engagement, sleep rate, emotion mix, and lecturer performance from one polished dashboard. The layout now uses a calmer shell, stronger hierarchy, and softer cards so the data reads faster."),
                div(class = "page-hero__meta",
                  span(class = "page-hero__pill", icon("chart-line"), "Real-time engagement"),
                  span(class = "page-hero__pill", icon("chart-pie"), "Emotion mix"),
                  span(class = "page-hero__pill", icon("users"), "Lecturer comparisons")
                )
              ),
              div(class = "page-hero__stats",
                div(class = "page-hero__stat",
                  div(class = "page-hero__stat-label", "Dashboard state"),
                  div(class = "page-hero__stat-value", "Live + role aware"),
                  div(class = "page-hero__stat-note", "Fresh data, filtered to your access level")
                ),
                div(class = "page-hero__stat",
                  div(class = "page-hero__stat-label", "Visual style"),
                  div(class = "page-hero__stat-value", "Vibrant, calm, clear"),
                  div(class = "page-hero__stat-note", "Bright accents with readable surfaces")
                )
              )
            )
          ),
          fluidRow(
            valueBoxOutput("kpi_students",   width = 3),
            valueBoxOutput("kpi_lectures",   width = 3),
            valueBoxOutput("kpi_engagement", width = 3),
            valueBoxOutput("kpi_sleep_rate", width = 3)
          ),
          fluidRow(
            valueBoxOutput("kpi_attendance", width = 4),
            valueBoxOutput("kpi_attention",  width = 4),
            valueBoxOutput("kpi_cheat",      width = 4)
          ),
          fluidRow(
            box(title = "Recommendations", width = 12, uiOutput("recommendations_panel"))
          ),
          fluidRow(
            box(title = "Emotion mix", width = 6, plotlyOutput("overview_emotion", height = 360)),
            box(title = "Gesture mix", width = 6, plotlyOutput("overview_gesture", height = 360))
          ),
          fluidRow(
            box(title = "Engagement score distribution", width = 7,
                plotlyOutput("overview_engagement_hist", height = 340),
                footer = "How engagement scores are spread across all observations."),
            box(title = "Top lecturers · mean engagement", width = 5,
                plotlyOutput("overview_top_doctors", height = 340),
                footer = "Top 10 lecturers ranked by mean engagement.")
          )
        ),
        # -- Distributions (pies/donuts) --
        tabItem(tabName = "dist",
          h1("Distributions", tags$small("share of observations by category")),
          fluidRow(
            box(title = "Emotion share", width = 4,
                plotlyOutput("dist_emotion_pie", height = 360)),
            box(title = "State share (awake / sleeping)", width = 4,
                plotlyOutput("dist_state_pie", height = 360)),
            box(title = "Gesture share", width = 4,
                plotlyOutput("dist_gesture_pie", height = 360))
          ),
          fluidRow(
            box(title = "Engagement bands", width = 6,
                plotlyOutput("dist_engagement_bands", height = 340),
                footer = "Observations grouped into low / mid / high engagement buckets."),
            box(title = "Sleep reasons", width = 6,
                plotlyOutput("dist_sleep_reasons", height = 340),
                footer = "Why classify_sleep flagged the moment as sleeping (when it did).")
          )
        ),
        # -- Emotion distribution --
        tabItem(tabName = "emotion_dist",
          h1("Emotion distribution", tags$small("frequency across all observations")),
          fluidRow(box(title = "Emotion frequency", width = 12,
                       plotlyOutput("plot_emotion_freq", height = 420))),
          fluidRow(box(title = "Emotion proportions per lecture", width = 12,
                       plotlyOutput("plot_emotion_by_lec_stack", height = 480),
                       footer = "Stacked share of each emotion within each lecture (top 12 by volume)."))
        ),
        # -- Per-lecture --
        tabItem(tabName = "per_lecture",
          h1("Per-lecture breakdown", tags$small("drill into a single session")),
          fluidRow(
            box(width = 4, selectInput("lecture_pick", "Lecture", choices = NULL)),
            valueBoxOutput("lec_engagement", width = 4),
            valueBoxOutput("lec_sleep", width = 4)
          ),
          fluidRow(
            box(title = "Emotion breakdown", width = 6,
                plotlyOutput("plot_emotion_by_lecture", height = 360)),
            box(title = "Emotion share (donut)", width = 6,
                plotlyOutput("lec_emotion_pie", height = 360))
          ),
          fluidRow(
            box(title = "Engagement timeline (this lecture)", width = 12,
                plotlyOutput("lec_trend", height = 360),
                footer = "Mean engagement bucketed every 15 seconds.")
          )
        ),
        # -- Engagement trends --
        tabItem(tabName = "trends",
          h1("Engagement trends", tags$small("30-second buckets across lectures")),
          fluidRow(box(title = "Engagement over time", width = 12,
                       plotlyOutput("plot_trend", height = 420))),
          fluidRow(
            box(title = "Mean engagement by hour", width = 6,
                plotlyOutput("plot_hourly", height = 320)),
            box(title = "Mean engagement by day-of-week", width = 6,
                plotlyOutput("plot_dow", height = 320))
          )
        ),
        # -- Lecturer clustering --
        tabItem(tabName = "cluster_doc",
          h1("Lecturer clustering", tags$small("k-means over engagement / sleep / hand-raise rates")),
          fluidRow(box(title = "Lecturer clusters", width = 12,
                       plotOutput("plot_cluster_doc", height = 520),
                       footer = "Needs ≥ 3 lecturers in the dataset; falls back to a bar chart otherwise."))
        ),
        # -- Student × Subject clustering --
        tabItem(tabName = "cluster_ss",
          h1("Student × subject clustering", tags$small("group (student, lecture) pairs by behaviour")),
          fluidRow(box(title = "Student × subject clusters", width = 12,
                       plotOutput("plot_cluster_ss", height = 520),
                       footer = "Needs ≥ 3 (student, lecture) pairs."))
        ),
        # -- Student search --
        tabItem(tabName = "student_search",
          h1("Student search", tags$small("find any student by ID or name")),
          fluidRow(
            box(width = 8,
                textInput("student_search_q", "Search", value = "",
                          placeholder = "Type student ID or name...")),
            box(width = 4,
                div(style = "padding-top: 26px;", textOutput("student_search_summary")))
          ),
          fluidRow(
            box(title = "All matched students", width = 12,
                DTOutput("student_search_table"),
                footer = "Search covers the full students directory, not only students seen in the current emotions rows.")
          )
        ),
        # -- Doctor search --
        tabItem(tabName = "doctor_search",
          h1("Doctor search", tags$small("find doctors by name")),
          fluidRow(
            box(width = 8,
                textInput("doctor_search_q", "Search", value = "",
                          placeholder = "Type doctor name...")),
            box(width = 4,
                div(style = "padding-top: 26px;", textOutput("doctor_search_summary")))
          ),
          fluidRow(
            box(title = "Matched doctors", width = 12,
                DTOutput("doctor_search_table"),
                footer = "Search covers the full doctors directory and supports partial-name matching.")
          )
        ),
        # -- Grades tab --
        tabItem(tabName = "grades",
          h1("Grades", tags$small("marks out of 100 and letter grades")),
          fluidRow(
            box(width = 8,
                selectInput("grades_student", "Student", choices = c("All students" = "__all__"), selected = "__all__"),
                selectInput("grades_subject", "Subject", choices = c("All subjects" = "__all__"), selected = "__all__")
            ),
            box(width = 4, style = "display:flex; align-items:center; justify-content:flex-end; gap:12px;",
                downloadButton("grades_export", "Export CSV"))
          ),
          fluidRow(
            box(title = "Gradebook", width = 12, DTOutput("grades_table"))
          )
        ),
        # -- Raw data --
        tabItem(tabName = "raw",
          h1("Raw observations", tags$small("filter, sort, and export every record")),
          fluidRow(box(title = NULL, width = 12, DTOutput("raw_table")))
        ),

        # ── Tab 1: Attendance ──────────────────────────────────────────────────
        tabItem(tabName = "attendance",
          h1("Attendance", tags$small("students detected per lecture")),
          fluidRow(
            box(width = 4,
                selectInput("att_lecture_filter", "Lecture filter",
                            choices = c("All lectures" = "__all__"),
                            selected = "__all__"))
          ),
          fluidRow(
            box(title = "Detected students per lecture", width = 12,
                plotOutput("att_bar_plot", height = 380),
                footer = "A student is counted as present if they appear in at least one observation for that lecture.")
          ),
          fluidRow(
            box(title = "Attendance summary", width = 12,
                DTOutput("att_table"))
          )
        ),

        # ── Tab 2: Attention Analysis ──────────────────────────────────────────
        tabItem(tabName = "attention_analysis",
          h1("Attention Analysis", tags$small("attention scores and warnings across lectures")),
          fluidRow(
            box(width = 4,
                selectInput("attn_lecture_filter", "Lecture filter",
                            choices = c("All lectures" = "__all__"),
                            selected = "__all__"))
          ),
          fluidRow(
            box(title = "Attention score distribution", width = 6,
                plotOutput("attn_hist", height = 340),
                footer = "Histogram of attention_score across all filtered observations."),
            box(title = "Attention score by student (top 20)", width = 6,
                plotOutput("attn_boxplot", height = 340),
                footer = "Box plot of attention_score per student; top 20 students by observation count.")
          ),
          fluidRow(
            box(title = "Attention warnings per student (top 10)", width = 12,
                plotOutput("attn_warn_bar", height = 340),
                footer = "Count of records where attention_warning == TRUE, top 10 students.")
          )
        ),

        # ── Tab 3: Cheating Detection ──────────────────────────────────────────
        tabItem(tabName = "cheating_detection",
          h1("Cheating Detection", tags$small("exam-mode cheat score analysis")),
          fluidRow(
            box(width = 4,
                selectInput("cheat_student_filter", "Student",
                            choices = c("All students" = "__all__"),
                            selected = "__all__"))
          ),
          fluidRow(
            box(title = "Cheat warnings per student", width = 6,
                plotOutput("cheat_warn_bar", height = 340),
                footer = "Only exam-mode records (cheat_score > 0) are included."),
            box(title = "Cheat score over time (selected student)", width = 6,
                plotOutput("cheat_timeseries", height = 340),
                footer = "Select a specific student above to view their cheat score trajectory.")
          ),
          fluidRow(
            box(title = "Cheating summary table", width = 12,
                DTOutput("cheat_summary_table"),
                footer = "Sorted by warning_count descending. Only exam-mode records shown.")
          )
        ),

        # ── Tab 4: Recommendations ─────────────────────────────────────────────
        tabItem(tabName = "recommendations_tab",
          h1("Recommendations", tags$small("per-student aggregates and intervention suggestions")),
          fluidRow(
            box(title = "Avg attention per student", width = 12,
                plotOutput("rec_bar", height = 360),
                footer = "Students sorted by average attention score ascending (worst first).")
          ),
          fluidRow(
            box(title = "Student recommendation table", width = 12,
                DTOutput("rec_table"),
                footer = "Red < 45, amber 45-70, green > 70. Sorted worst attention first.")
          )
        )
      )
    )
  )
}

# ============================================================ UI ============

ui <- uiOutput("app_root")

ui_preview <- dashboardPage(
  skin = "blue",
  dashboardHeader(
    title = span("Classroom Emotions"),
    titleWidth = 260
  ),
  dashboardSidebar(
    width = 260,
    sidebarMenu(
      tags$li(class = "header", "Analytics"),
      menuItem("Overview",             tabName = "overview",     icon = icon("gauge-high")),
      menuItem("Distributions",        tabName = "dist",         icon = icon("chart-pie")),
      menuItem("Emotion distribution", tabName = "emotion_dist", icon = icon("chart-column")),
      menuItem("Per-lecture",          tabName = "per_lecture",  icon = icon("chalkboard-user")),
      menuItem("Engagement trends",    tabName = "trends",       icon = icon("chart-line")),
      tags$li(class = "header", "Clustering"),
      menuItem("Lecturer clusters",    tabName = "cluster_doc",  icon = icon("user-tie")),
      menuItem("Student × Subject",    tabName = "cluster_ss",   icon = icon("users")),
      tags$li(class = "header", "Data"),
      menuItem("Raw observations",     tabName = "raw",          icon = icon("table")),
      tags$li(class = "header", "Insights"),
      menuItem("Attendance",           tabName = "attendance",          icon = icon("clipboard-check")),
      menuItem("Attention Analysis",   tabName = "attention_analysis",  icon = icon("eye")),
      menuItem("Cheating Detection",   tabName = "cheating_detection",  icon = icon("shield-halved")),
      menuItem("Recommendations",      tabName = "recommendations_tab", icon = icon("lightbulb"))
    ),
    hr(),
    actionButton("refresh", "↻ Refresh data", class = "btn-primary",
                 width = "calc(100% - 36px)")
  ),
  dashboardBody(
    tags$head(tags$style(HTML(CUSTOM_CSS))),
    tabItems(
      # -- Overview --
      tabItem(tabName = "overview",
        div(class = "page-hero",
            div(class = "page-hero__eyebrow", icon("star"), "Live classroom analytics"),
            div(class = "page-hero__title", "Overview"),
            p(class = "page-hero__text",
              "Track engagement, sleep rate, emotion mix, and lecturer performance from one polished dashboard. The layout now uses a calmer shell, stronger hierarchy, and softer cards so the data reads faster."),
            div(class = "page-hero__meta",
                span(class = "page-hero__pill", icon("chart-line"), "Real-time engagement"),
                span(class = "page-hero__pill", icon("chart-pie"), "Emotion mix"),
                span(class = "page-hero__pill", icon("users"), "Lecturer comparisons")
            )
        ),
        fluidRow(
          valueBoxOutput("kpi_students",   width = 3),
          valueBoxOutput("kpi_lectures",   width = 3),
          valueBoxOutput("kpi_engagement", width = 3),
          valueBoxOutput("kpi_sleep_rate", width = 3)
        ),
        fluidRow(
          valueBoxOutput("kpi_attendance", width = 4),
          valueBoxOutput("kpi_attention",  width = 4),
          valueBoxOutput("kpi_cheat",      width = 4)
        ),
        fluidRow(
          box(title = "Recommendations", width = 12, uiOutput("recommendations_panel"))
        ),
        fluidRow(
          box(title = "Emotion mix", width = 6, plotlyOutput("overview_emotion", height = 360)),
          box(title = "Gesture mix", width = 6, plotlyOutput("overview_gesture", height = 360))
        ),
        fluidRow(
          box(title = "Engagement score distribution", width = 7,
              plotlyOutput("overview_engagement_hist", height = 340),
              footer = "How engagement scores are spread across all observations."),
          box(title = "Top lecturers · mean engagement", width = 5,
              plotlyOutput("overview_top_doctors", height = 340),
              footer = "Top 10 lecturers ranked by mean engagement.")
        )
      ),
      # -- Distributions (pies/donuts) --
      tabItem(tabName = "dist",
        h1("Distributions", tags$small("share of observations by category")),
        fluidRow(
          box(title = "Emotion share", width = 4,
              plotlyOutput("dist_emotion_pie", height = 360)),
          box(title = "State share (awake / sleeping)", width = 4,
              plotlyOutput("dist_state_pie", height = 360)),
          box(title = "Gesture share", width = 4,
              plotlyOutput("dist_gesture_pie", height = 360))
        ),
        fluidRow(
          box(title = "Engagement bands", width = 6,
              plotlyOutput("dist_engagement_bands", height = 340),
              footer = "Observations grouped into low / mid / high engagement buckets."),
          box(title = "Sleep reasons", width = 6,
              plotlyOutput("dist_sleep_reasons", height = 340),
              footer = "Why classify_sleep flagged the moment as sleeping (when it did).")
        )
      ),
      # -- Emotion distribution --
      tabItem(tabName = "emotion_dist",
        h1("Emotion distribution", tags$small("frequency across all observations")),
        fluidRow(box(title = "Emotion frequency", width = 12,
                     plotlyOutput("plot_emotion_freq", height = 420))),
        fluidRow(box(title = "Emotion proportions per lecture", width = 12,
                     plotlyOutput("plot_emotion_by_lec_stack", height = 480),
                     footer = "Stacked share of each emotion within each lecture (top 12 by volume)."))
      ),
      # -- Per-lecture --
      tabItem(tabName = "per_lecture",
        h1("Per-lecture breakdown", tags$small("drill into a single session")),
        fluidRow(
          box(width = 4, selectInput("lecture_pick", "Lecture", choices = NULL)),
          valueBoxOutput("lec_engagement", width = 4),
          valueBoxOutput("lec_sleep", width = 4)
        ),
        fluidRow(
          box(title = "Emotion breakdown", width = 6,
              plotlyOutput("plot_emotion_by_lecture", height = 360)),
          box(title = "Emotion share (donut)", width = 6,
              plotlyOutput("lec_emotion_pie", height = 360))
        ),
        fluidRow(
          box(title = "Engagement timeline (this lecture)", width = 12,
              plotlyOutput("lec_trend", height = 360),
              footer = "Mean engagement bucketed every 15 seconds.")
        )
      ),
      # -- Engagement trends --
      tabItem(tabName = "trends",
        h1("Engagement trends", tags$small("30-second buckets across lectures")),
        fluidRow(box(title = "Engagement over time", width = 12,
                     plotlyOutput("plot_trend", height = 420))),
        fluidRow(
          box(title = "Mean engagement by hour", width = 6,
              plotlyOutput("plot_hourly", height = 320)),
          box(title = "Mean engagement by day-of-week", width = 6,
              plotlyOutput("plot_dow", height = 320))
        )
      ),
      # -- Lecturer clustering --
      tabItem(tabName = "cluster_doc",
        h1("Lecturer clustering", tags$small("k-means over engagement / sleep / hand-raise rates")),
        fluidRow(box(title = "Lecturer clusters", width = 12,
                     plotOutput("plot_cluster_doc", height = 520),
                     footer = "Needs ≥ 3 lecturers in the dataset; falls back to a bar chart otherwise."))
      ),
      # -- Student × Subject clustering --
      tabItem(tabName = "cluster_ss",
        h1("Student × subject clustering", tags$small("group (student, lecture) pairs by behaviour")),
        fluidRow(box(title = "Student × subject clusters", width = 12,
                     plotOutput("plot_cluster_ss", height = 520),
                     footer = "Needs ≥ 3 (student, lecture) pairs."))
      ),
      # -- Raw data --
      tabItem(tabName = "raw",
        h1("Raw observations", tags$small("filter, sort, and export every record")),
        fluidRow(box(title = NULL, width = 12, DTOutput("raw_table")))
      ),
      # -- Attendance --
      tabItem(tabName = "attendance",
        h1("Attendance", tags$small("students detected per lecture")),
        fluidRow(box(title = "Detected students per lecture", width = 12,
                     plotOutput("att_bar_plot", height = 380))),
        fluidRow(box(title = "Attendance summary", width = 12, DTOutput("att_table")))
      ),
      # -- Attention Analysis --
      tabItem(tabName = "attention_analysis",
        h1("Attention Analysis", tags$small("attention scores and warnings")),
        fluidRow(
          box(title = "Attention score distribution", width = 6, plotOutput("attn_hist", height = 340)),
          box(title = "Attention by student (top 20)", width = 6, plotOutput("attn_boxplot", height = 340))
        ),
        fluidRow(box(title = "Attention warnings per student (top 10)", width = 12,
                     plotOutput("attn_warn_bar", height = 340)))
      ),
      # -- Cheating Detection --
      tabItem(tabName = "cheating_detection",
        h1("Cheating Detection", tags$small("exam-mode cheat score analysis")),
        fluidRow(
          box(title = "Cheat warnings per student", width = 6, plotOutput("cheat_warn_bar", height = 340)),
          box(title = "Cheat score over time", width = 6, plotOutput("cheat_timeseries", height = 340))
        ),
        fluidRow(box(title = "Cheating summary table", width = 12, DTOutput("cheat_summary_table")))
      ),
      # -- Recommendations --
      tabItem(tabName = "recommendations_tab",
        h1("Recommendations", tags$small("per-student aggregates and intervention suggestions")),
        fluidRow(box(title = "Avg attention per student", width = 12, plotOutput("rec_bar", height = 360))),
        fluidRow(box(title = "Student recommendation table", width = 12, DTOutput("rec_table")))
      )
    )
  )
)

# ============================================================ Server ========

server <- function(input, output, session) {
  auth <- reactiveValues(role = NULL, email = NULL, error = NULL)

  output$app_root <- renderUI({
    if (is.null(auth$role)) {
      login_ui()
    } else {
      build_dashboard_ui(auth$role)
    }
  })

  output$login_error <- renderText({
    if (is.null(auth$error)) {
      "Choose a role and use the matching demo credentials shown on the right."
    } else {
      auth$error
    }
  })

  observeEvent(input$login_role, {
    creds <- ROLE_CREDENTIALS[[input$login_role]]
    if (!is.null(creds)) {
      updateTextInput(session, "login_email", value = creds$email)
      updateTextInput(session, "login_password", value = creds$password)
      auth$error <- NULL
    }
  }, ignoreInit = TRUE)

  observeEvent(input$login_submit, {
    req(input$login_role)
    creds <- ROLE_CREDENTIALS[[input$login_role]]
    entered_email <- trimws(tolower(input$login_email %||% ""))
    expected_email <- trimws(tolower(creds$email))

    if (!is.null(creds) && identical(entered_email, expected_email) &&
        identical(input$login_password %||% "", creds$password)) {
      auth$role <- input$login_role
      auth$email <- input$login_email
      auth$error <- NULL
    } else {
      auth$error <- sprintf("Invalid %s login. Use the demo credentials shown on the panel.", role_cap(input$login_role))
    }
  })

  observeEvent(input$logout, {
    auth$role <- NULL
    auth$email <- NULL
    auth$error <- NULL
  })

  # ---- Auto-refresh timer (30 s) ----
  auto_timer <- reactiveTimer(30000)

  # Fires whenever either the button is clicked OR the timer ticks (if enabled).
  refresh_trigger <- reactive({
    input$refresh
    if (isTRUE(input$auto_refresh)) auto_timer()
    Sys.time()
  })

  last_refresh_time <- reactiveVal(Sys.time())
  observeEvent(refresh_trigger(), { last_refresh_time(Sys.time()) }, ignoreInit = FALSE)

  output$last_refresh_ui <- renderUI({
    t <- last_refresh_time()
    span(style = "font-size:10px; color:#94a3b8;",
         format(t, "%H:%M:%S"))
  })

  observe({
    refresh_trigger()
    df <- load_emotions() |> attach_doctor_id()
    students <- sort(unique(df$student_id))
    choices <- c("All students" = "__all__", stats::setNames(students, students))
    selected <- if (!is.null(input$student_filter) && input$student_filter %in% names(choices)) {
      input$student_filter
    } else {
      "__all__"
    }
    updateSelectInput(session, "student_filter", choices = choices, selected = selected)
  })

  data_r <- reactive({
    refresh_trigger()
    df <- load_emotions() |> attach_doctor_id()
    if (!is.null(input$student_filter) && input$student_filter != "__all__") {
      df <- df |> filter(student_id == input$student_filter)
    }
    df
  })

  lecture_labels_r <- reactive({
    refresh_trigger()
    load_lecture_labels()
  })

  students_directory_r <- reactive({
    refresh_trigger()
    load_students_directory()
  })

  doctors_directory_r <- reactive({
    refresh_trigger()
    load_doctors_directory()
  })

  observe({
    df <- data_r()
    seen <- unique(df$lecture_id)
    labels <- lecture_labels_r()

    if (!is.null(labels) && length(labels) > 0) {
      # Keep only lectures that have observations (otherwise the picker shows
      # 240 entries you can't analyse). Fall back to all if intersection empty.
      keep <- labels[labels %in% seen]
      if (length(keep) == 0) keep <- labels
      choices <- keep
    } else {
      # Firestore unavailable — fall back to bare ids.
      choices <- sort(seen)
    }
    selected <- if (length(choices) > 0) unname(choices)[1] else NULL
    updateSelectInput(session, "lecture_pick",
                      choices = choices,
                      selected = selected)
  })

  # ---------- KPI boxes (Overview) ----------
  output$kpi_students <- renderValueBox({
    valueBox(length(unique(data_r()$student_id)),
             "students seen", icon = icon("user-graduate"), color = "aqua")
  })
  output$kpi_lectures <- renderValueBox({
    valueBox(length(unique(data_r()$lecture_id)),
             "lectures recorded", icon = icon("chalkboard"), color = "purple")
  })
  output$kpi_engagement <- renderValueBox({
    e <- mean(data_r()$engagement_score, na.rm = TRUE)
    if (!is.finite(e)) e <- 0
    valueBox(sprintf("%.2f", e), "mean engagement", icon = icon("bolt"),
             color = if (e >= 0.5) "green" else if (e >= 0.3) "yellow" else "red")
  })
  output$kpi_sleep_rate <- renderValueBox({
    r <- mean(data_r()$state == "sleeping", na.rm = TRUE)
    if (!is.finite(r)) r <- 0
    valueBox(sprintf("%.1f%%", r * 100), "sleep rate", icon = icon("bed"),
             color = if (r < 0.05) "green" else if (r < 0.15) "yellow" else "red")
  })
  output$kpi_attendance <- renderValueBox({
    df <- data_r()
    if (nrow(df) == 0) {
      return(valueBox("0%", "attendance", icon = icon("user-check"), color = "aqua"))
    }
    seen_recent <- df |> filter(timestamp >= max(timestamp, na.rm = TRUE) - minutes(5))
    rate <- if (length(unique(df$student_id)) > 0) length(unique(seen_recent$student_id)) / length(unique(df$student_id)) else 0
    valueBox(sprintf("%.1f%%", rate * 100), "attendance", icon = icon("user-check"),
             color = if (rate >= 0.8) "green" else if (rate >= 0.6) "yellow" else "red")
  })
  output$kpi_attention <- renderValueBox({
    df <- data_r()
    a <- mean(as.numeric(df$attention_score), na.rm = TRUE)
    if (!is.finite(a)) a <- 0
    valueBox(sprintf("%.1f", a), "attention", icon = icon("eye"),
             color = if (a >= 70) "green" else if (a >= 50) "yellow" else "red")
  })
  output$kpi_cheat <- renderValueBox({
    df <- data_r()
    c <- sum(as.numeric(df$cheat_warning) > 0 | as.numeric(df$cheat_score) >= 60, na.rm = TRUE)
    valueBox(as.character(c), "cheat alerts", icon = icon("shield-halved"),
             color = if (c == 0) "green" else "red")
  })

  output$recommendations_panel <- renderUI({
    df <- data_r()
    grades <- grades_r()
    sid <- if (!is.null(input$student_filter) && input$student_filter != "__all__") input$student_filter else NULL
    if (is.null(sid) && nrow(df) > 0) sid <- df$student_id[[1]]
    if (is.null(sid) || !nzchar(sid)) return(div(class = "text-muted", "No student selected."))

    s_df <- df |> filter(student_id == sid)
    g_df <- grades |> filter(student_id == sid)
    attention <- mean(as.numeric(s_df$attention_score), na.rm = TRUE)
    mark <- if (nrow(g_df) > 0) mean(as.numeric(g_df$mark), na.rm = TRUE) else NA_real_
    grade <- if (nrow(g_df) > 0 && "grade" %in% names(g_df)) as.character(g_df$grade[[1]]) else NA_character_
    attendance_rate <- if (nrow(df) > 0) length(unique(s_df$lecture_id)) / length(unique(df$lecture_id)) else NA_real_
    recs <- recommendation_text_r(attention = attention, mark = mark, grade = grade, attendance_rate = attendance_rate)
    tags$ul(
      class = "space-y-2 pl-5",
      lapply(recs, function(item) tags$li(class = "text-sm text-slate-700", item))
    )
  })

  # ---------- Overview mix charts ----------
  output$overview_emotion <- renderPlotly({
    df <- data_r() |> count(emotion, sort = TRUE)
    plot_ly(df, x = ~reorder(emotion, -n), y = ~n, type = "bar",
            marker = list(color = PALETTE$primary,
                          line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = ""), yaxis = list(title = "observations")) |>
      style_plotly()
  })
  output$overview_gesture <- renderPlotly({
    df <- data_r() |> count(gesture, sort = TRUE)
    plot_ly(df, x = ~reorder(gesture, -n), y = ~n, type = "bar",
            marker = list(color = PALETTE$accent,
                          line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = ""), yaxis = list(title = "observations")) |>
      style_plotly()
  })

  # ---------- Emotion distribution tab ----------
  output$plot_emotion_freq <- renderPlotly({
    df <- data_r() |> count(emotion, sort = TRUE) |>
      mutate(pct = n / sum(n))
    plot_ly(df, x = ~reorder(emotion, -n), y = ~n, type = "bar",
            text = ~sprintf("%d  (%.1f%%)", n, pct * 100),
            textposition = "outside",
            textfont = list(color = PALETTE$ink_soft, size = 12),
            marker = list(color = PALETTE$primary, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = ""), yaxis = list(title = "observations")) |>
      style_plotly()
  })

  # ---------- Per-lecture tab ----------
  lec_df <- reactive({
    req(input$lecture_pick)
    data_r() |> filter(lecture_id == input$lecture_pick)
  })
  output$lec_engagement <- renderValueBox({
    e <- mean(lec_df()$engagement_score, na.rm = TRUE)
    valueBox(sprintf("%.2f", e), "engagement (this lecture)", icon = icon("bolt"),
             color = if (e >= 0.5) "green" else if (e >= 0.3) "yellow" else "red")
  })
  output$lec_sleep <- renderValueBox({
    r <- mean(lec_df()$state == "sleeping", na.rm = TRUE)
    valueBox(sprintf("%.1f%%", r * 100), "sleep rate (this lecture)", icon = icon("bed"),
             color = if (r < 0.05) "green" else if (r < 0.15) "yellow" else "red")
  })
  output$plot_emotion_by_lecture <- renderPlotly({
    df <- lec_df() |> count(emotion, sort = TRUE)
    plot_ly(df, x = ~reorder(emotion, -n), y = ~n, type = "bar",
            marker = list(color = PALETTE$good, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = ""), yaxis = list(title = "observations")) |>
      style_plotly()
  })

  # ---------- Trends tab ----------
  output$plot_trend <- renderPlotly({
    b <- data_r() |>
      mutate(bucket = lubridate::floor_date(timestamp, "30 seconds")) |>
      group_by(lecture_id, bucket) |>
      summarise(engagement = mean(engagement_score, na.rm = TRUE), .groups = "drop")
    plot_ly(b, x = ~bucket, y = ~engagement, color = ~lecture_id,
            colors = CHART_PALETTE,
            type = "scatter", mode = "lines+markers",
            line = list(width = 2.5),
            marker = list(size = 6)) |>
      plotly::layout(xaxis = list(title = "time"),
                     yaxis = list(title = "mean engagement")) |>
      style_plotly()
  })

  output$plot_hourly <- renderPlotly({
    df <- data_r() |>
      mutate(hour = lubridate::hour(timestamp)) |>
      group_by(hour) |>
      summarise(engagement = mean(engagement_score, na.rm = TRUE),
                n = dplyr::n(), .groups = "drop")
    plot_ly(df, x = ~hour, y = ~engagement, type = "bar",
            text = ~sprintf("n=%d", n),
            marker = list(color = PALETTE$primary, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "hour of day"),
                     yaxis = list(title = "mean engagement", range = c(0, 1))) |>
      style_plotly()
  })

  output$plot_dow <- renderPlotly({
    dow_levels <- c("Mon","Tue","Wed","Thu","Fri","Sat","Sun")
    df <- data_r() |>
      mutate(dow = factor(format(timestamp, "%a"), levels = dow_levels)) |>
      filter(!is.na(dow)) |>
      group_by(dow) |>
      summarise(engagement = mean(engagement_score, na.rm = TRUE),
                n = dplyr::n(), .groups = "drop")
    plot_ly(df, x = ~dow, y = ~engagement, type = "bar",
            text = ~sprintf("n=%d", n),
            marker = list(color = PALETTE$accent, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = ""),
                     yaxis = list(title = "mean engagement", range = c(0, 1))) |>
      style_plotly()
  })

  # ---------- Distributions tab (pies/donuts) ----------
  .pie <- function(df, label_col, value_col, palette = CHART_PALETTE) {
    plot_ly(df,
            labels = stats::as.formula(paste0("~", label_col)),
            values = stats::as.formula(paste0("~", value_col)),
            type   = "pie",
            hole   = 0.55,
            sort   = FALSE,
            textinfo = "label+percent",
            insidetextorientation = "radial",
            marker = list(colors = palette,
                          line = list(color = "#ffffff", width = 1))) |>
      plotly::layout(showlegend = TRUE) |>
      style_plotly()
  }

  output$dist_emotion_pie <- renderPlotly({
    df <- data_r() |> count(emotion, sort = TRUE)
    .pie(df, "emotion", "n")
  })
  output$dist_state_pie <- renderPlotly({
    df <- data_r() |> count(state, sort = TRUE)
    .pie(df, "state", "n",
         palette = c("awake" = PALETTE$good, "sleeping" = PALETTE$bad))
  })
  output$dist_gesture_pie <- renderPlotly({
    df <- data_r() |> count(gesture, sort = TRUE)
    .pie(df, "gesture", "n")
  })

  output$dist_engagement_bands <- renderPlotly({
    df <- data_r() |>
      mutate(band = case_when(
        engagement_score < 0.3 ~ "low (<0.3)",
        engagement_score < 0.5 ~ "mid (0.3–0.5)",
        engagement_score < 0.7 ~ "good (0.5–0.7)",
        TRUE                   ~ "high (≥0.7)"
      )) |>
      mutate(band = factor(band, levels = c("low (<0.3)","mid (0.3–0.5)","good (0.5–0.7)","high (≥0.7)"))) |>
      count(band) |> arrange(band)
    plot_ly(df, x = ~band, y = ~n, type = "bar",
            marker = list(color = c("#ef4444","#f59e0b","#10b981","#0ea5e9"),
                          line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = ""),
                     yaxis = list(title = "observations")) |>
      style_plotly()
  })

  output$dist_sleep_reasons <- renderPlotly({
    df <- data_r() |>
      filter(state == "sleeping", !is.na(sleep_reason)) |>
      count(sleep_reason, sort = TRUE)
    if (nrow(df) == 0) {
      plotly_empty() |> plotly::layout(annotations = list(
        list(text = "No sleeping observations.",
             showarrow = FALSE, x = 0.5, y = 0.5, xref = "paper", yref = "paper",
             font = list(size = 14, color = PALETTE$ink_soft))))
    } else {
      .pie(df, "sleep_reason", "n")
    }
  })

  # ---------- Overview extras: histogram + top-doctor bar ----------
  output$overview_engagement_hist <- renderPlotly({
    df <- data_r() |> filter(!is.na(engagement_score))
    plot_ly(df, x = ~engagement_score, type = "histogram",
            xbins = list(start = 0, end = 1, size = 0.05),
            marker = list(color = PALETTE$primary, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "engagement_score", range = c(0, 1)),
                     yaxis = list(title = "observations"),
                     bargap = 0.05) |>
      style_plotly()
  })

  output$overview_top_doctors <- renderPlotly({
    df <- data_r() |>
      group_by(doctor_id) |>
      summarise(mean_engagement = mean(engagement_score, na.rm = TRUE),
                n = dplyr::n(), .groups = "drop") |>
      arrange(desc(mean_engagement)) |>
      head(10)
    plot_ly(df, y = ~reorder(doctor_id, mean_engagement),
            x = ~mean_engagement, type = "bar", orientation = "h",
            text = ~sprintf("%.2f (n=%d)", mean_engagement, n),
            textposition = "outside",
            marker = list(color = PALETTE$accent, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "mean engagement", range = c(0, 1)),
                     yaxis = list(title = "")) |>
      style_plotly()
  })

  # ---------- Emotion distribution: stacked proportions per lecture ----------
  output$plot_emotion_by_lec_stack <- renderPlotly({
    top_lectures <- data_r() |>
      count(lecture_id, sort = TRUE) |>
      head(12) |>
      pull(lecture_id)
    df <- data_r() |>
      filter(lecture_id %in% top_lectures) |>
      count(lecture_id, emotion) |>
      group_by(lecture_id) |>
      mutate(prop = n / sum(n)) |>
      ungroup()
    plot_ly(df, x = ~lecture_id, y = ~prop, color = ~emotion,
            colors = CHART_PALETTE, type = "bar") |>
      plotly::layout(barmode = "stack",
                     xaxis = list(title = "", tickangle = -30),
                     yaxis = list(title = "share", tickformat = ",.0%")) |>
      style_plotly()
  })

  # ---------- Per-lecture extras: emotion donut + engagement timeline ----------
  output$lec_emotion_pie <- renderPlotly({
    df <- lec_df() |> count(emotion, sort = TRUE)
    if (nrow(df) == 0) {
      plotly_empty() |> plotly::layout(annotations = list(
        list(text = "No data for this lecture.",
             showarrow = FALSE, x = 0.5, y = 0.5, xref = "paper", yref = "paper",
             font = list(size = 14, color = PALETTE$ink_soft))))
    } else {
      .pie(df, "emotion", "n")
    }
  })

  output$lec_trend <- renderPlotly({
    df <- lec_df()
    if (nrow(df) == 0) {
      return(plotly_empty() |> plotly::layout(annotations = list(
        list(text = "No data for this lecture.",
             showarrow = FALSE, x = 0.5, y = 0.5, xref = "paper", yref = "paper",
             font = list(size = 14, color = PALETTE$ink_soft)))))
    }
    b <- df |>
      mutate(bucket = lubridate::floor_date(timestamp, "15 seconds")) |>
      group_by(bucket) |>
      summarise(engagement = mean(engagement_score, na.rm = TRUE),
                sleep_rate = mean(state == "sleeping", na.rm = TRUE),
                .groups = "drop")
    plot_ly(b, x = ~bucket) |>
      plotly::add_trace(y = ~engagement, type = "scatter", mode = "lines+markers",
                        line = list(color = PALETTE$primary, width = 2.5),
                        marker = list(size = 5, color = PALETTE$primary),
                        name = "engagement") |>
      plotly::add_trace(y = ~sleep_rate, type = "scatter", mode = "lines",
                        line = list(color = PALETTE$bad, width = 2, dash = "dot"),
                        name = "sleep rate") |>
      plotly::layout(xaxis = list(title = "time"),
                     yaxis = list(title = "rate", range = c(0, 1))) |>
      style_plotly()
  })

  # ---------- Lecturer clustering tab ----------
  output$plot_cluster_doc <- renderPlot({
    df <- data_r()
    features <- df |>
      group_by(doctor_id) |>
      summarise(mean_engagement = mean(engagement_score, na.rm = TRUE),
                sleep_rate = mean(state == "sleeping", na.rm = TRUE),
                hand_rate  = mean(gesture == "hand_raised", na.rm = TRUE),
                .groups = "drop")
    if (nrow(features) < 3) {
      ggplot(features, aes(x = reorder(doctor_id, -mean_engagement),
                           y = mean_engagement, fill = doctor_id)) +
        geom_col(show.legend = FALSE, width = 0.6) +
        scale_fill_manual(values = CHART_PALETTE) +
        labs(title = "Need ≥ 3 lecturers to cluster",
             subtitle = "Showing engagement bar instead",
             x = NULL, y = "mean engagement") +
        theme_classroom()
    } else {
      X <- features |> select(-doctor_id) |> scale()
      k <- min(3, nrow(X) - 1)
      km <- kmeans(X, centers = k, nstart = 10)
      factoextra::fviz_cluster(km, data = X, labelsize = 11,
                               geom = c("point", "text"),
                               palette = CHART_PALETTE[seq_len(k)],
                               ggtheme = theme_classroom(),
                               main = sprintf("Lecturer clusters  (k = %d)", k))
    }
  })

  # ---------- Student × Subject clustering tab ----------
  output$plot_cluster_ss <- renderPlot({
    pairs <- data_r() |>
      group_by(student_id, lecture_id) |>
      summarise(mean_engagement = mean(engagement_score, na.rm = TRUE),
                sleep_rate = mean(state == "sleeping", na.rm = TRUE),
                hand_rate  = mean(gesture == "hand_raised", na.rm = TRUE),
                .groups = "drop") |>
      mutate(label = paste(student_id, lecture_id, sep = "|"))
    if (nrow(pairs) < 3) {
      ggplot(pairs, aes(x = label, y = mean_engagement, fill = label)) +
        geom_col(show.legend = FALSE, width = 0.6) +
        scale_fill_manual(values = CHART_PALETTE) +
        labs(title = "Need ≥ 3 (student, lecture) pairs",
             x = NULL, y = "mean engagement") +
        theme_classroom() +
        theme(axis.text.x = element_text(angle = 30, hjust = 1))
    } else {
      X <- pairs |> select(mean_engagement, sleep_rate, hand_rate) |> scale()
      k <- min(3, nrow(X) - 1)
      km <- kmeans(X, centers = k, nstart = 10)
      factoextra::fviz_cluster(km, data = X, labelsize = 10,
                               geom = c("point", "text"),
                               palette = CHART_PALETTE[seq_len(k)],
                               ggtheme = theme_classroom(),
                               main = sprintf("Student × subject clusters  (k = %d)", k))
    }
  })

  # ---------- Raw data tab ----------
  output$raw_table <- renderDT({
    datatable(data_r(), filter = "top", rownames = FALSE,
              class = "stripe hover row-border",
              options = list(pageLength = 25, scrollX = TRUE,
                             dom = "lftipr",
                             language = list(search = "",
                                             searchPlaceholder = "Search…")))
  })

  # ---------- Grades tab ----------
  grades_r <- reactive({
    refresh_trigger()
    sid <- NULL
    # prefer explicit grades_student picker, fall back to the main student_filter
    if (!is.null(input$grades_student) && input$grades_student != "__all__") {
      sid <- input$grades_student
    } else if (!is.null(input$student_filter) && input$student_filter != "__all__") {
      sid <- input$student_filter
    }

    df <- tryCatch({
      load_grades(student_id = sid)
    }, error = function(e) {
      message(sprintf("grades_r: %s", conditionMessage(e)))
      dplyr::tibble()
    })

    # Subject filter from picker
    if (!is.null(input$grades_subject) && input$grades_subject != "__all__") {
      subq <- input$grades_subject
      df <- df |> filter((subject_id %||% "") == subq | (subject_name %||% "") == subq)
    }

    df
  })

  # populate student/subject pickers when data changes
  observe({
    df <- grades_r()
    studs <- students_directory_r()
    stud_choices <- c("All students" = "__all__")
    if (nrow(studs) > 0) {
      sid <- studs$student_id %||% studs$id
      stud_choices <- c(stud_choices, stats::setNames(as.character(sid), as.character(studs$name %||% sid)))
    } else if (nrow(df) > 0) {
      # fallback to students seen in grades
      sids <- unique(as.character(df$student_id))
      stud_choices <- c(stud_choices, stats::setNames(sids, sids))
    }
    updateSelectInput(session, "grades_student", choices = stud_choices, selected = input$grades_student %||% "__all__")

    subj_choices <- c("All subjects" = "__all__")
    if (nrow(df) > 0 && "subject_id" %in% names(df)) {
      sids <- unique(na.omit(as.character(df$subject_id)))
      snames <- unique(na.omit(as.character(df$subject_name)))
      # prefer subject_id values if present, else subject_name
      if (length(sids) > 0) subj_choices <- c(subj_choices, stats::setNames(sids, sids))
      else if (length(snames) > 0) subj_choices <- c(subj_choices, stats::setNames(snames, snames))
    }
    updateSelectInput(session, "grades_subject", choices = subj_choices, selected = input$grades_subject %||% "__all__")
  })

  output$grades_table <- renderDT({
    df <- grades_r()
    if (nrow(df) == 0) {
      return(datatable(data.frame(Message = "No grades found."),
                       rownames = FALSE,
                       options = list(dom = "t", paging = FALSE)))
    }
    # prefer showing a small set of friendly columns and add a details link
    display <- df
    if ("subject_code" %in% names(display)) {
      display <- display |> dplyr::select(student_id, student_name, subject_code, subject_name, doctor_name, mark, grade, observations)
    } else if ("subject_name" %in% names(display)) {
      display <- display |> dplyr::select(student_id, student_name, subject_name, doctor_name, mark, grade, observations)
    }
    # Add a details column with a placeholder link (can be wired to JS/modal later)
    display$details <- sprintf("<a href=\"#\" class=\"btn btn-xs\">Details</a>")

    datatable(display, filter = "top", rownames = FALSE,
              class = "stripe hover row-border",
              escape = FALSE,
              options = list(pageLength = 25, scrollX = TRUE,
                             dom = "lftipr",
                             language = list(search = "",
                                             searchPlaceholder = "Search…")))
  })

  output$grades_export <- downloadHandler(
    filename = function() paste0("grades-", Sys.Date(), ".csv"),
    content = function(file) {
      df <- grades_r()
      write.csv(df, file, row.names = FALSE, na = "")
    }
  )

  output$student_search_summary <- renderText({
    role <- auth$role %||% ""
    if (!(role %in% c("admin", "doctor"))) return("Student search is available for admin and doctor roles.")

    all_students <- students_directory_r()
    q <- trimws(input$student_search_q %||% "")
    if (nrow(all_students) == 0) return("No student records available.")

    if (!nzchar(q)) {
      return(sprintf("Showing all %d students.", nrow(all_students)))
    }
    sid <- all_students$student_id %||% all_students$id
    hay <- paste(as.character(sid),
                 as.character(all_students$name %||% ""),
                 as.character(all_students$email %||% ""))
    n <- sum(grepl(q, hay, ignore.case = TRUE, perl = TRUE), na.rm = TRUE)
    sprintf("%d match(es) for \"%s\".", n, q)
  })

  output$student_search_table <- renderDT({
    req(auth$role %in% c("admin", "doctor"))
    df <- students_directory_r()
    if (nrow(df) == 0) {
      return(datatable(data.frame(Message = "No students found."),
                       rownames = FALSE,
                       options = list(dom = "t", paging = FALSE)))
    }

    sid <- df$student_id %||% df$id
    view <- dplyr::tibble(
      student_id = as.character(sid),
      name = as.character(df$name %||% ""),
      email = as.character(df$email %||% ""),
      active = ifelse(is.na(df$active) | df$active != FALSE, "active", "inactive")
    )

    q <- trimws(input$student_search_q %||% "")
    if (nzchar(q)) {
      hay <- paste(view$student_id, view$name, view$email)
      view <- view[grepl(q, hay, ignore.case = TRUE, perl = TRUE), , drop = FALSE]
    }

    datatable(
      view,
      filter = "none",
      rownames = FALSE,
      class = "stripe hover row-border",
      options = list(pageLength = 25, scrollX = TRUE,
                     dom = "lftipr",
                     language = list(search = "",
                                     searchPlaceholder = "Search students..."))
    )
  })

  output$doctor_search_summary <- renderText({
    role <- auth$role %||% ""
    if (role != "student") return("Doctor search is available for student role.")

    all_doctors <- doctors_directory_r()
    q <- trimws(input$doctor_search_q %||% "")
    if (nrow(all_doctors) == 0) return("No doctor records available.")

    did <- all_doctors$doctor_id %||% all_doctors$id
    hay <- paste(as.character(did),
                 as.character(all_doctors$name %||% ""),
                 as.character(all_doctors$department %||% ""))

    if (!nzchar(q)) {
      return(sprintf("Showing all %d doctors.", nrow(all_doctors)))
    }
    n <- sum(grepl(q, hay, ignore.case = TRUE, perl = TRUE), na.rm = TRUE)
    sprintf("%d match(es) for \"%s\".", n, q)
  })

  output$doctor_search_table <- renderDT({
    req(auth$role == "student")
    df <- doctors_directory_r()
    if (nrow(df) == 0) {
      return(datatable(data.frame(Message = "No doctors found."),
                       rownames = FALSE,
                       options = list(dom = "t", paging = FALSE)))
    }

    did <- df$doctor_id %||% df$id
    view <- dplyr::tibble(
      doctor_id = as.character(did),
      name = as.character(df$name %||% ""),
      department = as.character(df$department %||% ""),
      active = ifelse(is.na(df$active) | df$active != FALSE, "active", "inactive")
    )

    q <- trimws(input$doctor_search_q %||% "")
    if (nzchar(q)) {
      hay <- paste(view$doctor_id, view$name, view$department)
      view <- view[grepl(q, hay, ignore.case = TRUE, perl = TRUE), , drop = FALSE]
    }

    datatable(
      view,
      filter = "none",
      rownames = FALSE,
      class = "stripe hover row-border",
      options = list(pageLength = 25, scrollX = TRUE,
                     dom = "lftipr",
                     language = list(search = "",
                                     searchPlaceholder = "Search doctors..."))
    )
  })

  # ══════════════════════════════════════════════════════════════════════════════
  # Tab 1 — Attendance
  # ══════════════════════════════════════════════════════════════════════════════

  # Populate the lecture filter selector for the Attendance tab
  observe({
    df <- data_r()
    lecs <- sort(unique(df$lecture_id))
    choices <- c("All lectures" = "__all__", stats::setNames(lecs, lecs))
    updateSelectInput(session, "att_lecture_filter", choices = choices,
                      selected = input$att_lecture_filter %||% "__all__")
  })

  att_data_r <- reactive({
    df <- data_r()
    if (!is.null(input$att_lecture_filter) && input$att_lecture_filter != "__all__") {
      df <- df |> filter(lecture_id == input$att_lecture_filter)
    }
    df
  })

  att_summary_r <- reactive({
    att_data_r() |>
      group_by(lecture_id) |>
      summarise(
        students_detected  = n_distinct(student_id),
        total_observations = dplyr::n(),
        .groups = "drop"
      ) |>
      arrange(lecture_id)
  })

  output$att_bar_plot <- renderPlot({
    df <- att_summary_r()
    if (nrow(df) == 0) {
      return(ggplot() +
               annotate("text", x = 0.5, y = 0.5, label = "No data available.",
                        size = 5, colour = PALETTE$ink_soft) +
               theme_void())
    }
    ggplot(df, aes(x = reorder(lecture_id, students_detected),
                   y = students_detected,
                   fill = students_detected)) +
      geom_col(width = 0.65, show.legend = FALSE) +
      geom_text(aes(label = students_detected), hjust = -0.25, size = 3.8,
                colour = PALETTE$ink_soft) +
      scale_fill_gradient(low = PALETTE$accent, high = PALETTE$primary) +
      coord_flip() +
      expand_limits(y = max(df$students_detected, na.rm = TRUE) * 1.12) +
      labs(title = "Students detected per lecture",
           x = NULL, y = "Students detected") +
      theme_classroom()
  })

  output$att_table <- renderDT({
    df <- att_summary_r()
    if (nrow(df) == 0) {
      return(datatable(data.frame(Message = "No data available."),
                       rownames = FALSE,
                       options = list(dom = "t", paging = FALSE)))
    }
    names(df) <- c("Lecture ID", "Students Detected", "Total Observations")
    datatable(df, rownames = FALSE, class = "stripe hover row-border",
              options = list(pageLength = 20, scrollX = TRUE,
                             dom = "lftipr",
                             language = list(search = "",
                                             searchPlaceholder = "Search...")))
  })

  # ══════════════════════════════════════════════════════════════════════════════
  # Tab 2 — Attention Analysis
  # ══════════════════════════════════════════════════════════════════════════════

  observe({
    df <- data_r()
    lecs <- sort(unique(df$lecture_id))
    choices <- c("All lectures" = "__all__", stats::setNames(lecs, lecs))
    updateSelectInput(session, "attn_lecture_filter", choices = choices,
                      selected = input$attn_lecture_filter %||% "__all__")
  })

  attn_data_r <- reactive({
    df <- data_r() |>
      mutate(attention_score = suppressWarnings(as.numeric(attention_score)),
             attention_warning = suppressWarnings(as.logical(attention_warning)))
    if (!is.null(input$attn_lecture_filter) && input$attn_lecture_filter != "__all__") {
      df <- df |> filter(lecture_id == input$attn_lecture_filter)
    }
    df
  })

  output$attn_hist <- renderPlot({
    df <- attn_data_r() |> filter(!is.na(attention_score))
    if (nrow(df) == 0) {
      return(ggplot() +
               annotate("text", x = 0.5, y = 0.5, label = "No attention data.",
                        size = 5, colour = PALETTE$ink_soft) +
               theme_void())
    }
    ggplot(df, aes(x = attention_score)) +
      geom_histogram(bins = 30, fill = PALETTE$primary, colour = "white", linewidth = 0.3) +
      labs(title = "Attention score distribution",
           x = "Attention score", y = "Observations") +
      theme_classroom()
  })

  output$attn_boxplot <- renderPlot({
    df <- attn_data_r() |> filter(!is.na(attention_score))
    if (nrow(df) == 0) {
      return(ggplot() +
               annotate("text", x = 0.5, y = 0.5, label = "No attention data.",
                        size = 5, colour = PALETTE$ink_soft) +
               theme_void())
    }
    top20 <- df |>
      count(student_id, sort = TRUE) |>
      head(20) |>
      pull(student_id)
    df20 <- df |> filter(student_id %in% top20)
    ggplot(df20, aes(x = reorder(student_id, attention_score, FUN = median),
                     y = attention_score,
                     fill = student_id)) +
      geom_boxplot(show.legend = FALSE, outlier.size = 1.2,
                   outlier.colour = PALETTE$bad, width = 0.65) +
      scale_fill_manual(values = rep(CHART_PALETTE, length.out = length(top20))) +
      coord_flip() +
      labs(title = "Attention score by student (top 20)",
           x = NULL, y = "Attention score") +
      theme_classroom()
  })

  output$attn_warn_bar <- renderPlot({
    df <- attn_data_r() |>
      filter(!is.na(attention_warning), isTRUE(attention_warning) | attention_warning == TRUE) |>
      count(student_id, sort = TRUE) |>
      head(10)
    if (nrow(df) == 0) {
      return(ggplot() +
               annotate("text", x = 0.5, y = 0.5,
                        label = "No attention warnings in current filter.",
                        size = 5, colour = PALETTE$ink_soft) +
               theme_void())
    }
    ggplot(df, aes(x = reorder(student_id, n), y = n)) +
      geom_col(fill = PALETTE$warn, width = 0.65) +
      geom_text(aes(label = n), hjust = -0.25, size = 3.8, colour = PALETTE$ink_soft) +
      coord_flip() +
      expand_limits(y = max(df$n, na.rm = TRUE) * 1.15) +
      labs(title = "Attention warnings per student (top 10)",
           x = NULL, y = "Warning count") +
      theme_classroom()
  })

  # ══════════════════════════════════════════════════════════════════════════════
  # Tab 3 — Cheating Detection
  # ══════════════════════════════════════════════════════════════════════════════

  cheat_base_r <- reactive({
    data_r() |>
      mutate(
        cheat_score   = suppressWarnings(as.numeric(cheat_score)),
        cheat_warning = suppressWarnings(as.logical(cheat_warning))
      ) |>
      filter(!is.na(cheat_score), cheat_score > 0)
  })

  observe({
    df <- cheat_base_r()
    studs <- sort(unique(df$student_id))
    choices <- c("All students" = "__all__", stats::setNames(studs, studs))
    updateSelectInput(session, "cheat_student_filter", choices = choices,
                      selected = input$cheat_student_filter %||% "__all__")
  })

  output$cheat_warn_bar <- renderPlot({
    df <- cheat_base_r() |>
      filter(!is.na(cheat_warning), isTRUE(cheat_warning) | cheat_warning == TRUE) |>
      count(student_id, sort = TRUE)
    if (nrow(df) == 0) {
      return(ggplot() +
               annotate("text", x = 0.5, y = 0.5,
                        label = "No cheat warnings in exam-mode records.",
                        size = 5, colour = PALETTE$ink_soft) +
               theme_void())
    }
    ggplot(df, aes(x = reorder(student_id, n), y = n)) +
      geom_col(fill = PALETTE$bad, width = 0.65) +
      geom_text(aes(label = n), hjust = -0.25, size = 3.8, colour = PALETTE$ink_soft) +
      coord_flip() +
      expand_limits(y = max(df$n, na.rm = TRUE) * 1.15) +
      labs(title = "Cheat warnings per student (exam-mode only)",
           x = NULL, y = "Warning count") +
      theme_classroom()
  })

  output$cheat_timeseries <- renderPlot({
    df_all <- cheat_base_r()
    sid <- input$cheat_student_filter %||% "__all__"
    if (sid != "__all__") {
      df_all <- df_all |> filter(student_id == sid)
    } else {
      # default: pick student with most exam records
      top_sid <- df_all |> count(student_id, sort = TRUE) |> head(1) |> pull(student_id)
      if (length(top_sid) == 0) {
        return(ggplot() +
                 annotate("text", x = 0.5, y = 0.5,
                          label = "No exam-mode records available.",
                          size = 5, colour = PALETTE$ink_soft) +
                 theme_void())
      }
      df_all <- df_all |> filter(student_id == top_sid)
      sid <- top_sid
    }
    if (nrow(df_all) == 0) {
      return(ggplot() +
               annotate("text", x = 0.5, y = 0.5,
                        label = "No exam-mode records for this student.",
                        size = 5, colour = PALETTE$ink_soft) +
               theme_void())
    }
    ggplot(df_all, aes(x = timestamp, y = cheat_score)) +
      geom_line(colour = PALETTE$bad, linewidth = 1.0) +
      geom_point(aes(colour = cheat_warning), size = 2.5, show.legend = TRUE) +
      scale_colour_manual(values = c("TRUE" = PALETTE$bad, "FALSE" = PALETTE$accent),
                          na.value = PALETTE$ink_soft,
                          name = "Warning") +
      labs(title = sprintf("Cheat score over time — %s", sid),
           x = "Time", y = "Cheat score") +
      theme_classroom()
  })

  output$cheat_summary_table <- renderDT({
    df <- cheat_base_r() |>
      group_by(student_id) |>
      summarise(
        avg_cheat_score = round(mean(cheat_score, na.rm = TRUE), 2),
        warning_count   = sum(isTRUE(cheat_warning) | cheat_warning == TRUE, na.rm = TRUE),
        max_cheat_score = round(max(cheat_score, na.rm = TRUE), 2),
        .groups = "drop"
      ) |>
      arrange(desc(warning_count))
    if (nrow(df) == 0) {
      return(datatable(data.frame(Message = "No exam-mode records (cheat_score > 0) found."),
                       rownames = FALSE,
                       options = list(dom = "t", paging = FALSE)))
    }
    names(df) <- c("Student ID", "Avg Cheat Score", "Warning Count", "Max Cheat Score")
    datatable(df, rownames = FALSE, class = "stripe hover row-border",
              options = list(pageLength = 20, scrollX = TRUE,
                             dom = "lftipr",
                             language = list(search = "",
                                             searchPlaceholder = "Search...")))
  })

  # ══════════════════════════════════════════════════════════════════════════════
  # Tab 4 — Recommendations
  # ══════════════════════════════════════════════════════════════════════════════

  rec_agg_r <- reactive({
    data_r() |>
      mutate(
        attention_score  = suppressWarnings(as.numeric(attention_score)),
        engagement_score = suppressWarnings(as.numeric(engagement_score)),
        attention_warning = suppressWarnings(as.logical(attention_warning)),
        is_sleeping = state == "sleeping",
        is_yawning  = yawning == TRUE | tolower(as.character(yawning)) == "true"
      ) |>
      group_by(student_id) |>
      summarise(
        avg_attention  = round(mean(attention_score,  na.rm = TRUE), 1),
        avg_engagement = round(mean(engagement_score, na.rm = TRUE), 3),
        pct_sleeping   = round(mean(is_sleeping, na.rm = TRUE) * 100, 1),
        pct_yawning    = round(mean(is_yawning,  na.rm = TRUE) * 100, 1),
        warning_rate   = round(mean(isTRUE(attention_warning) | attention_warning == TRUE,
                                    na.rm = TRUE) * 100, 1),
        .groups = "drop"
      ) |>
      mutate(
        recommendation = dplyr::case_when(
          avg_attention < 45 ~ "Low attention — needs intervention",
          avg_attention < 70 ~ "Moderate attention — encourage engagement",
          TRUE               ~ "Good attention"
        )
      ) |>
      arrange(avg_attention)
  })

  output$rec_bar <- renderPlot({
    df <- rec_agg_r()
    if (nrow(df) == 0) {
      return(ggplot() +
               annotate("text", x = 0.5, y = 0.5, label = "No data available.",
                        size = 5, colour = PALETTE$ink_soft) +
               theme_void())
    }
    df <- df |>
      mutate(
        attn_band = dplyr::case_when(
          avg_attention < 45 ~ "low",
          avg_attention < 70 ~ "medium",
          TRUE               ~ "good"
        ),
        attn_band = factor(attn_band, levels = c("low", "medium", "good"))
      )
    band_colours <- c("low" = PALETTE$bad, "medium" = PALETTE$warn, "good" = PALETTE$good)

    ggplot(df, aes(x = reorder(student_id, avg_attention),
                   y = avg_attention,
                   fill = attn_band)) +
      geom_col(width = 0.65) +
      geom_hline(yintercept = c(45, 70), linetype = "dashed",
                 colour = PALETTE$ink_soft, linewidth = 0.5) +
      geom_text(aes(label = sprintf("%.1f", avg_attention)),
                hjust = -0.25, size = 3.4, colour = PALETTE$ink_soft) +
      scale_fill_manual(values = band_colours, name = "Attention band") +
      coord_flip() +
      expand_limits(y = max(df$avg_attention, na.rm = TRUE) * 1.15) +
      labs(title = "Average attention per student (worst first)",
           x = NULL, y = "Avg attention score") +
      theme_classroom()
  })

  output$rec_table <- renderDT({
    df <- rec_agg_r()
    if (nrow(df) == 0) {
      return(datatable(data.frame(Message = "No data available."),
                       rownames = FALSE,
                       options = list(dom = "t", paging = FALSE)))
    }
    display <- df |>
      dplyr::select(student_id, avg_attention, avg_engagement,
                    pct_sleeping, pct_yawning, warning_rate, recommendation)
    names(display) <- c("Student ID", "Avg Attention", "Avg Engagement",
                        "% Sleeping", "% Yawning", "Warning Rate %", "Recommendation")

    datatable(
      display,
      rownames = FALSE,
      class = "stripe hover row-border",
      options = list(
        pageLength = 25, scrollX = TRUE,
        dom = "lftipr",
        language = list(search = "", searchPlaceholder = "Search..."),
        columnDefs = list(
          list(targets = 1,  # Avg Attention column (0-indexed)
               render = DT::JS(
                 "function(data, type, row, meta) {",
                 "  if (type !== 'display') return data;",
                 "  var val = parseFloat(data);",
                 "  var colour = val < 45 ? '#ef4444' : val < 70 ? '#f59e0b' : '#10b981';",
                 "  return '<span style=\"color:' + colour + '; font-weight:700;\">' + data + '</span>';",
                 "}"
               ))
        )
      ),
      escape = FALSE
    )
  })
}

shinyApp(ui, server)
