# Theme — supports a runtime light/dark toggle.
#
# The Shiny app sets Sys.setenv(UI_THEME = "dark"|"light") and calls
# session$reload(). This file is sourced fresh on each app load, so PALETTE
# and CUSTOM_CSS pick up the new mode automatically.

is_light_mode <- function() {
  tolower(Sys.getenv("UI_THEME", unset = "dark")) == "light"
}

# ── Palettes ────────────────────────────────────────────────────────────
PALETTE_DARK <- list(
  primary   = "#818cf8", primary2 = "#a78bfa", accent = "#22d3ee",
  good      = "#34d399", warn     = "#fbbf24", bad    = "#f87171",
  ink       = "#f1f5f9", ink_soft = "#94a3b8",
  line      = "#334155", line_soft = "#1e293b",
  bg        = "#0f172a", surface  = "#1e293b", surface2 = "#0b1220"
)

PALETTE_LIGHT <- list(
  primary   = "#4f46e5", primary2 = "#7c3aed", accent = "#06b6d4",
  good      = "#10b981", warn     = "#f59e0b", bad    = "#ef4444",
  ink       = "#0f172a", ink_soft = "#475569",
  line      = "#e2e8f0", line_soft = "#f1f5f9",
  bg        = "#f1f5f9", surface  = "#ffffff", surface2 = "#f8fafc"
)

PALETTE <- if (is_light_mode()) PALETTE_LIGHT else PALETTE_DARK

CHART_PALETTE_DARK  <- c("#818cf8", "#22d3ee", "#34d399", "#fbbf24",
                         "#fb923c", "#f87171", "#c084fc", "#38bdf8")
CHART_PALETTE_LIGHT <- c("#4f46e5", "#06b6d4", "#10b981", "#f59e0b",
                         "#f97316", "#f43f5e", "#8b5cf6", "#0ea5e9")
CHART_PALETTE <- if (is_light_mode()) CHART_PALETTE_LIGHT else CHART_PALETTE_DARK

# ── ggplot + plotly themers ─────────────────────────────────────────────
theme_classroom <- function() {
  ggplot2::theme_minimal(base_family = "Inter, system-ui, -apple-system, sans-serif",
                         base_size = 13) +
    ggplot2::theme(
      plot.background  = ggplot2::element_rect(fill = PALETTE$surface, color = NA),
      panel.background = ggplot2::element_rect(fill = PALETTE$surface, color = NA),
      plot.title       = ggplot2::element_text(face = "bold", size = 15, color = PALETTE$ink),
      plot.subtitle    = ggplot2::element_text(color = PALETTE$ink_soft, size = 12),
      panel.grid.major = ggplot2::element_line(color = PALETTE$line, linewidth = 0.4),
      panel.grid.minor = ggplot2::element_blank(),
      axis.text        = ggplot2::element_text(color = PALETTE$ink_soft),
      axis.title       = ggplot2::element_text(color = PALETTE$ink_soft, size = 12),
      legend.position  = "bottom",
      legend.background = ggplot2::element_rect(fill = PALETTE$surface, color = NA),
      legend.title     = ggplot2::element_text(color = PALETTE$ink, face = "bold"),
      legend.text      = ggplot2::element_text(color = PALETTE$ink_soft),
      strip.text       = ggplot2::element_text(color = PALETTE$ink, face = "bold")
    )
}

style_plotly <- function(p) {
  p |> plotly::layout(
    font   = list(family = "Inter, system-ui, sans-serif",
                  size = 13, color = PALETTE$ink),
    paper_bgcolor = PALETTE$surface,
    plot_bgcolor  = PALETTE$surface,
    margin = list(l = 50, r = 25, t = 30, b = 50),
    xaxis = list(gridcolor = PALETTE$line, zerolinecolor = PALETTE$line,
                 tickfont   = list(color = PALETTE$ink_soft),
                 titlefont  = list(color = PALETTE$ink_soft)),
    yaxis = list(gridcolor = PALETTE$line, zerolinecolor = PALETTE$line,
                 tickfont   = list(color = PALETTE$ink_soft),
                 titlefont  = list(color = PALETTE$ink_soft)),
    legend = list(orientation = "h", x = 0, y = -0.2,
                  font = list(color = PALETTE$ink_soft),
                  bgcolor = "rgba(0,0,0,0)")
  ) |>
    plotly::config(displaylogo = FALSE,
                   modeBarButtonsToRemove = c("lasso2d", "select2d", "autoScale2d"))
}

# ── CSS — built from the active palette ─────────────────────────────────
.css_dark <- "
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

html, body, .content-wrapper, .right-side, .wrapper, .main-sidebar, .main-header,
.box, .small-box, table.dataTable, .form-control, .selectize-input, .selectize-dropdown {
  font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
  letter-spacing: -0.005em;
}

body, .content-wrapper, .right-side, .wrapper { background: #0f172a !important; color: #f1f5f9 !important; }

.skin-blue .main-header .logo {
  background: #020617 !important; color: #f1f5f9 !important;
  font-weight: 700; font-size: 16px; letter-spacing: -0.02em;
  border-bottom: 1px solid #1e293b !important;
}
.skin-blue .main-header .logo:hover { background: #0b1220 !important; color: #fff !important; }
.skin-blue .main-header .navbar { background: #1e293b !important; border-bottom: 1px solid #334155 !important; }
.skin-blue .main-header .navbar .sidebar-toggle { color: #cbd5e1 !important; }
.skin-blue .main-header .navbar .sidebar-toggle:hover { background: #0f172a !important; color: #fff !important; }

.skin-blue .main-sidebar, .skin-blue .left-side {
  background: #020617 !important; border-right: 1px solid #1e293b !important;
}
.skin-blue .sidebar a { color: #94a3b8 !important; }
.skin-blue .sidebar-menu > li > a { border-left: 3px solid transparent !important; }
.skin-blue .sidebar-menu > li:hover > a {
  background: #0b1220 !important; color: #f1f5f9 !important; border-left-color: #818cf8 !important;
}
.skin-blue .sidebar-menu > li.active > a {
  background: #1e1b4b !important; color: #ffffff !important; border-left-color: #a78bfa !important;
}
.skin-blue .sidebar-menu > li > a > .fa, .skin-blue .sidebar-menu > li > a > .glyphicon { color: #64748b; }
.skin-blue .sidebar-menu > li.active > a > .fa,
.skin-blue .sidebar-menu > li:hover > a > .fa { color: #c4b5fd; }
.skin-blue .sidebar h2, .skin-blue .sidebar p, .skin-blue .sidebar small,
.skin-blue .sidebar label { color: #94a3b8 !important; }

.box {
  background: #1e293b !important; border-radius: 12px !important;
  border: 1px solid #334155 !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25) !important;
  color: #e2e8f0 !important;
}
.box-header { border-bottom: 1px solid #334155 !important; padding: 14px 16px !important; }
.box-header .box-title { font-weight: 600; color: #f1f5f9 !important; }
.box-header .fa, .box-header .glyphicon { color: #c4b5fd !important; }
.box-body { padding: 16px !important; background: #1e293b !important; color: #e2e8f0 !important; }
.box.box-primary { border-top: 3px solid #818cf8 !important; }
.box.box-info    { border-top: 3px solid #22d3ee !important; }
.box.box-success { border-top: 3px solid #34d399 !important; }
.box.box-warning { border-top: 3px solid #fbbf24 !important; }
.box.box-danger  { border-top: 3px solid #f87171 !important; }

.small-box {
  border-radius: 12px !important; box-shadow: 0 6px 16px rgba(0,0,0,0.4) !important;
  overflow: hidden; color: #ffffff !important;
}
.small-box h3, .small-box p { color: #ffffff !important; text-shadow: 0 1px 2px rgba(0,0,0,0.25); }
.small-box .icon > i { font-size: 64px; opacity: 0.22; color: #ffffff; }
.small-box h3 { font-weight: 700; letter-spacing: -0.02em; }
.small-box p  { font-weight: 500; opacity: 0.95; }
.bg-purple{background-color:#6d28d9!important}.bg-blue{background-color:#1d4ed8!important}
.bg-teal{background-color:#0e7490!important}.bg-olive{background-color:#4d7c0f!important}
.bg-green{background-color:#047857!important}.bg-red{background-color:#b91c1c!important}
.bg-yellow{background-color:#b45309!important}.bg-orange{background-color:#c2410c!important}
.bg-navy{background-color:#1e3a8a!important}.bg-aqua{background-color:#0e7490!important}
.bg-maroon{background-color:#9f1239!important}

.content h2, .content h3, .content h4 {
  font-weight: 700; letter-spacing: -0.02em; color: #f1f5f9 !important; margin-top: 0; margin-bottom: 18px;
}
.content small, .content .text-muted { color: #94a3b8 !important; }
.content a { color: #c4b5fd; } .content a:hover { color: #ddd6fe; }

.dataTables_wrapper, .dataTables_wrapper .dataTables_length,
.dataTables_wrapper .dataTables_filter, .dataTables_wrapper .dataTables_info,
.dataTables_wrapper .dataTables_paginate { color: #cbd5e1 !important; }
table.dataTable { background: #1e293b !important; color: #e2e8f0 !important; }
table.dataTable thead th {
  background: #0f172a !important; color: #f1f5f9 !important; font-weight: 600;
  border-bottom: 2px solid #334155 !important;
}
table.dataTable tbody tr { background: #1e293b !important; }
table.dataTable tbody tr.odd { background: #1a2538 !important; }
table.dataTable tbody tr.selected, table.dataTable tbody tr.selected td {
  background: #312e81 !important; color: #ffffff !important;
}
table.dataTable tbody tr:hover { background: #273449 !important; }
table.dataTable tbody td { border-top: 1px solid #334155 !important; color: #e2e8f0 !important; }

.dataTables_wrapper .dataTables_paginate .paginate_button {
  color: #cbd5e1 !important; background: transparent !important; border: 1px solid #334155 !important;
}
.dataTables_wrapper .dataTables_paginate .paginate_button.current,
.dataTables_wrapper .dataTables_paginate .paginate_button.current:hover {
  background: #4f46e5 !important; color: #ffffff !important; border-color: #4f46e5 !important;
}
.dataTables_wrapper .dataTables_paginate .paginate_button:hover {
  background: #1e293b !important; color: #ffffff !important;
}
.dataTables_wrapper .dataTables_filter input,
.dataTables_wrapper .dataTables_length select {
  background: #0f172a !important; border: 1px solid #334155 !important;
  color: #e2e8f0 !important; border-radius: 6px; padding: 4px 8px;
}

.form-control, .selectize-input {
  background: #0f172a !important; color: #e2e8f0 !important;
  border: 1px solid #334155 !important; border-radius: 8px !important;
}
.form-control:focus, .selectize-input.focus {
  border-color: #818cf8 !important; box-shadow: 0 0 0 3px rgba(129,140,248,0.2) !important;
}
label, .control-label { color: #cbd5e1 !important; }
.selectize-input input { color: #e2e8f0 !important; }
.selectize-dropdown {
  background: #0f172a !important; border: 1px solid #334155 !important; color: #e2e8f0 !important;
}
.selectize-dropdown .active { background: #312e81 !important; color: #ffffff !important; }

.btn { border-radius: 8px !important; font-weight: 600; }
.btn-default { background: #1e293b !important; color: #e2e8f0 !important; border: 1px solid #334155 !important; }
.btn-default:hover { background: #273449 !important; color: #ffffff !important; }

hr { border-top-color: #334155 !important; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: #0b1220; }
::-webkit-scrollbar-thumb { background: #334155; border-radius: 8px; }
::-webkit-scrollbar-thumb:hover { background: #475569; }
.modebar { background: rgba(15,23,42,0.6) !important; border-radius: 6px; }
.modebar-btn path { fill: #94a3b8 !important; }
.modebar-btn.active path { fill: #c4b5fd !important; }

/* Theme toggle button (sidebar) */
#theme_toggle {
  background: #1e293b !important; color: #f1f5f9 !important;
  border: 1px solid #334155 !important; width: 100%; margin-top: 8px;
}
#theme_toggle:hover { background: #273449 !important; }
"

.css_light <- "
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

html, body, .content-wrapper, .right-side, .wrapper, .main-sidebar, .main-header,
.box, .small-box, table.dataTable, .form-control, .selectize-input, .selectize-dropdown {
  font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
  letter-spacing: -0.005em;
}

body, .content-wrapper, .right-side, .wrapper { background: #f1f5f9 !important; color: #0f172a !important; }

.skin-blue .main-header .logo {
  background: #312e81 !important; color: #fff !important;
  font-weight: 700; font-size: 16px; letter-spacing: -0.02em;
}
.skin-blue .main-header .logo:hover { background: #3730a3 !important; }
.skin-blue .main-header .navbar { background: #4338ca !important; }
.skin-blue .main-header .navbar .sidebar-toggle:hover { background: #3730a3 !important; }

.skin-blue .main-sidebar, .skin-blue .left-side { background: #0f172a !important; }
.skin-blue .sidebar a { color: #cbd5e1 !important; }
.skin-blue .sidebar-menu > li.active > a, .skin-blue .sidebar-menu > li:hover > a {
  background: #1e293b !important; color: #ffffff !important; border-left-color: #7c3aed !important;
}
.skin-blue .sidebar-menu > li > a > .fa, .skin-blue .sidebar-menu > li > a > .glyphicon { color: #94a3b8; }

.box {
  background: #ffffff !important; border-radius: 12px !important;
  border: 1px solid #e2e8f0 !important;
  box-shadow: 0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04) !important;
  color: #0f172a !important;
}
.box-header { border-bottom: 1px solid #f1f5f9 !important; padding: 14px 16px !important; }
.box-header .box-title { font-weight: 600; color: #0f172a; }
.box-body { padding: 16px !important; background: #ffffff !important; color: #0f172a !important; }
.box.box-primary { border-top: 3px solid #4f46e5 !important; }
.box.box-info    { border-top: 3px solid #06b6d4 !important; }
.box.box-success { border-top: 3px solid #10b981 !important; }
.box.box-warning { border-top: 3px solid #f59e0b !important; }
.box.box-danger  { border-top: 3px solid #ef4444 !important; }

.small-box {
  border-radius: 12px !important;
  box-shadow: 0 4px 12px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04) !important;
  overflow: hidden;
}
.small-box .icon > i { font-size: 64px; opacity: 0.18; }
.small-box h3 { font-weight: 700; letter-spacing: -0.02em; }
.small-box p  { font-weight: 500; opacity: 0.95; }

.content h2, .content h3, .content h4 {
  font-weight: 700; letter-spacing: -0.02em; color: #0f172a; margin-top: 0; margin-bottom: 18px;
}
.content small, .content .text-muted { color: #475569 !important; }

table.dataTable thead th {
  background: #f8fafc !important; color: #334155 !important; font-weight: 600;
  border-bottom: 2px solid #e2e8f0 !important;
}
table.dataTable tbody td { color: #1e293b; }

.form-control, .selectize-input {
  border-radius: 8px !important; border: 1px solid #e2e8f0 !important; font-size: 14px;
}
.selectize-input.focus, .form-control:focus {
  border-color: #4f46e5 !important; box-shadow: 0 0 0 3px rgba(79,70,229,0.15) !important;
}

.btn { border-radius: 8px !important; font-weight: 600; }
.sidebar .btn-block { border-radius: 8px !important; font-weight: 600; }

/* Theme toggle button (sidebar) */
#theme_toggle {
  background: #ffffff !important; color: #0f172a !important;
  border: 1px solid #e2e8f0 !important; width: 100%; margin-top: 8px;
}
#theme_toggle:hover { background: #f8fafc !important; }
"

CUSTOM_CSS <- if (is_light_mode()) .css_light else .css_dark
