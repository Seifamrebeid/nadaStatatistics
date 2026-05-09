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
  primary2  = "#6366f1",
  accent    = "#06b6d4",  # cyan-500
  good      = "#10b981",  # emerald-500
  warn      = "#f59e0b",  # amber-500
  bad       = "#ef4444",  # red-500
  ink       = "#0f172a",  # slate-900
  ink_soft  = "#475569",  # slate-600
  line      = "#e2e8f0",  # slate-200
  bg        = "#f8fafc"   # slate-50
)

CHART_PALETTE <- c("#4f46e5", "#06b6d4", "#10b981", "#f59e0b",
                   "#ef4444", "#a855f7", "#0ea5e9", "#84cc16")

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
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

:root {
  --ink: #0f172a;
  --ink-soft: #475569;
  --primary: #4f46e5;
  --primary-2: #6366f1;
  --accent: #06b6d4;
  --good: #10b981;
  --warn: #f59e0b;
  --bad: #ef4444;
  --line: #e2e8f0;
  --bg: #f8fafc;
  --card: #ffffff;
}

body {
  background:
    radial-gradient(circle at top left, rgba(99, 102, 241, 0.10), transparent 28%),
    radial-gradient(circle at top right, rgba(6, 182, 212, 0.08), transparent 24%),
    linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
}

html, body, .content-wrapper, .right-side {
  font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
  background-color: var(--bg) !important;
  color: var(--ink);
  letter-spacing: -0.005em;
}

.wrapper {
  background: transparent !important;
}

.content-wrapper {
  background: transparent !important;
}

.main-header {
  position: sticky;
  top: 0;
  z-index: 1030;
}

/* ---- Header ---- */
.skin-blue .main-header .navbar { background-color: var(--card) !important;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08); border-bottom: 1px solid var(--line); }
.skin-blue .main-header .logo {
  background: linear-gradient(135deg, var(--primary), var(--primary-2)) !important;
  color: #fff !important; font-weight: 700; font-size: 18px;
  letter-spacing: -0.02em; border-bottom-right-radius: 14px; }
.skin-blue .main-header .logo:hover { background: linear-gradient(135deg, #4338ca, var(--primary)) !important; }
.skin-blue .main-header .navbar .sidebar-toggle { color: var(--ink-soft); }
.skin-blue .main-header .navbar .sidebar-toggle:hover { background: var(--bg); color: var(--primary); }

/* ---- Sidebar ---- */
.skin-blue .main-sidebar { background-color: var(--ink) !important; }
.skin-blue .main-sidebar {
  box-shadow: 8px 0 30px rgba(15, 23, 42, 0.16);
}
.skin-blue .sidebar-menu > li.header { color: #94a3b8 !important;
  text-transform: uppercase; font-size: 11px; font-weight: 700;
  letter-spacing: 0.08em; padding: 16px 18px 8px; background: transparent; }
.skin-blue .sidebar-menu > li > a { color: #cbd5e1 !important;
  border-left: 3px solid transparent; padding: 12px 18px;
  transition: background 0.15s, border-color 0.15s; font-weight: 500; }
.skin-blue .sidebar-menu > li:hover > a,
.skin-blue .sidebar-menu > li.active > a {
  background: rgba(99, 102, 241, 0.12) !important; color: #fff !important;
  border-left-color: var(--primary-2) !important; }
.skin-blue .sidebar-menu > li > a > .fa,
.skin-blue .sidebar-menu > li > a > .glyphicon { width: 20px; }

.sidebar .btn-primary {
  background: var(--primary) !important; border: none !important;
  border-radius: 10px !important; padding: 8px 14px !important;
  font-weight: 600 !important; box-shadow: 0 2px 8px rgba(79, 70, 229, 0.4);
  margin: 0 18px !important; }
.sidebar .btn-primary:hover { background: #4338ca !important; }
.sidebar hr { border-top: 1px solid #1e293b; margin: 12px 18px; }

/* ---- Boxes / cards ---- */
.box {
  border: 1px solid var(--line) !important;
  border-radius: 14px !important;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.03) !important;
  background: var(--card) !important;
  transition: box-shadow 0.2s ease;
  overflow: hidden;
}
.box:hover { box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08), 0 2px 4px rgba(15, 23, 42, 0.04) !important; }
.box.box-solid > .box-header, .box > .box-header {
  background: transparent !important; color: var(--ink) !important;
  border-bottom: 1px solid var(--line) !important; padding: 16px 20px;
  border-radius: 14px 14px 0 0 !important; }
.box-header > .box-title { font-weight: 600; font-size: 15px;
  letter-spacing: -0.01em; }
.box-body { padding: 20px !important; }
.box-footer { background: var(--bg) !important; border-top: 1px solid var(--line) !important;
  color: var(--ink-soft); font-size: 12px; padding: 10px 20px;
  border-radius: 0 0 14px 14px !important; }

/* ---- Value boxes (KPIs) ---- */
.small-box {
  border-radius: 14px !important; overflow: hidden;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04) !important;
  border: 1px solid var(--line); position: relative;
}
.small-box > .inner { padding: 20px 22px; color: #fff; }
.small-box > .inner > h3 { font-size: 36px !important; font-weight: 700 !important;
  letter-spacing: -0.03em; margin: 0 0 4px; line-height: 1.1; }
.small-box > .inner > p  { font-size: 13px !important; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.92; margin: 0; }
.small-box .icon { color: rgba(255,255,255,0.28) !important; font-size: 80px !important;
  top: 12px !important; right: 18px !important; }
.small-box:hover { transform: translateY(-1px); transition: transform 0.15s ease; }
.small-box:hover .icon { color: rgba(255,255,255,0.4) !important; }

.bg-aqua, .bg-light-blue { background: linear-gradient(135deg, var(--primary), var(--primary-2)) !important; }
.bg-green { background: linear-gradient(135deg, var(--good), #059669) !important; }
.bg-yellow { background: linear-gradient(135deg, var(--warn), #d97706) !important; }
.bg-red { background: linear-gradient(135deg, var(--bad), #dc2626) !important; }
.bg-purple { background: linear-gradient(135deg, #a855f7, #7c3aed) !important; }

/* ---- Tab content padding ---- */
.content { padding: 24px !important; }
.content-header { padding: 18px 24px 0 !important; }
.content-header > h1 {
  font-weight: 700; font-size: 24px; letter-spacing: -0.02em; color: var(--ink);
  margin: 0 0 4px; }
.content-header > h1 > small { color: var(--ink-soft); font-weight: 500;
  font-size: 14px; margin-left: 8px; }

/* ---- Inputs ---- */
.form-control, .selectize-input {
  border-radius: 10px !important;
  border: 1px solid var(--line) !important;
  box-shadow: none !important;
  font-size: 14px;
  transition: border-color 0.15s, box-shadow 0.15s; }
.form-control:focus, .selectize-input.focus {
  border-color: var(--primary) !important;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12) !important; }
label, .control-label { color: var(--ink-soft); font-weight: 600;
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }

/* ---- DataTable polish ---- */
table.dataTable thead th { background: var(--bg) !important; color: var(--ink) !important;
  border-bottom: 1px solid var(--line) !important; font-weight: 600;
  font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
table.dataTable tbody tr:hover { background: var(--bg) !important; }
.dataTables_wrapper .dataTables_length, .dataTables_wrapper .dataTables_filter,
.dataTables_wrapper .dataTables_info, .dataTables_wrapper .dataTables_paginate {
  color: var(--ink-soft); font-size: 13px; }
.paginate_button.current { background: var(--primary) !important; color: #fff !important;
  border-radius: 8px !important; border: none !important; }

/* ---- Empty-state polish for plotly ---- */
.plotly .plot-container { border-radius: 10px; }

/* ---- Subtle scrollbar ---- */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* ---- Dashboard hero ---- */
.page-hero {
  border-radius: 20px;
  padding: 22px 24px;
  margin: 0 0 22px;
  background:
    linear-gradient(135deg, rgba(79, 70, 229, 0.96), rgba(6, 182, 212, 0.92));
  color: #fff;
  box-shadow: 0 16px 34px rgba(79, 70, 229, 0.18);
  position: relative;
  overflow: hidden;
}
.page-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top right, rgba(255,255,255,0.20), transparent 24%),
    radial-gradient(circle at bottom left, rgba(255,255,255,0.12), transparent 22%);
  pointer-events: none;
}
.page-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(255,255,255,0.82);
}
.page-hero__title {
  font-size: 28px;
  line-height: 1.1;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 10px 0 8px;
}
.page-hero__text {
  max-width: 72ch;
  color: rgba(255,255,255,0.86);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}
.page-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}
.page-hero__pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.12);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  backdrop-filter: blur(8px);
}

/* ---- Login shell ---- */
.login-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px 18px;
  background:
    radial-gradient(circle at top left, rgba(79, 70, 229, 0.16), transparent 26%),
    radial-gradient(circle at top right, rgba(6, 182, 212, 0.12), transparent 24%),
    linear-gradient(180deg, #eff6ff 0%, #eef2ff 42%, #f8fafc 100%);
}
.login-card {
  width: min(1080px, 100%);
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 0;
  border-radius: 28px;
  overflow: hidden;
  background: rgba(255,255,255,0.82);
  box-shadow: 0 28px 70px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(226, 232, 240, 0.9);
}
.login-hero {
  padding: 42px;
  color: #fff;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(79, 70, 229, 0.94)),
    radial-gradient(circle at top right, rgba(255,255,255,0.18), transparent 22%);
  position: relative;
}
.login-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at bottom left, rgba(255,255,255,0.12), transparent 18%),
    radial-gradient(circle at top right, rgba(6, 182, 212, 0.18), transparent 18%);
  pointer-events: none;
}
.login-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.12);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.login-hero h1 {
  margin: 18px 0 10px;
  font-size: 42px;
  line-height: 1.05;
  letter-spacing: -0.04em;
  font-weight: 800;
}
.login-hero p {
  color: rgba(255,255,255,0.84);
  font-size: 15px;
  line-height: 1.65;
  max-width: 54ch;
}
.login-points {
  display: grid;
  gap: 12px;
  margin-top: 24px;
}
.login-point {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.92);
}
.login-panel {
  padding: 36px;
  background: rgba(255,255,255,0.98);
}
.login-panel__topline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 999px;
  background: rgba(79, 70, 229, 0.08);
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.login-panel h2 {
  margin: 0;
  font-size: 28px;
  letter-spacing: -0.03em;
  color: var(--ink);
}
.login-panel .subtle {
  margin-top: 8px;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.6;
}
.login-grid {
  display: grid;
  gap: 10px;
  margin-top: 18px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.login-role-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 14px;
  background: linear-gradient(180deg, #fff, #f8fafc);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.login-role-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
  border-color: rgba(79, 70, 229, 0.25);
}
.login-role-card.active {
  border-color: rgba(79, 70, 229, 0.5);
  background: linear-gradient(180deg, rgba(79,70,229,0.08), rgba(6,182,212,0.06));
}
.login-role-card .role-name {
  font-weight: 700;
  color: var(--ink);
  text-transform: capitalize;
}
.login-role-card .role-note {
  color: var(--ink-soft);
  font-size: 12px;
  margin-top: 6px;
  line-height: 1.5;
}
.login-role-card .role-chip {
  display: inline-flex;
  margin-top: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(79, 70, 229, 0.08);
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.login-credentials {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--bg);
  border: 1px solid var(--line);
}
.login-credentials pre {
  display: block;
  margin-top: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--line);
  color: var(--ink);
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  white-space: pre-wrap;
  margin-bottom: 0;
}
.login-error {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-size: 13px;
}
.login-filter-note {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(6, 182, 212, 0.08);
  border: 1px solid rgba(6, 182, 212, 0.18);
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.6;
}
@media (max-width: 920px) {
  .login-card { grid-template-columns: 1fr; }
  .login-hero { padding: 30px; }
  .login-panel { padding: 28px; }
  .login-grid { grid-template-columns: 1fr; }
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
    admin   = c("overview", "dist", "emotion_dist", "per_lecture", "trends", "cluster_doc", "cluster_ss", "student_search", "grades", "raw"),
    doctor  = c("overview", "dist", "emotion_dist", "per_lecture", "trends", "student_search", "grades", "raw"),
    student = c("overview", "dist", "emotion_dist", "per_lecture", "doctor_search", "grades", "raw"),
    parent  = c("overview", "dist", "emotion_dist", "grades", "raw"),
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
          textInput("login_api_token", "API token (optional)", value = "", placeholder = "owner (emulator) or leave blank"),
          actionButton("login_submit", "Sign in", class = "btn-primary", width = "100%"),
          div(class = "login-error", textOutput("login_error", inline = TRUE))
        )
      )
    )
  )
}

build_dashboard_ui <- function(role) {
  dashboardPage(
    skin = "blue",
    dashboardHeader(
      title = span("Classroom Emotions", tags$small(paste0(" · ", role_cap(role)))),
      titleWidth = 260
    ),
    dashboardSidebar(
      width = 260,
      sidebarMenu(
        tags$li(class = "header", "Analytics"),
        if ("overview" %in% tabs_for_role(role)) menuItem("Overview", tabName = "overview", icon = icon("gauge-high")),
        if ("dist" %in% tabs_for_role(role)) menuItem("Distributions", tabName = "dist", icon = icon("chart-pie")),
        if ("emotion_dist" %in% tabs_for_role(role)) menuItem("Emotion distribution", tabName = "emotion_dist", icon = icon("chart-column")),
        if ("per_lecture" %in% tabs_for_role(role)) menuItem("Per-lecture", tabName = "per_lecture", icon = icon("chalkboard-user")),
        if ("trends" %in% tabs_for_role(role)) menuItem("Engagement trends", tabName = "trends", icon = icon("chart-line")),
        tags$li(class = "header", "Clustering"),
        if ("cluster_doc" %in% tabs_for_role(role)) menuItem("Lecturer clusters", tabName = "cluster_doc", icon = icon("user-tie")),
        if ("cluster_ss" %in% tabs_for_role(role)) menuItem("Student × Subject", tabName = "cluster_ss", icon = icon("users")),
        tags$li(class = "header", "Data"),
        if ("doctor_search" %in% tabs_for_role(role)) menuItem("Doctor search", tabName = "doctor_search", icon = icon("search")),
        if ("student_search" %in% tabs_for_role(role)) menuItem("Student search", tabName = "student_search", icon = icon("search")),
        if ("grades" %in% tabs_for_role(role)) menuItem("Grades", tabName = "grades", icon = icon("award")),
        if ("raw" %in% tabs_for_role(role)) menuItem("Raw observations", tabName = "raw", icon = icon("table"))
      ),
      selectInput("student_filter", "Student filter", choices = c("All students" = "__all__"), selected = "__all__"),
      div(class = "login-filter-note", "Focus the dashboard on one student at a time. Choose All students to restore the full class view."),
      hr(),
      actionButton("refresh", "↻ Refresh data", class = "btn-primary",
                   width = "calc(100% - 36px)"),
      actionButton("logout", "Log out", class = "btn-default",
                   width = "calc(100% - 36px)", style = "margin: 10px 18px 0; border-radius: 10px;")
    ),
    dashboardBody(
      tags$head(tags$style(HTML(CUSTOM_CSS))),
      tabItems(
        # -- Overview --
        tabItem(tabName = "overview",
          div(class = "page-hero",
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
      menuItem("Raw observations",     tabName = "raw",          icon = icon("table"))
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
      # capture optional API token for this Shiny session
      auth$api_token <- trimws(input$login_api_token %||% "")
      auth$error <- NULL
    } else {
      auth$error <- sprintf("Invalid %s login. Use the demo credentials shown on the panel.", role_cap(input$login_role))
    }
  })

  observeEvent(input$logout, {
    auth$role <- NULL
    auth$email <- NULL
    auth$error <- NULL
    auth$api_token <- NULL
  })

  observe({
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

  # Reload on demand. `load_emotions()` prefers Firestore when the emulator
  # (or a real service-account key) is configured and falls back to the CSV
  # backup otherwise. Force one path with env var DATA_SOURCE=csv|firestore.
  data_r <- reactive({
    input$refresh  # trigger reactive
    df <- load_emotions() |> attach_doctor_id()
    if (!is.null(input$student_filter) && input$student_filter != "__all__") {
      df <- df |> filter(student_id == input$student_filter)
    }
    df
  })

  # Cache lecture labels so we don't hit Firestore on every reactive turn.
  lecture_labels_r <- reactive({
    input$refresh
    load_lecture_labels()
  })

  # Full student directory (used by the Student search tab for admin/doctor).
  students_directory_r <- reactive({
    input$refresh
    load_students_directory()
  })

  doctors_directory_r <- reactive({
    input$refresh
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
    valueBox(sprintf("%.2f", e), "mean engagement", icon = icon("bolt"),
             color = if (e >= 0.5) "green" else if (e >= 0.3) "yellow" else "red")
  })
  output$kpi_sleep_rate <- renderValueBox({
    r <- mean(data_r()$state == "sleeping", na.rm = TRUE)
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
    input$refresh
    sid <- NULL
    # prefer explicit grades_student picker, fall back to the main student_filter
    if (!is.null(input$grades_student) && input$grades_student != "__all__") {
      sid <- input$grades_student
    } else if (!is.null(input$student_filter) && input$student_filter != "__all__") {
      sid <- input$student_filter
    }

    # Try API first. Prefer session's `auth$api_token`, then env `SHINY_API_TOKEN`,
    # finally fall back to 'owner' which the emulator accepts.
    token <- if (!is.null(auth$api_token) && nzchar(auth$api_token)) {
      auth$api_token
    } else if (nzchar(Sys.getenv("SHINY_API_TOKEN", unset = ""))) {
      Sys.getenv("SHINY_API_TOKEN", unset = "")
    } else {
      "owner"
    }
    df <- tryCatch({
      load_grades_api(base = API_URL, token = token, student_id = sid)
    }, error = function(e) {
      message(sprintf("grades_r (api): %s", conditionMessage(e)))
      dplyr::tibble()
    })

    if (nrow(df) == 0) {
      df <- tryCatch({
        load_grades(student_id = sid)
      }, error = function(e) {
        message(sprintf("grades_r (local): %s", conditionMessage(e)))
        dplyr::tibble()
      })
    }

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
}

shinyApp(ui, server)
