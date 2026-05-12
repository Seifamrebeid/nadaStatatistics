# Classroom Emotion Detection — unified analytics dashboard.
#
# A single Shiny app that exposes role-spanning analytics:
#   • Overview              — org-wide KPIs and rankings
#   • Students              — pick a student, see their full picture
#   • Doctors               — pick a doctor, see teaching profile
#   • Parents               — pick a parent, see all linked children
#   • Lectures              — per-lecture deep dive
#   • Subjects & Classes    — curriculum breakdowns
#   • Trends                — org-wide time series + clustering
#   • Transcripts           — talk-time, segments, word frequency
#   • Notifications         — email audit
#   • Data Quality          — coverage / health checks
#
# All data comes straight from the Firebase emulator at localhost:8080
# (or production Firestore if FIREBASE_SERVICE_ACCOUNT_JSON is set).
# No backend-r-plumber dependency — Firestore helpers are vendored in
# r-analysis/shiny/shared/firestore.R.
#
# Run:
#   cd r-analysis/shiny
#   Rscript -e "shiny::runApp('.', port = 3838, launch.browser = TRUE)"

user_lib <- file.path(Sys.getenv("LOCALAPPDATA"), "R", "win-library", "4.5")
if (dir.exists(user_lib) && !(user_lib %in% .libPaths())) .libPaths(c(user_lib, .libPaths()))

suppressPackageStartupMessages({
  library(shiny); library(shinydashboard)
  library(dplyr); library(tidyr); library(lubridate)
  library(ggplot2); library(plotly); library(DT)
  library(scales); library(writexl); library(gridExtra); library(grid)
})

# ── Locate repo root + load helpers ───────────────────────────────────────
.find_repo_root <- function(start = getwd()) {
  d <- normalizePath(start, winslash = "/", mustWork = FALSE)
  repeat {
    if (file.exists(file.path(d, "data/emotions.csv"))) return(d)
    if (dir.exists(file.path(d, ".git")))               return(d)
    parent <- dirname(d); if (parent == d) return(NA_character_); d <- parent
  }
}
ROOT <- .find_repo_root()
if (is.na(ROOT)) stop("could not locate repo root")

# Load .Renviron from this dir if present so emulator env vars stay scoped.
.local_renv <- file.path(dirname(sys.frame(1)$ofile %||% getwd()), ".Renviron")
.local_renv <- file.path(ROOT, "r-analysis", "shiny", ".Renviron")
if (file.exists(.local_renv)) {
  for (line in readLines(.local_renv, warn = FALSE)) {
    line <- trimws(line)
    if (!nzchar(line) || startsWith(line, "#")) next
    eq <- regexpr("=", line, fixed = TRUE); if (eq < 1) next
    key <- trimws(substr(line, 1, eq - 1))
    val <- trimws(substr(line, eq + 1, nchar(line)))
    if (!nzchar(Sys.getenv(key, unset = ""))) {
      args <- list(val); names(args) <- key; do.call(Sys.setenv, args)
    }
  }
}

source(file.path(ROOT, "r-analysis", "load_data.R"))
source(file.path(ROOT, "r-analysis", "shiny", "shared", "theme.R"))
source(file.path(ROOT, "r-analysis", "shiny", "shared", "helpers.R"))
source(file.path(ROOT, "r-analysis", "shiny", "shared", "metrics.R"))
source(file.path(ROOT, "r-analysis", "shiny", "shared", "firebase_auth.R"))

# ── Cached loaders (refresh button below resets these) ────────────────────
.cache <- new.env(parent = emptyenv())

bust_cache <- function() rm(list = ls(.cache), envir = .cache)

cached <- function(key, expr) {
  if (!exists(key, envir = .cache, inherits = FALSE)) {
    assign(key, eval.parent(substitute(expr)), envir = .cache)
  }
  get(key, envir = .cache)
}

emo_data        <- function() cached("emo",       {
  if (requireNamespace("shiny", quietly = TRUE) && !is.null(shiny::getDefaultReactiveDomain()))
    shiny::withProgress(message = "Loading emotions…", value = NULL, load_emotions())
  else load_emotions()
})
students_data   <- function() cached("students",  load_students())
doctors_data    <- function() cached("doctors",   load_doctors())
parents_data    <- function() cached("parents",   load_parents())
admins_data     <- function() cached("admins",    load_admins())
subjects_data   <- function() cached("subjects",  load_subjects())
classes_data    <- function() cached("classes",   load_classes())
weeks_data      <- function() cached("weeks",     load_weeks())
lectures_data   <- function() cached("lectures",  load_lectures())
users_data      <- function() cached("users",     load_users())
grades_data     <- function() cached("grades",    load_grades())
notifications_data <- function() cached("notifications", load_notifications())
transcripts_data   <- function() cached("transcripts",   load_transcripts())
segments_data      <- function() cached("segments",      load_transcript_segments())

# ── Display helpers ────────────────────────────────────────────────────────
fmt_pct <- function(x, digits = 1) {
  if (is.na(x)) "—" else sprintf(paste0("%.", digits, "f%%"), x * 100)
}
fmt_num <- function(x, digits = 2) {
  if (is.na(x)) "—" else formatC(x, format = "f", digits = digits, big.mark = ",")
}
fmt_int <- function(x) formatC(as.integer(x), big.mark = ",", format = "d")

empty_plot <- function(msg = "No data yet — run the classroom app or seed Firestore.") {
  plotly::plot_ly() |>
    plotly::layout(
      annotations = list(list(x = 0.5, y = 0.5, text = msg,
                              showarrow = FALSE, xref = "paper", yref = "paper",
                              font = list(size = 14, color = PALETTE$ink_soft))),
      xaxis = list(visible = FALSE), yaxis = list(visible = FALSE),
      paper_bgcolor = PALETTE$surface, plot_bgcolor = PALETTE$surface
    )
}

# Quick named-vector picker builder ("Display label" -> "id").
build_choices <- function(df, id_col, label_cols, fallback = "(unnamed)") {
  if (nrow(df) == 0) return(character(0))
  if (!id_col %in% names(df)) {
    if ("id" %in% names(df)) id_col <- "id" else return(character(0))
  }
  ids <- df[[id_col]]
  labels <- rep("", nrow(df))
  for (col in label_cols) {
    if (col %in% names(df)) {
      val <- as.character(df[[col]])
      labels <- ifelse(nzchar(labels), labels,
                       ifelse(is.na(val) | !nzchar(val), "", val))
    }
  }
  labels <- ifelse(nzchar(labels), labels, ids)
  out <- stats::setNames(ids, paste0(labels, " (", ids, ")"))
  out[order(tolower(names(out)))]
}

# ═══════════════════════════════════════════════════════════════════════════
# UI
# ═══════════════════════════════════════════════════════════════════════════

ui <- function(request) {
  # Re-source theme.R per session so PALETTE / CUSTOM_CSS pick up
  # any UI_THEME env var change made via the toggle button.
  source(file.path(ROOT, "r-analysis", "shiny", "shared", "theme.R"), local = FALSE)
dashboardPage(
  skin = "blue",
  dashboardHeader(
    title = tags$div(class = "app-brand",
      tags$img(src = "logo.png", alt = "EDU Link", class = "app-brand-logo-img"),
      tags$div(class = "app-brand-text",
        tags$div(class = "app-brand-name",
                 HTML('EDU <span style="opacity:.7;font-weight:500;">Link</span>')),
        tags$div(class = "app-brand-sub", "Multi-role analytics")
      )
    ),
    titleWidth = 260
  ),
  dashboardSidebar(
    width = 260,
    # The actual menu items are rendered server-side based on the
    # signed-in user's role — see output$dyn_menu below.
    sidebarMenuOutput("dyn_menu"),
    div(class = "sidebar-actions",
        actionButton("refresh", "Reload data",
                     icon = icon("rotate"),
                     class = "sb-btn sb-btn-primary"),
        actionButton("theme_toggle",
                     label = if (is_light_mode()) "Dark mode" else "Light mode",
                     icon  = icon(if (is_light_mode()) "moon" else "sun"),
                     class = "sb-btn sb-btn-ghost"),
        actionButton("sign_out", "Sign out",
                     icon = icon("right-from-bracket"),
                     class = "sb-btn sb-btn-danger"),
        tags$div(class = "sb-foot",
          tags$small(class = "sb-foot-line", textOutput("auth_who", inline = TRUE)),
          tags$small(class = "sb-foot-line sb-foot-dim", textOutput("env_info", inline = TRUE))
        )
    )
  ),
  dashboardBody(
    tags$head(
      tags$script(HTML("
        Shiny.addCustomMessageHandler('toggleLock', function(m) {
          document.body.classList.toggle('signed-in', !!m.signed_in);
          document.body.classList.toggle('locked',  !m.signed_in);
        });
        Shiny.addCustomMessageHandler('dataLoading', function(m) {
          document.body.classList.toggle('data-loading', !!m.loading);
        });
      ")),
      tags$style(HTML(CUSTOM_CSS)),
      tags$style(HTML("
        /* ── Auth gating ─────────────────────────────────────────────
         * Hide the dashboard chrome BY DEFAULT until the server
         * confirms the user is signed in. This prevents the dashboard
         * from flashing on screen during the brief window between page
         * load and the websocket auth handshake. */
        .wrapper > .main-header,
        .wrapper > .main-sidebar,
        .wrapper > .content-wrapper {
          visibility: hidden;
        }
        body.signed-in .wrapper > .main-header,
        body.signed-in .wrapper > .main-sidebar,
        body.signed-in .wrapper > .content-wrapper {
          visibility: visible;
        }
        /* The login overlay AND the loading curtain must show regardless
         * of their ancestors' visibility — `visibility: visible` on a
         * descendant overrides an inherited `hidden`. */
        .login-screen, .login-screen *,
        .loading-curtain, .loading-curtain * { visibility: visible !important; }

        /* The moment the user signs in (body gets .signed-in class), the
         * login overlay is force-hidden BEFORE Shiny's renderUI gets a
         * chance to clear it — avoids a faded ghost over the dashboard. */
        body.signed-in .login-screen { display: none !important; }

        body.locked { overflow: hidden; }

        /* ── Header brand ────────────────────────────────────────── */
        .skin-blue .main-header .logo {
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #4c1d95 100%) !important;
          padding: 0 14px !important;
          border-right: 1px solid rgba(255,255,255,0.08) !important;
          height: 56px !important; line-height: 56px !important;
        }
        .skin-blue .main-header .logo:hover {
          background: linear-gradient(135deg, #0f172a 0%, #312e81 60%, #5b21b6 100%) !important;
        }
        .skin-blue .main-header .navbar {
          background: #0f172a !important;
          min-height: 56px !important;
          border-bottom: 1px solid rgba(255,255,255,0.06) !important;
        }
        .skin-blue .main-header .navbar .sidebar-toggle {
          color: #cbd5e1 !important;
          height: 56px !important; line-height: 56px !important;
          padding: 0 18px !important;
        }
        .skin-blue .main-header .navbar .sidebar-toggle:hover {
          background: rgba(255,255,255,0.06) !important; color: #fff !important;
        }

        .app-brand {
          display: inline-flex; align-items: center; gap: 12px;
          line-height: 1; height: 56px;
          color: #f8fafc; letter-spacing: -0.01em;
        }
        .app-brand-logo, .app-brand-logo-img {
          width: 38px; height: 38px;
          border-radius: 10px;
          background: rgba(255,255,255,0.06);
          flex-shrink: 0;
          object-fit: cover;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          padding: 2px;
        }
        .app-brand-text { display: flex; flex-direction: column; gap: 1px; text-align: left; }
        .app-brand-name { font-size: 15px; font-weight: 700; line-height: 1.1; color: #f8fafc; }
        .app-brand-sub  { font-size: 10px; font-weight: 500; color: rgba(241,245,249,0.55);
                          text-transform: uppercase; letter-spacing: 0.06em; }
        .skin-blue .main-header .logo > .app-brand { width: 100%; justify-content: flex-start; }

        /* ── Sidebar action buttons ───────────────────────────────── */
        .sidebar-actions {
          padding: 16px 14px 14px;
          margin-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex; flex-direction: column; gap: 8px;
        }
        .sb-btn {
          width: 100% !important;
          display: inline-flex !important; align-items: center; justify-content: center;
          gap: 8px;
          padding: 9px 12px !important;
          font-size: 13px !important; font-weight: 600 !important;
          border-radius: 10px !important;
          border: 1px solid transparent !important;
          cursor: pointer;
          transition: transform .12s ease, box-shadow .12s ease,
                      background .12s ease, border-color .12s ease;
          letter-spacing: 0.01em;
          line-height: 1.2;
          margin: 0 !important;
        }
        .sb-btn:hover { transform: translateY(-1px); }
        .sb-btn .fa { font-size: 13px; }

        .sb-btn-primary {
          background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%) !important;
          color: #ffffff !important;
          box-shadow: 0 4px 12px rgba(124,58,237,0.35) !important;
        }
        .sb-btn-primary:hover {
          box-shadow: 0 8px 20px rgba(124,58,237,0.5) !important;
        }

        .sb-btn-ghost {
          background: rgba(255,255,255,0.05) !important;
          color: #cbd5e1 !important;
          border-color: rgba(255,255,255,0.1) !important;
        }
        .sb-btn-ghost:hover {
          background: rgba(255,255,255,0.1) !important;
          color: #f8fafc !important;
          border-color: rgba(255,255,255,0.2) !important;
        }

        .sb-btn-danger {
          background: rgba(239,68,68,0.12) !important;
          color: #fca5a5 !important;
          border-color: rgba(239,68,68,0.25) !important;
        }
        .sb-btn-danger:hover {
          background: rgba(239,68,68,0.22) !important;
          color: #fff !important;
          border-color: rgba(239,68,68,0.5) !important;
        }

        /* Sidebar footer (signed-in / emulator info) */
        .sb-foot {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex; flex-direction: column; gap: 3px;
        }
        .sb-foot-line {
          display: block;
          font-size: 10.5px;
          color: #94a3b8;
          line-height: 1.4;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sb-foot-dim { color: #64748b; }

        .login-screen {
          position: fixed; inset: 0; z-index: 9999;
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #4c1d95 100%);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .login-screen::before {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(ellipse at top, rgba(124,58,237,0.35), transparent 60%),
                      radial-gradient(ellipse at bottom right, rgba(34,211,238,0.25), transparent 60%);
          pointer-events: none;
        }
        .login-card {
          position: relative; z-index: 1;
          width: 100%; max-width: 440px;
          background: rgba(255,255,255,0.97);
          border-radius: 24px;
          box-shadow: 0 24px 70px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.2);
          padding: 36px 32px;
        }
        .login-brand {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 22px;
        }
        .login-brand-logo, .login-brand-logo-img {
          width: 48px; height: 48px; border-radius: 12px;
          background: #f8fafc;
          display: flex; align-items: center; justify-content: center;
          object-fit: cover;
          box-shadow: 0 6px 16px rgba(15,23,42,0.18);
          padding: 2px;
        }
        .login-brand-title { font-weight: 700; color: #0f172a; font-size: 16px; }
        .login-brand-sub   { color: #64748b; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; }

        .login-title { font-size: 26px; font-weight: 700; color: #0f172a; margin: 0 0 6px; letter-spacing: -0.02em; }
        .login-lead  { color: #64748b; font-size: 14px; margin: 0 0 24px; }

        .login-card .form-group label { color: #334155 !important; font-weight: 600; font-size: 13px; }
        .login-card input[type='text'],
        .login-card input[type='email'],
        .login-card input[type='password'] {
          width: 100% !important; padding: 11px 14px !important;
          border-radius: 10px !important;
          border: 1px solid #e2e8f0 !important;
          background: #f8fafc !important; color: #0f172a !important;
          font-size: 14px !important; transition: border .15s, box-shadow .15s;
          box-shadow: none !important;
        }
        .login-card input:focus {
          outline: none !important;
          border-color: #7c3aed !important;
          background: #fff !important;
          box-shadow: 0 0 0 3px rgba(124,58,237,0.15) !important;
        }
        .login-error {
          margin-top: 14px;
          background: #fef2f2; color: #b91c1c;
          border: 1px solid #fecaca;
          padding: 10px 12px; border-radius: 10px;
          font-size: 13px;
          display: flex; gap: 8px; align-items: flex-start;
        }
        .login-hint {
          margin-top: 16px;
          background: #f1f5f9; color: #475569;
          border-radius: 10px;
          padding: 10px 12px; font-size: 12px;
        }
        .login-hint b { color: #0f172a; }
        .login-submit {
          width: 100%; margin-top: 18px;
          padding: 12px 16px !important;
          background: linear-gradient(135deg, #7c3aed, #6366f1) !important;
          color: white !important;
          border: none !important; border-radius: 10px !important;
          font-weight: 700 !important; font-size: 14px !important;
          letter-spacing: 0.01em;
          box-shadow: 0 8px 22px rgba(124,58,237,0.35) !important;
          cursor: pointer;
          transition: transform .15s, box-shadow .15s;
        }
        .login-submit:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(124,58,237,0.45) !important; }
        .login-foot { margin-top: 20px; text-align: center; color: #94a3b8; font-size: 11px; }

        /* ── Quick sign-in cards ───────────────────────────────────── */
        .quick-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 10px; margin: 6px 0 18px;
        }
        .quick-card {
          display: grid !important;
          grid-template-columns: 28px 1fr;
          grid-template-rows: auto auto;
          column-gap: 10px; row-gap: 2px;
          padding: 12px 14px !important;
          border-radius: 12px !important;
          border: 1px solid transparent !important;
          cursor: pointer; text-align: left;
          font-weight: 600;
          transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease;
          align-items: center;
          min-height: 56px;
        }
        .quick-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(15,23,42,.12);
        }
        .quick-card .qicon {
          grid-row: 1 / span 2;
          grid-column: 1;
          font-size: 22px !important; line-height: 1; opacity: .9;
          display: flex; align-items: center; justify-content: center;
        }
        .quick-card .qrole {
          grid-column: 2; grid-row: 1;
          font-size: 14px; font-weight: 700; line-height: 1.15;
        }
        .quick-card .qmail {
          grid-column: 2; grid-row: 2;
          font-size: 11px; font-weight: 500; opacity: .8;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 100%; line-height: 1.2;
        }
        .quick-admin   { background: #fee2e2 !important; color: #991b1b !important; border-color: #fecaca !important; }
        .quick-admin:hover  { background: #fecaca !important; border-color: #fca5a5 !important; }
        .quick-doctor  { background: #e0e7ff !important; color: #3730a3 !important; border-color: #c7d2fe !important; }
        .quick-doctor:hover { background: #c7d2fe !important; border-color: #a5b4fc !important; }
        .quick-student { background: #d1fae5 !important; color: #065f46 !important; border-color: #a7f3d0 !important; }
        .quick-student:hover{ background: #a7f3d0 !important; border-color: #6ee7b7 !important; }
        .quick-parent  { background: #fef3c7 !important; color: #92400e !important; border-color: #fde68a !important; }
        .quick-parent:hover { background: #fde68a !important; border-color: #fcd34d !important; }

        .quick-sep { display: flex; align-items: center; gap: 10px;
          color: #94a3b8; font-size: 10px; text-transform: uppercase;
          letter-spacing: .12em; margin: 4px 0 14px; font-weight: 600; }
        .quick-sep::before, .quick-sep::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }

        /* ── Loading curtain ───────────────────────────────────────
         * Full-screen overlay shown over the entire window after
         * sign-in, covering header + sidebar + content. Lifts when
         * the data warm-up completes. */
        .loading-curtain {
          position: fixed; inset: 0;
          z-index: 9998;          /* above AdminLTE header (1030) */
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #4c1d95 100%);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 18px;
        }
        .loading-curtain::before {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(ellipse at top, rgba(124,58,237,0.35), transparent 60%),
                      radial-gradient(ellipse at bottom right, rgba(34,211,238,0.25), transparent 60%);
          pointer-events: none;
        }
        .loading-curtain > * { position: relative; z-index: 1; }
        .loading-spinner {
          width: 64px; height: 64px;
          border: 4px solid rgba(255,255,255,0.18);
          border-top-color: #a78bfa;
          border-radius: 50%;
          animation: spinrot 0.7s linear infinite;
        }
        @keyframes spinrot { to { transform: rotate(360deg); } }
        .loading-text { color: #f1f5f9; font-weight: 700; font-size: 16px; letter-spacing: -0.01em; }
        .loading-sub  { color: rgba(241,245,249,0.65); font-size: 12px; }
        .loading-logo {
          width: 84px; height: 84px;
          border-radius: 18px;
          background: rgba(255,255,255,0.96);
          padding: 4px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.45);
          margin-bottom: 4px;
        }
      "))
    ),
    uiOutput("login_overlay"),
    uiOutput("loading_curtain"),
    tabItems(
      # ───────────────────────────── OVERVIEW ────────────────────────────
      tabItem(tabName = "overview",
        h2("Organisation overview"),
        fluidRow(
          valueBoxOutput("ov_students", width = 3),
          valueBoxOutput("ov_doctors", width = 3),
          valueBoxOutput("ov_lectures", width = 3),
          valueBoxOutput("ov_observations", width = 3)
        ),
        fluidRow(
          valueBoxOutput("ov_engagement", width = 3),
          valueBoxOutput("ov_sleep", width = 3),
          valueBoxOutput("ov_handraised", width = 3),
          valueBoxOutput("ov_yawn", width = 3)
        ),
        fluidRow(
          box(title = "Engagement over time", width = 8, status = "primary",
              plotlyOutput("ov_timeline", height = 320)),
          box(title = "Emotion distribution", width = 4, status = "info",
              plotlyOutput("ov_emotion_pie", height = 320))
        ),
        fluidRow(
          box(title = "Top doctors by mean engagement", width = 6, status = "success",
              plotlyOutput("ov_top_doctors", height = 320)),
          box(title = "Top students by mean engagement", width = 6, status = "success",
              plotlyOutput("ov_top_students", height = 320))
        ),
        fluidRow(
          box(title = "Lectures by status", width = 4, status = "warning",
              plotlyOutput("ov_lecture_status", height = 280)),
          box(title = "Observations per lecture", width = 8, status = "warning",
              plotlyOutput("ov_obs_per_lecture", height = 280))
        ),
        fluidRow(
          box(title = "Recent lectures", width = 12, status = "primary",
              DTOutput("ov_recent_lectures"))
        )
      ),

      # ───────────────────────────── LIVE LECTURE ────────────────────────
      tabItem(tabName = "live",
        h2("Live lecture monitor"),
        fluidRow(
          column(5,
            selectizeInput("live_pick",
                           "Active lecture (status = recording)",
                           choices = NULL,
                           options = list(placeholder = "No active lectures…"))),
          column(3,
            div(style = "padding-top: 28px;",
                checkboxInput("live_auto", "Auto-refresh every 5s", value = TRUE))),
          column(4,
            div(style = "padding-top: 28px; text-align: right;",
                actionButton("live_refresh", "Refresh now",
                             icon = icon("rotate"),
                             style = "background:#a78bfa;color:white;border:none;"),
                tags$small(textOutput("live_clock"),
                           style = "margin-left:10px;color:#94a3b8;")))
        ),
        fluidRow(
          valueBoxOutput("live_present", width = 3),
          valueBoxOutput("live_engagement", width = 3),
          valueBoxOutput("live_sleeping", width = 3),
          valueBoxOutput("live_handraised", width = 3)
        ),
        fluidRow(
          valueBoxOutput("live_yawning", width = 3),
          valueBoxOutput("live_alerts", width = 3),
          valueBoxOutput("live_observations", width = 3),
          valueBoxOutput("live_duration", width = 3)
        ),
        fluidRow(
          box(title = "Engagement timeline (last 30 minutes)", width = 8, status = "danger",
              plotlyOutput("live_timeline", height = 320)),
          box(title = "Current emotion mix", width = 4, status = "warning",
              plotlyOutput("live_emotion_pie", height = 320))
        ),
        fluidRow(
          box(title = "Per-student engagement (latest)", width = 12, status = "primary",
              DTOutput("live_students_table"))
        ),
        fluidRow(
          box(title = "Sleep alerts (most recent)", width = 6, status = "danger",
              DTOutput("live_sleep_alerts")),
          box(title = "Hand-raise events (most recent)", width = 6, status = "info",
              DTOutput("live_hand_events"))
        )
      ),

      # ───────────────────────────── STUDENTS ────────────────────────────
      tabItem(tabName = "students",
        h2("Student analytics"),
        fluidRow(
          column(4, selectizeInput("student_pick", "Search a student by name, email, or id",
                                   choices = NULL,
                                   options = list(placeholder = "Type to search…",
                                                  searchField = c("label","value")))),
          column(4, uiOutput("student_header")),
          column(4,
            div(style = "padding-top: 28px; text-align: right;",
                downloadButton("st_export_xlsx", "Export Excel",
                               icon = icon("file-excel"),
                               class = "btn-success",
                               style = "background:#10b981;color:white;border:none;margin-right:6px;"),
                downloadButton("st_export_pdf", "Export PDF",
                               icon = icon("file-pdf"),
                               class = "btn-danger",
                               style = "background:#ef4444;color:white;border:none;")))
        ),
        fluidRow(
          valueBoxOutput("st_obs", width = 3),
          valueBoxOutput("st_lectures", width = 3),
          valueBoxOutput("st_engagement", width = 3),
          valueBoxOutput("st_sleep", width = 3)
        ),
        fluidRow(
          valueBoxOutput("st_handraised", width = 3),
          valueBoxOutput("st_yawn", width = 3),
          valueBoxOutput("st_attention", width = 3),
          valueBoxOutput("st_grade", width = 3)
        ),
        fluidRow(
          box(title = "Engagement over time (this student)", width = 8,
              plotlyOutput("st_timeline", height = 300)),
          box(title = "Emotion mix", width = 4,
              plotlyOutput("st_emotion_pie", height = 300))
        ),
        fluidRow(
          box(title = "Engagement per lecture", width = 6,
              plotlyOutput("st_per_lecture", height = 320)),
          box(title = "Engagement per subject", width = 6,
              plotlyOutput("st_per_subject", height = 320))
        ),
        fluidRow(
          box(title = "Engagement per doctor", width = 6,
              plotlyOutput("st_per_doctor", height = 300)),
          box(title = "Gestures observed", width = 6,
              plotlyOutput("st_gestures", height = 300))
        ),
        fluidRow(
          box(title = "Sleep events timeline", width = 6,
              plotlyOutput("st_sleep_timeline", height = 280)),
          box(title = "Time-of-day pattern", width = 6,
              plotlyOutput("st_hour_pattern", height = 280))
        ),
        fluidRow(
          box(title = "Day-of-week pattern", width = 6,
              plotlyOutput("st_day_pattern", height = 260)),
          box(title = "Vs. class average (engagement %)", width = 6,
              plotlyOutput("st_vs_class", height = 260))
        ),
        fluidRow(
          box(title = "Recommendations", width = 6, status = "info",
              uiOutput("st_recs")),
          box(title = "Recent observations (last 200)", width = 6,
              DTOutput("st_recent_obs"))
        )
      ),

      # ───────────────────────────── DOCTORS ─────────────────────────────
      tabItem(tabName = "doctors",
        h2("Doctor analytics"),
        fluidRow(
          column(4, selectizeInput("doctor_pick", "Choose a doctor",
                                   choices = NULL, options = list(placeholder = "Search…"))),
          column(8, uiOutput("doctor_header"))
        ),
        fluidRow(
          valueBoxOutput("dr_lectures", width = 3),
          valueBoxOutput("dr_students", width = 3),
          valueBoxOutput("dr_engagement", width = 3),
          valueBoxOutput("dr_sleep", width = 3)
        ),
        fluidRow(
          valueBoxOutput("dr_handraised", width = 3),
          valueBoxOutput("dr_subjects", width = 3),
          valueBoxOutput("dr_observations", width = 3),
          valueBoxOutput("dr_classes", width = 3)
        ),
        fluidRow(
          box(title = "Per-lecture engagement", width = 8,
              plotlyOutput("dr_per_lecture", height = 320)),
          box(title = "Emotion mix across all this doctor's lectures", width = 4,
              plotlyOutput("dr_emotion_pie", height = 320))
        ),
        fluidRow(
          box(title = "Most engaged students under this doctor", width = 6,
              plotlyOutput("dr_top_students", height = 300)),
          box(title = "Least engaged students under this doctor", width = 6,
              plotlyOutput("dr_bottom_students", height = 300))
        ),
        fluidRow(
          box(title = "Student × Lecture engagement heatmap", width = 12,
              plotlyOutput("dr_heatmap", height = 380))
        ),
        fluidRow(
          box(title = "Hand-raised rate per lecture", width = 6,
              plotlyOutput("dr_handrate", height = 280)),
          box(title = "Sleep rate per lecture", width = 6,
              plotlyOutput("dr_sleeprate", height = 280))
        ),
        fluidRow(
          box(title = "Lectures table", width = 12,
              DTOutput("dr_lecture_table"))
        )
      ),

      # ───────────────────────────── PARENTS ─────────────────────────────
      tabItem(tabName = "parents",
        h2("Parent view — children analytics"),
        fluidRow(
          column(4, selectizeInput("parent_pick", "Choose a parent",
                                   choices = NULL, options = list(placeholder = "Search…"))),
          column(8, uiOutput("parent_header"))
        ),
        fluidRow(
          box(title = "Linked children", width = 12, status = "primary",
              DTOutput("pa_children_table"))
        ),
        fluidRow(
          box(title = "Engagement comparison across children", width = 6,
              plotlyOutput("pa_compare_engagement", height = 320)),
          box(title = "Sleep rate comparison across children", width = 6,
              plotlyOutput("pa_compare_sleep", height = 320))
        ),
        fluidRow(
          box(title = "Engagement over time (per child)", width = 12,
              plotlyOutput("pa_timeline", height = 340))
        ),
        fluidRow(
          box(title = "Emotion mix combined", width = 6,
              plotlyOutput("pa_emotion_pie", height = 300)),
          box(title = "Notifications received (about these children)", width = 6,
              DTOutput("pa_notifications"))
        )
      ),

      # ───────────────────────────── LECTURES ────────────────────────────
      tabItem(tabName = "lectures",
        h2("Per-lecture deep dive"),
        fluidRow(
          column(4, selectizeInput("lecture_pick", "Choose a lecture",
                                   choices = NULL, options = list(placeholder = "Search…"))),
          column(8, uiOutput("lecture_header"))
        ),
        fluidRow(
          valueBoxOutput("lec_students", width = 3),
          valueBoxOutput("lec_observations", width = 3),
          valueBoxOutput("lec_engagement", width = 3),
          valueBoxOutput("lec_sleep", width = 3)
        ),
        fluidRow(
          box(title = "Engagement timeline (within lecture)", width = 8,
              plotlyOutput("lec_timeline", height = 320)),
          box(title = "Emotion mix", width = 4,
              plotlyOutput("lec_emotion_pie", height = 320))
        ),
        fluidRow(
          box(title = "Per-student engagement", width = 6,
              plotlyOutput("lec_per_student", height = 320)),
          box(title = "Sleep events per student", width = 6,
              plotlyOutput("lec_sleep_bars", height = 320))
        ),
        fluidRow(
          box(title = "Gestures during lecture", width = 6,
              plotlyOutput("lec_gestures", height = 280)),
          box(title = "Yawning rate per student", width = 6,
              plotlyOutput("lec_yawns", height = 280))
        ),
        fluidRow(
          box(title = "Transcript snippet (first 30 segments)", width = 12,
              DTOutput("lec_transcript"))
        )
      ),

      # ───────────────────────── SUBJECTS & CLASSES ──────────────────────
      tabItem(tabName = "curriculum",
        h2("Subjects & classes"),
        fluidRow(
          valueBoxOutput("cu_subjects", width = 3),
          valueBoxOutput("cu_classes", width = 3),
          valueBoxOutput("cu_weeks", width = 3),
          valueBoxOutput("cu_enrolment", width = 3)
        ),
        fluidRow(
          box(title = "Mean engagement per subject", width = 6,
              plotlyOutput("cu_subject_eng", height = 320)),
          box(title = "Sleep rate per subject", width = 6,
              plotlyOutput("cu_subject_sleep", height = 320))
        ),
        fluidRow(
          box(title = "Lectures per subject", width = 6,
              plotlyOutput("cu_lectures_per_subject", height = 300)),
          box(title = "Enrollment per class", width = 6,
              plotlyOutput("cu_enrol_per_class", height = 300))
        ),
        fluidRow(
          box(title = "Engagement by week number", width = 12,
              plotlyOutput("cu_week_trend", height = 320))
        ),
        fluidRow(
          box(title = "Subjects table", width = 6, DTOutput("cu_subject_table")),
          box(title = "Classes table",  width = 6, DTOutput("cu_class_table"))
        )
      ),

      # ───────────────────────── TRENDS & CLUSTERS ───────────────────────
      tabItem(tabName = "trends",
        h2("Org-wide trends and clustering"),
        fluidRow(
          box(title = "Engagement by hour of day", width = 6,
              plotlyOutput("tr_hour", height = 300)),
          box(title = "Engagement by day of week", width = 6,
              plotlyOutput("tr_day", height = 300))
        ),
        fluidRow(
          box(title = "Doctor cluster — engagement vs sleep rate", width = 6,
              plotlyOutput("tr_doc_cluster", height = 360)),
          box(title = "Student cluster — engagement vs hand-raised rate", width = 6,
              plotlyOutput("tr_st_cluster", height = 360))
        ),
        fluidRow(
          box(title = "Engagement distribution (histogram)", width = 6,
              plotlyOutput("tr_eng_hist", height = 300)),
          box(title = "Engagement scatter (per lecture)", width = 6,
              plotlyOutput("tr_lecture_scatter", height = 300))
        ),
        fluidRow(
          box(title = "Engagement over calendar weeks", width = 12,
              plotlyOutput("tr_calendar", height = 320))
        )
      ),

      # ───────────────────────────── TRANSCRIPTS ─────────────────────────
      tabItem(tabName = "transcripts",
        h2("Transcript analytics"),
        fluidRow(
          valueBoxOutput("tx_transcripts", width = 3),
          valueBoxOutput("tx_segments", width = 3),
          valueBoxOutput("tx_words", width = 3),
          valueBoxOutput("tx_languages", width = 3)
        ),
        fluidRow(
          box(title = "Segments per transcript", width = 6,
              plotlyOutput("tx_segments_per", height = 320)),
          box(title = "Average segment length (seconds)", width = 6,
              plotlyOutput("tx_avg_seg", height = 320))
        ),
        fluidRow(
          box(title = "Top words across all transcripts", width = 8,
              plotlyOutput("tx_words_chart", height = 360)),
          box(title = "Language mix", width = 4,
              plotlyOutput("tx_languages_pie", height = 360))
        ),
        fluidRow(
          box(title = "Transcripts table", width = 12, DTOutput("tx_table"))
        )
      ),

      # ───────────────────────────── NOTIFICATIONS ───────────────────────
      tabItem(tabName = "notifications",
        h2("Notifications audit"),
        fluidRow(
          valueBoxOutput("nt_total", width = 3),
          valueBoxOutput("nt_sent", width = 3),
          valueBoxOutput("nt_failed", width = 3),
          valueBoxOutput("nt_recipients", width = 3)
        ),
        fluidRow(
          box(title = "Notifications per doctor", width = 6,
              plotlyOutput("nt_per_doctor", height = 320)),
          box(title = "Notifications by status", width = 6,
              plotlyOutput("nt_status_pie", height = 320))
        ),
        fluidRow(
          box(title = "Notifications over time", width = 12,
              plotlyOutput("nt_timeline", height = 280))
        ),
        fluidRow(
          box(title = "All notifications", width = 12, DTOutput("nt_table"))
        )
      ),

      # ───────────────────────────── DATA QUALITY ────────────────────────
      tabItem(tabName = "data_quality",
        h2("Data coverage and health"),
        fluidRow(
          valueBoxOutput("dq_emo_rows", width = 3),
          valueBoxOutput("dq_students_no_data", width = 3),
          valueBoxOutput("dq_lectures_no_data", width = 3),
          valueBoxOutput("dq_date_span", width = 3)
        ),
        fluidRow(
          box(title = "Documents per collection", width = 6,
              plotlyOutput("dq_collection_counts", height = 320)),
          box(title = "Observations per day", width = 6,
              plotlyOutput("dq_obs_per_day", height = 320))
        ),
        fluidRow(
          box(title = "Students with vs without observations", width = 6,
              plotlyOutput("dq_students_coverage", height = 280)),
          box(title = "Lectures with vs without observations", width = 6,
              plotlyOutput("dq_lectures_coverage", height = 280))
        )
      )
    )
  )
)
}

# ═══════════════════════════════════════════════════════════════════════════
# Server
# ═══════════════════════════════════════════════════════════════════════════

server <- function(input, output, session) {

  # ════════════════════════════════════════════════════════════ AUTH
  # Admin-only login. Until the user signs in as admin, every data
  # reactive returns empty and a non-dismissable modal blocks the UI.
  auth_state <- reactiveValues(
    signed_in = FALSE,
    uid       = NULL,
    email     = NULL,
    role      = NULL,
    linked_id = NULL,
    error     = NULL,
    busy      = FALSE
  )

  # Render the full-screen login overlay when NOT signed in.
  output$login_overlay <- renderUI({
    if (isTRUE(auth_state$signed_in)) return(NULL)
    tags$div(class = "login-screen",
      tags$div(class = "login-card",
        tags$div(class = "login-brand",
          tags$img(src = "logo.png", alt = "EDU Link", class = "login-brand-logo-img"),
          tags$div(
            tags$div(class = "login-brand-title",
                     HTML('EDU <span style="color:#64748b;font-weight:500;">Link</span>')),
            tags$div(class = "login-brand-sub", "Connect · Learn · Grow · Succeed")
          )
        ),
        tags$h1(class = "login-title", "Welcome back"),
        tags$p(class = "login-lead",
               "Pick a role for instant sign-in, or enter your own credentials."),

        # ── Quick sign-in cards (one per role) ──
        tags$div(class = "quick-grid",
          actionButton("login_quick_admin",
            label = tagList(
              icon("user-shield", class = "qicon"),
              tags$span(class = "qrole", "Admin"),
              tags$span(class = "qmail", "admin")
            ),
            class = "quick-card quick-admin"),
          actionButton("login_quick_doctor",
            label = tagList(
              icon("user-doctor", class = "qicon"),
              tags$span(class = "qrole", "Doctor"),
              tags$span(class = "qmail", "ahmed hassan")
            ),
            class = "quick-card quick-doctor"),
          actionButton("login_quick_student",
            label = tagList(
              icon("user-graduate", class = "qicon"),
              tags$span(class = "qrole", "Student"),
              tags$span(class = "qmail", "nada Awad")
            ),
            class = "quick-card quick-student"),
          actionButton("login_quick_parent",
            label = tagList(
              icon("people-roof", class = "qicon"),
              tags$span(class = "qrole", "Parent"),
              tags$span(class = "qmail", "khaled")
            ),
            class = "quick-card quick-parent")
        ),

        tags$div(class = "quick-sep", tags$span("or sign in manually")),

        textInput("login_email", "Email",
                  value = isolate(input$login_email) %||% "admin@classroom.local",
                  width = "100%"),
        passwordInput("login_password", "Password",
                      value = "123456789",
                      placeholder = "••••••••", width = "100%"),
        if (!is.null(auth_state$error) && nzchar(auth_state$error))
          tags$div(class = "login-error",
            icon("triangle-exclamation"),
            tags$span(auth_state$error))
        else NULL,
        actionButton("login_submit",
                     label = tagList(icon("right-to-bracket"), " Sign in"),
                     class = "login-submit"),
        tags$div(class = "login-foot",
          sprintf("Auth: %s",
            if (nzchar(Sys.getenv("FIREBASE_AUTH_EMULATOR_HOST", unset = ""))
                || nzchar(Sys.getenv("FIRESTORE_EMULATOR_HOST", unset = "")))
              "Firebase emulator (localhost)"
            else "Production Firebase"
          )
        )
      )
    )
  })

  # Quick-sign-in account map (mirrors web/src/pages/Login.jsx)
  QUICK_ACCOUNTS <- list(
    admin   = list(email = "admin@classroom.local",      password = "123456789"),
    doctor  = list(email = "ahmed.hassan@nada.edu",      password = "Doctor@123"),
    student = list(email = "nadasoska2005@gmail.com",    password = "123456789"),
    parent  = list(email = "seif.amr.ebeid05@gmail.com", password = "123456789")
  )

  quick_signin <- function(role_key) {
    acc <- QUICK_ACCOUNTS[[role_key]]
    if (is.null(acc)) return()
    res <- firebase_signin(acc$email, acc$password)
    if (!isTRUE(res$ok)) {
      auth_state$error <- res$error %||% "Sign-in failed."
      return()
    }
    prof <- firebase_user_profile(res$uid)
    if (is.null(prof) || is.null(prof$role) || !nzchar(prof$role)) {
      auth_state$error <- "Account has no role configured."
      return()
    }
    auth_state$signed_in <- TRUE
    auth_state$uid       <- res$uid
    auth_state$email     <- res$email
    auth_state$role      <- prof$role
    auth_state$linked_id <- prof$linked_id
    auth_state$error     <- NULL
  }

  observeEvent(input$login_quick_admin,   quick_signin("admin"),   ignoreInit = TRUE)
  observeEvent(input$login_quick_doctor,  quick_signin("doctor"),  ignoreInit = TRUE)
  observeEvent(input$login_quick_student, quick_signin("student"), ignoreInit = TRUE)
  observeEvent(input$login_quick_parent,  quick_signin("parent"),  ignoreInit = TRUE)

  # Tell the client whether to reveal the dashboard. The chrome is shown
  # ONLY when both conditions hold:
  #   1. user is signed in
  #   2. initial data warm-up has completed
  # While data is loading we keep the chrome hidden and let the loading
  # curtain cover the page — so the user never sees a brief flash of
  # the wrong role's tabs.
  observe({
    show_chrome <- isTRUE(auth_state$signed_in) && isTRUE(data_loaded())
    session$sendCustomMessage("toggleLock", list(signed_in = show_chrome))
  })

  observeEvent(input$login_submit, {
    auth_state$error <- NULL
    email <- trimws(input$login_email %||% "")
    pwd   <- input$login_password %||% ""
    if (!nzchar(email) || !nzchar(pwd)) {
      auth_state$error <- "Email and password are required."
      return()
    }
    res <- firebase_signin(email, pwd)
    if (!isTRUE(res$ok)) {
      auth_state$error <- res$error %||% "Sign-in failed."
      return()
    }
    prof <- firebase_user_profile(res$uid)
    if (is.null(prof) || is.null(prof$role) || !nzchar(prof$role)) {
      auth_state$error <- "Account has no role configured."
      return()
    }
    if (!(prof$role %in% c("admin","doctor","student","parent"))) {
      auth_state$error <- sprintf("Unknown role '%s'.", prof$role)
      return()
    }
    auth_state$signed_in <- TRUE
    auth_state$uid       <- res$uid
    auth_state$email     <- res$email
    auth_state$role      <- prof$role
    auth_state$linked_id <- prof$linked_id
    auth_state$error     <- NULL
  })

  observeEvent(input$sign_out, {
    auth_state$signed_in <- FALSE
    auth_state$uid <- NULL
    auth_state$email <- NULL
    auth_state$role <- NULL
    bust_cache()
  }, ignoreInit = TRUE)

  output$auth_who <- renderText({
    if (auth_state$signed_in) sprintf("Signed in: %s", auth_state$email) else "Not signed in"
  })

  # Gate every data load behind auth.
  require_auth <- reactive({
    req(auth_state$signed_in)
    TRUE
  })

  # ─────────────────────────────────────────────────────────────────────
  # Role-specific sidebar. Each role only sees the tabs that matter to them.
  #   admin   → full org view (all 11 tabs)
  #   doctor  → their teaching dashboard
  #   student → personal engagement view
  #   parent  → children-only view
  output$dyn_menu <- renderMenu({
    role <- auth_state$role %||% "admin"
    mi <- function(label, tabName, icon_name, ...) {
      menuItem(label, tabName = tabName, icon = icon(icon_name), ...)
    }
    items <- switch(role,
      admin = list(
        mi("Overview",            "overview",      "gauge-high"),
        mi("Live Lecture",        "live",          "circle-dot",
           badgeLabel = "live", badgeColor = "red"),
        mi("Students",            "students",      "user-graduate"),
        mi("Doctors",             "doctors",       "user-tie"),
        mi("Parents",             "parents",       "people-roof"),
        mi("Lectures",            "lectures",      "chalkboard-user"),
        mi("Subjects & Classes",  "curriculum",    "book"),
        mi("Trends & Clusters",   "trends",        "chart-line"),
        mi("Transcripts",         "transcripts",   "file-lines"),
        mi("Notifications",       "notifications", "envelope"),
        mi("Data Quality",        "data_quality",  "database")
      ),
      doctor = list(
        mi("My Overview",         "overview",      "gauge-high"),
        mi("Live Lecture",        "live",          "circle-dot",
           badgeLabel = "live", badgeColor = "red"),
        mi("My Students",         "students",      "user-graduate"),
        mi("My Lectures",         "lectures",      "chalkboard-user"),
        mi("Trends",              "trends",        "chart-line"),
        mi("Transcripts",         "transcripts",   "file-lines"),
        mi("Notifications",       "notifications", "envelope")
      ),
      student = list(
        mi("My Engagement",       "overview",      "gauge-high"),
        mi("My Lectures",         "lectures",      "chalkboard-user"),
        mi("Transcripts",         "transcripts",   "file-lines"),
        mi("Engagement Trends",   "trends",        "chart-line")
      ),
      parent = list(
        mi("Overview",            "overview",      "gauge-high"),
        mi("My Children",         "students",      "user-graduate"),
        mi("Their Lectures",      "lectures",      "chalkboard-user"),
        mi("Engagement Trends",   "trends",        "chart-line")
      ),
      list(mi("Overview", "overview", "gauge-high"))
    )
    do.call(sidebarMenu, c(list(id = "sidebar"), items))
  })

  # When the role changes, snap the active tab back to "overview" so the
  # user doesn't get stuck on a tab their new role can't see.
  observeEvent(auth_state$role, {
    if (isTRUE(auth_state$signed_in)) {
      updateTabItems(session, "sidebar", "overview")
    }
  }, ignoreInit = TRUE)

  # ── Loading curtain — shown over the content while initial data loads.
  data_loaded <- reactiveVal(FALSE)

  output$loading_curtain <- renderUI({
    if (!isTRUE(auth_state$signed_in) || isTRUE(data_loaded())) return(NULL)
    tags$div(class = "loading-curtain",
      tags$img(src = "logo.png", alt = "EDU Link", class = "loading-logo"),
      tags$div(class = "loading-spinner"),
      tags$div(class = "loading-text", sprintf("Loading your %s dashboard…",
        auth_state$role %||% "")),
      tags$div(class = "loading-sub", "Fetching students, lectures and engagement data…")
    )
  })

  # On sign-in: flip the curtain on, then defer the heavy load by a tick
  # via shiny::invalidateLater so the curtain actually paints first. After
  # the load completes, flip the curtain off.
  observeEvent(auth_state$signed_in, {
    if (!isTRUE(auth_state$signed_in)) {
      data_loaded(FALSE)
      return()
    }
    data_loaded(FALSE)
    # Use `later` to defer the synchronous load to the next tick so the
    # client gets a chance to paint the spinner first.
    if (requireNamespace("later", quietly = TRUE)) {
      later::later(function() {
        isolate({
          tryCatch({
            # Warm up every collection so subsequent renders are cache hits.
            students_data();  doctors_data();  parents_data()
            lectures_data(); subjects_data(); classes_data(); weeks_data()
            emo_data()
            data_loaded(TRUE)
          }, error = function(e) {
            message(sprintf("[warm-up] %s", conditionMessage(e)))
            data_loaded(TRUE)  # let the dashboard render even on errors
          })
        })
      }, delay = 0.1)
    } else {
      # Fallback: no `later` available, load synchronously.
      isolate({
        students_data(); doctors_data(); parents_data()
        lectures_data(); subjects_data(); classes_data(); weeks_data()
        emo_data()
      })
      data_loaded(TRUE)
    }
  }, ignoreInit = TRUE)

  # ─────────────────────────────────────────────────────────────────────
  # Role-scoped data filters.
  #   admin   -> full dataset (no filtering)
  #   doctor  -> ONLY their lectures, their enrolled students, their subjects,
  #              their classes, the emotions inside their lectures
  #   student -> ONLY their own student record, their own emotion rows,
  #              ONLY the lectures they're enrolled in, ONLY the doctors
  #              teaching those lectures
  #   parent  -> linked children only — children's lectures, children's
  #              emotions, doctors teaching those lectures, etc.
  # Every collection's wrapper reactive routes through one of these so
  # nothing leaks across roles.

  # Cache the parent's linked_student_ids for the session (recomputed if
  # parents_data changes).
  .parent_children <- function() {
    if (auth_state$role != "parent") return(character(0))
    p <- parents_data()
    if (nrow(p) == 0) return(character(0))
    if (!"id" %in% names(p)) p$id <- p$parent_id %||% NA_character_
    pdoc <- p[p$id == auth_state$linked_id, , drop = FALSE]
    if (nrow(pdoc) == 0 || !"linked_student_ids" %in% names(pdoc)) return(character(0))
    raw <- pdoc$linked_student_ids[[1]]
    if (is.null(raw)) return(character(0))
    if (is.list(raw)) return(unlist(raw, use.names = FALSE))
    if (is.character(raw) && length(raw) == 1 && grepl(",", raw, fixed = TRUE))
      return(trimws(unlist(strsplit(raw, ",", fixed = TRUE))))
    as.character(raw)
  }

  scope_lectures_for <- function(lec) {
    role <- auth_state$role; lid <- auth_state$linked_id
    if (is.null(role) || nrow(lec) == 0) return(lec)
    if (role == "admin")  return(lec)
    if (role == "doctor" && "doctor_id" %in% names(lec))
      return(dplyr::filter(lec, doctor_id == lid))
    if (role == "student" && "enrolled_student_ids" %in% names(lec))
      return(dplyr::filter(lec, vapply(enrolled_student_ids, function(x)
        lid %in% unlist(x %||% character(0), use.names = FALSE), logical(1))))
    if (role == "parent") {
      child_ids <- .parent_children()
      if (!length(child_ids)) return(lec[0, ])
      return(dplyr::filter(lec, vapply(enrolled_student_ids, function(x)
        any(unlist(x %||% character(0), use.names = FALSE) %in% child_ids),
        logical(1))))
    }
    lec
  }
  scope_emo_for <- function(emo) {
    role <- auth_state$role; lid <- auth_state$linked_id
    if (is.null(role) || nrow(emo) == 0) return(emo)
    if (role == "admin")  return(emo)
    if (role == "doctor") {
      lec_ids <- scope_lectures_for(lectures_data())$id
      return(dplyr::filter(emo, lecture_id %in% lec_ids))
    }
    if (role == "student") return(dplyr::filter(emo, student_id == lid))
    if (role == "parent") {
      child_ids <- .parent_children()
      if (!length(child_ids)) return(emo[0, ])
      return(dplyr::filter(emo, student_id %in% child_ids))
    }
    emo
  }
  scope_students_for <- function(s) {
    role <- auth_state$role; lid <- auth_state$linked_id
    if (is.null(role) || nrow(s) == 0) return(s)
    if (role == "admin")  return(s)
    if (!"id" %in% names(s)) s$id <- s$student_id %||% NA_character_
    if (role == "student") return(dplyr::filter(s, id == lid))
    if (role == "parent")  return(dplyr::filter(s, id %in% .parent_children()))
    if (role == "doctor") {
      lec <- scope_lectures_for(lectures_data())
      ids <- if (nrow(lec) > 0 && "enrolled_student_ids" %in% names(lec))
               unique(unlist(lec$enrolled_student_ids, use.names = FALSE)) else character(0)
      return(dplyr::filter(s, id %in% ids))
    }
    s
  }
  scope_doctors_for <- function(d) {
    role <- auth_state$role; lid <- auth_state$linked_id
    if (is.null(role) || nrow(d) == 0) return(d)
    if (role == "admin")  return(d)
    if (!"id" %in% names(d)) d$id <- d$doctor_id %||% NA_character_
    if (role == "doctor")  return(dplyr::filter(d, id == lid))
    # For student/parent: doctors teaching their lectures
    lec <- scope_lectures_for(lectures_data())
    doc_ids <- if (nrow(lec) > 0 && "doctor_id" %in% names(lec))
                 unique(lec$doctor_id) else character(0)
    dplyr::filter(d, id %in% doc_ids)
  }
  scope_parents_for <- function(p) {
    role <- auth_state$role; lid <- auth_state$linked_id
    if (is.null(role) || nrow(p) == 0) return(p)
    if (role == "admin")  return(p)
    if (!"id" %in% names(p)) p$id <- p$parent_id %||% NA_character_
    if (role == "parent")  return(dplyr::filter(p, id == lid))
    # Doctor: parents of their enrolled students
    if (role == "doctor") {
      stud_ids <- scope_students_for(students_data())$id
      keep <- vapply(p$linked_student_ids %||% list(), function(x)
        any(unlist(x %||% character(0), use.names = FALSE) %in% stud_ids),
        logical(1))
      return(p[keep, , drop = FALSE])
    }
    # Student: their own parents (if any)
    if (role == "student") {
      keep <- vapply(p$linked_student_ids %||% list(), function(x)
        lid %in% unlist(x %||% character(0), use.names = FALSE), logical(1))
      return(p[keep, , drop = FALSE])
    }
    p
  }
  scope_subjects_for <- function(s) {
    role <- auth_state$role; lid <- auth_state$linked_id
    if (is.null(role) || nrow(s) == 0) return(s)
    if (role == "admin")  return(s)
    if (!"id" %in% names(s)) s$id <- s$subject_id %||% NA_character_
    if (role == "doctor" && "doctor_id" %in% names(s))
      return(dplyr::filter(s, doctor_id == lid))
    # student/parent: subjects of their lectures
    lec <- scope_lectures_for(lectures_data())
    if (nrow(lec) == 0) return(s[0, ])
    if ("subject_id" %in% names(lec))
      return(dplyr::filter(s, id %in% unique(lec$subject_id)))
    s
  }
  scope_classes_for <- function(c) {
    role <- auth_state$role
    if (is.null(role) || nrow(c) == 0) return(c)
    if (role == "admin")  return(c)
    if (!"id" %in% names(c)) c$id <- c$class_id %||% NA_character_
    lec <- scope_lectures_for(lectures_data())
    if (nrow(lec) == 0 || !"class_id" %in% names(lec)) return(c[0, ])
    dplyr::filter(c, id %in% unique(lec$class_id))
  }
  scope_weeks_for <- function(w) {
    role <- auth_state$role
    if (is.null(role) || nrow(w) == 0) return(w)
    if (role == "admin")  return(w)
    lec <- scope_lectures_for(lectures_data())
    if (nrow(lec) == 0 || !"week_id" %in% names(lec)) return(w[0, ])
    if (!"id" %in% names(w)) w$id <- w$week_id %||% NA_character_
    dplyr::filter(w, id %in% unique(lec$week_id))
  }
  scope_grades_for <- function(g) {
    role <- auth_state$role; lid <- auth_state$linked_id
    if (is.null(role) || nrow(g) == 0) return(g)
    if (role == "admin")  return(g)
    if (role == "doctor" && "doctor_id" %in% names(g))
      return(dplyr::filter(g, doctor_id == lid))
    if (role == "student" && "student_id" %in% names(g))
      return(dplyr::filter(g, student_id == lid))
    if (role == "parent" && "student_id" %in% names(g))
      return(dplyr::filter(g, student_id %in% .parent_children()))
    g
  }
  scope_notifications_for <- function(n) {
    role <- auth_state$role; lid <- auth_state$linked_id
    if (is.null(role) || nrow(n) == 0) return(n)
    if (role == "admin")  return(n)
    if (role == "doctor" && "sender_doctor_id" %in% names(n))
      return(dplyr::filter(n, sender_doctor_id == lid))
    # student/parent: notifications they were a recipient of
    ids_to_check <- if (role == "student") lid else .parent_children()
    if (!length(ids_to_check) || !"recipient_student_ids" %in% names(n)) return(n[0, ])
    keep <- vapply(n$recipient_student_ids, function(x)
      any(unlist(x %||% character(0), use.names = FALSE) %in% ids_to_check),
      logical(1))
    n[keep, , drop = FALSE]
  }
  scope_transcripts_for <- function(t) {
    role <- auth_state$role
    if (is.null(role) || nrow(t) == 0) return(t)
    if (role == "admin")  return(t)
    lec_ids <- scope_lectures_for(lectures_data())$id
    if (!length(lec_ids) || !"lecture_id" %in% names(t)) return(t[0, ])
    dplyr::filter(t, lecture_id %in% lec_ids)
  }

  observeEvent(input$refresh, { bust_cache(); session$reload() }, ignoreInit = TRUE)

  observeEvent(input$theme_toggle, {
    new_mode <- if (is_light_mode()) "dark" else "light"
    Sys.setenv(UI_THEME = new_mode)
    bust_cache()
    session$reload()
  }, ignoreInit = TRUE)

  output$env_info <- renderText({
    if (nzchar(Sys.getenv("FIRESTORE_EMULATOR_HOST", unset = ""))) {
      sprintf("Emulator @ %s", Sys.getenv("FIRESTORE_EMULATOR_HOST"))
    } else if (nzchar(Sys.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", unset = ""))) {
      "Production Firestore"
    } else {
      "CSV fallback (no Firestore env vars)"
    }
  })

  # ── Reactives so we don't re-fetch every render ─────────────────────
  # All gated behind require_auth() — no Firestore traffic until signed in.
  # emo() and lectures() are also role-scoped so a doctor sees only their
  # lectures, a student only their own observations, a parent only their
  # children's. Admin sees everything.
  # Every wrapper is gated on require_auth() (no data before sign-in) AND
  # role-scoped (each role sees only their slice of every collection).
  emo       <- reactive({ require_auth(); input$refresh; scope_emo_for(emo_data()) })
  students  <- reactive({ require_auth(); input$refresh; scope_students_for(students_data()) })
  doctors   <- reactive({ require_auth(); input$refresh; scope_doctors_for(doctors_data()) })
  parents   <- reactive({ require_auth(); input$refresh; scope_parents_for(parents_data()) })
  subjects  <- reactive({ require_auth(); input$refresh; scope_subjects_for(subjects_data()) })
  classes   <- reactive({ require_auth(); input$refresh; scope_classes_for(classes_data()) })
  weeks     <- reactive({ require_auth(); input$refresh; scope_weeks_for(weeks_data()) })
  lectures  <- reactive({ require_auth(); input$refresh; scope_lectures_for(lectures_data()) })
  grades    <- reactive({ require_auth(); input$refresh; scope_grades_for(grades_data()) })
  notifications <- reactive({ require_auth(); input$refresh; scope_notifications_for(notifications_data()) })
  transcripts   <- reactive({ require_auth(); input$refresh; scope_transcripts_for(transcripts_data()) })
  segments      <- reactive({ require_auth(); input$refresh; segments_data() })

  # Choices
  observe({
    updateSelectizeInput(session, "student_pick",
                         choices = build_choices(students(), "id", c("name", "email")),
                         server = TRUE)
    updateSelectizeInput(session, "doctor_pick",
                         choices = build_choices(doctors(), "id", c("name", "email", "department")),
                         server = TRUE)
    updateSelectizeInput(session, "parent_pick",
                         choices = build_choices(parents(), "id", c("name", "email")),
                         server = TRUE)
    updateSelectizeInput(session, "lecture_pick",
                         choices = build_choices(lectures(), "id", c("title", "subject")),
                         server = TRUE)
  })

  # ════════════════════════════════════════════════════════════ OVERVIEW
  output$ov_students     <- renderValueBox(valueBox(fmt_int(nrow(students())), "Students", icon = icon("user-graduate"), color = "purple"))
  output$ov_doctors      <- renderValueBox(valueBox(fmt_int(nrow(doctors())), "Doctors",   icon = icon("user-tie"),     color = "blue"))
  output$ov_lectures     <- renderValueBox(valueBox(fmt_int(nrow(lectures())), "Lectures", icon = icon("chalkboard"),   color = "teal"))
  output$ov_observations <- renderValueBox(valueBox(fmt_int(nrow(emo())),     "Observations", icon = icon("eye"),       color = "olive"))

  ov_kpi <- reactive(kpi_summary(emo()))
  output$ov_engagement <- renderValueBox(valueBox(fmt_pct(ov_kpi()$mean_engagement), "Mean engagement", icon = icon("bolt"), color = "green"))
  output$ov_sleep      <- renderValueBox(valueBox(fmt_pct(ov_kpi()$sleep_rate), "Sleep rate", icon = icon("bed"), color = "red"))
  output$ov_handraised <- renderValueBox(valueBox(fmt_pct(ov_kpi()$hand_raised_rate), "Hand-raised", icon = icon("hand"), color = "yellow"))
  output$ov_yawn       <- renderValueBox(valueBox(fmt_pct(ov_kpi()$yawn_rate), "Yawn rate", icon = icon("face-tired"), color = "orange"))

  output$ov_timeline <- renderPlotly({
    df <- engagement_timeline(emo(), bin_seconds = 60)
    if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~t, y = ~mean_engagement, color = ~lecture_id,
            type = "scatter", mode = "lines",
            colors = CHART_PALETTE) |>
      plotly::layout(yaxis = list(title = "Engagement (0–1)", range = c(0,1)),
                     xaxis = list(title = NULL)) |> style_plotly()
  })

  output$ov_emotion_pie <- renderPlotly({
    df <- emotion_freq(emo()); if (nrow(df) == 0) return(empty_plot())
    .pie(df, "emotion", "n")
  })

  output$ov_top_doctors <- renderPlotly({
    df <- per_doctor_summary(emo(), lectures()) |> join_doctor_names(doctors())
    if (nrow(df) == 0) return(empty_plot())
    df <- top_n_summary(df, "mean_engagement", 10)
    plot_ly(df, x = ~mean_engagement, y = ~reorder(coalesce(doctor_name, doctor_id), mean_engagement),
            type = "bar", orientation = "h", marker = list(color = PALETTE$primary)) |>
      plotly::layout(xaxis = list(title = "Mean engagement", range = c(0,1)),
                     yaxis = list(title = NULL)) |> style_plotly()
  })

  output$ov_top_students <- renderPlotly({
    df <- per_student_summary(emo()) |> join_student_names(students())
    if (nrow(df) == 0) return(empty_plot())
    df <- top_n_summary(df, "mean_engagement", 10)
    plot_ly(df, x = ~mean_engagement, y = ~reorder(coalesce(student_name, student_id), mean_engagement),
            type = "bar", orientation = "h", marker = list(color = PALETTE$accent)) |>
      plotly::layout(xaxis = list(title = "Mean engagement", range = c(0,1)),
                     yaxis = list(title = NULL)) |> style_plotly()
  })

  output$ov_lecture_status <- renderPlotly({
    lec <- lectures(); if (nrow(lec) == 0 || !"status" %in% names(lec)) return(empty_plot())
    df <- lec |> dplyr::count(status, name = "n")
    .pie(df, "status", "n")
  })

  output$ov_obs_per_lecture <- renderPlotly({
    df <- per_lecture_summary(emo()) |> join_lecture_titles(lectures())
    if (nrow(df) == 0) return(empty_plot())
    df <- head(df[order(-df$observations), , drop = FALSE], 15)
    plot_ly(df, x = ~observations, y = ~reorder(lecture_title, observations),
            type = "bar", orientation = "h", marker = list(color = PALETTE$primary2)) |>
      plotly::layout(xaxis = list(title = "Observations"), yaxis = list(title = NULL)) |>
      style_plotly()
  })

  output$ov_recent_lectures <- renderDT({
    lec <- lectures(); if (nrow(lec) == 0) return(datatable(data.frame(message = "No lectures yet")))
    cols <- intersect(c("id","title","subject","doctor_id","status","date"), names(lec))
    dt <- lec[, cols, drop = FALSE]
    if ("date" %in% names(dt)) dt <- dt[order(as.character(dt$date), decreasing = TRUE), , drop = FALSE]
    datatable(dt, options = list(pageLength = 10, scrollX = TRUE), rownames = FALSE)
  })

  # ════════════════════════════════════════════════════════════ LIVE LECTURE
  # Auto-refresh tick (5s when enabled). Tied to the live tab specifically so
  # it doesn't pull data while the user is on another page.
  live_tick <- reactive({
    if (isTRUE(input$live_auto) && identical(input$sidebar, "live")) {
      invalidateLater(5000, session)
    }
    input$live_refresh
    Sys.time()
  })

  # Always re-fetch lectures + emotions on the tick, no cache.
  live_lectures <- reactive({
    live_tick()
    tryCatch(load_lectures(), error = function(e) dplyr::tibble())
  })
  live_emotions <- reactive({
    live_tick()
    tryCatch(load_from_firestore(), error = function(e) {
      tryCatch(load_emotions(), error = function(e2) dplyr::tibble())
    })
  })

  # Build the picker choices from currently-recording lectures.
  observe({
    lec <- live_lectures()
    if (nrow(lec) == 0 || !"status" %in% names(lec)) {
      updateSelectizeInput(session, "live_pick", choices = character(0)); return()
    }
    rec <- lec[lec$status == "recording", , drop = FALSE]
    if (nrow(rec) == 0) {
      updateSelectizeInput(session, "live_pick", choices = character(0)); return()
    }
    if (!"id" %in% names(rec)) rec$id <- rec$lecture_id %||% NA_character_
    labels <- ifelse(is.na(rec$title) | !nzchar(rec$title), rec$id, rec$title)
    updateSelectizeInput(session, "live_pick",
                         choices = stats::setNames(rec$id, paste0(labels, "  ·  ", rec$id)),
                         selected = isolate(input$live_pick) %||% rec$id[1])
  })

  output$live_clock <- renderText({
    live_tick()
    paste("Last refresh:", format(Sys.time(), "%H:%M:%S"))
  })

  live_lec_emo <- reactive({
    lid <- input$live_pick
    e <- live_emotions()
    if (is.null(lid) || !nzchar(lid) || nrow(e) == 0) return(e[0, ])
    e[e$lecture_id == lid, , drop = FALSE]
  })

  live_kpi <- reactive(kpi_summary(live_lec_emo()))

  output$live_present <- renderValueBox({
    v <- live_kpi()$students
    valueBox(fmt_int(v %||% 0), "Students seen", icon = icon("users"), color = "purple")
  })
  output$live_engagement <- renderValueBox({
    valueBox(fmt_pct(live_kpi()$mean_engagement), "Mean engagement", icon = icon("bolt"), color = "green")
  })
  output$live_sleeping <- renderValueBox({
    valueBox(fmt_pct(live_kpi()$sleep_rate), "Sleeping now", icon = icon("bed"), color = "red")
  })
  output$live_handraised <- renderValueBox({
    valueBox(fmt_pct(live_kpi()$hand_raised_rate), "Hand-raised", icon = icon("hand"), color = "yellow")
  })
  output$live_yawning <- renderValueBox({
    valueBox(fmt_pct(live_kpi()$yawn_rate), "Yawn rate", icon = icon("face-tired"), color = "orange")
  })
  output$live_alerts <- renderValueBox({
    e <- live_lec_emo()
    n <- if (nrow(e) > 0 && "cheat_warning" %in% names(e))
      sum(as.logical(e$cheat_warning), na.rm = TRUE) else 0
    valueBox(fmt_int(n), "Phone-use alerts", icon = icon("triangle-exclamation"), color = "maroon")
  })
  output$live_observations <- renderValueBox({
    valueBox(fmt_int(live_kpi()$observations), "Observations", icon = icon("eye"), color = "blue")
  })
  output$live_duration <- renderValueBox({
    e <- live_lec_emo()
    txt <- if (nrow(e) == 0) "—" else {
      span <- as.numeric(difftime(max(e$timestamp, na.rm = TRUE),
                                  min(e$timestamp, na.rm = TRUE), units = "mins"))
      sprintf("%.1f min", span)
    }
    valueBox(txt, "Lecture span", icon = icon("clock"), color = "teal")
  })

  output$live_timeline <- renderPlotly({
    e <- live_lec_emo(); if (nrow(e) == 0) return(empty_plot("Waiting for live data…"))
    cutoff <- Sys.time() - 30 * 60
    df <- e[e$timestamp >= cutoff, , drop = FALSE]
    if (nrow(df) == 0) df <- e
    df <- df |> dplyr::mutate(t = lubridate::floor_date(timestamp, "20 seconds")) |>
      dplyr::group_by(t) |>
      dplyr::summarise(mean_engagement = mean(engagement_score, na.rm = TRUE),
                       sleep_rate      = mean(state == "sleeping", na.rm = TRUE),
                       .groups = "drop")
    plot_ly(df) |>
      add_lines(x = ~t, y = ~mean_engagement, name = "Engagement",
                line = list(color = PALETTE$primary, width = 3)) |>
      add_lines(x = ~t, y = ~sleep_rate, name = "Sleep rate",
                line = list(color = PALETTE$bad, dash = "dot")) |>
      plotly::layout(yaxis = list(range = c(0,1)),
                     xaxis = list(title = NULL)) |> style_plotly()
  })

  output$live_emotion_pie <- renderPlotly({
    e <- live_lec_emo(); if (nrow(e) == 0) return(empty_plot("Waiting for live data…"))
    # Use only the latest 5 minutes for "current" mix
    cutoff <- max(e$timestamp, na.rm = TRUE) - 5 * 60
    recent <- e[e$timestamp >= cutoff, , drop = FALSE]
    if (nrow(recent) == 0) recent <- e
    df <- emotion_freq(recent)
    if (nrow(df) == 0) return(empty_plot())
    .pie(df, "emotion", "n")
  })

  output$live_students_table <- renderDT({
    e <- live_lec_emo()
    if (nrow(e) == 0) return(datatable(data.frame(message = "Waiting for live data…")))
    # Latest observation per student
    e <- e[order(e$timestamp, decreasing = TRUE), , drop = FALSE]
    latest <- e[!duplicated(e$student_id), , drop = FALSE]
    students_df <- students()
    if (nrow(students_df) > 0) {
      if (!"id" %in% names(students_df)) students_df$id <- students_df$student_id %||% NA_character_
      lk <- stats::setNames(students_df$name %||% rep(NA, nrow(students_df)), students_df$id)
      latest$name <- unname(lk[latest$student_id])
    } else latest$name <- NA
    show <- dplyr::tibble(
      name        = latest$name,
      student_id  = latest$student_id,
      state       = latest$state,
      emotion     = latest$emotion,
      gesture     = latest$gesture,
      engagement  = round(latest$engagement_score, 2),
      attention   = if ("attention_score" %in% names(latest)) round(latest$attention_score, 2) else NA,
      yawning     = if ("yawning" %in% names(latest)) latest$yawning else NA,
      last_seen   = format(latest$timestamp, "%H:%M:%S")
    )
    datatable(show,
      filter = "top",
      options = list(pageLength = 12, scrollX = TRUE, order = list(list(5, 'asc'))),
      rownames = FALSE) |>
    formatStyle("engagement",
      backgroundColor = styleInterval(c(0.3, 0.6),
        c("rgba(248,113,113,0.25)","rgba(251,191,36,0.25)","rgba(52,211,153,0.25)"))) |>
    formatStyle("state",
      backgroundColor = styleEqual(c("sleeping"), c("rgba(248,113,113,0.4)")))
  })

  output$live_sleep_alerts <- renderDT({
    e <- live_lec_emo()
    if (nrow(e) == 0) return(datatable(data.frame(message = "—")))
    sl <- e[e$state == "sleeping", , drop = FALSE]
    if (nrow(sl) == 0) return(datatable(data.frame(message = "No sleep events")))
    sl <- sl[order(sl$timestamp, decreasing = TRUE), , drop = FALSE]
    show <- head(dplyr::tibble(
      time    = format(sl$timestamp, "%H:%M:%S"),
      student = sl$student_id,
      reason  = sl$sleep_reason
    ), 20)
    datatable(show, options = list(pageLength = 8, dom = 'tip'), rownames = FALSE)
  })

  output$live_hand_events <- renderDT({
    e <- live_lec_emo()
    if (nrow(e) == 0) return(datatable(data.frame(message = "—")))
    hr <- e[e$gesture == "hand_raised", , drop = FALSE]
    if (nrow(hr) == 0) return(datatable(data.frame(message = "No hand-raise events")))
    hr <- hr[order(hr$timestamp, decreasing = TRUE), , drop = FALSE]
    show <- head(dplyr::tibble(
      time    = format(hr$timestamp, "%H:%M:%S"),
      student = hr$student_id,
      emotion = hr$emotion
    ), 20)
    datatable(show, options = list(pageLength = 8, dom = 'tip'), rownames = FALSE)
  })

  # ════════════════════════════════════════════════════════════ STUDENT
  st_emo <- reactive({
    sid <- input$student_pick; if (is.null(sid) || !nzchar(sid)) return(emo()[0, ])
    dplyr::filter(emo(), student_id == sid)
  })
  st_kpi <- reactive(kpi_summary(st_emo()))
  st_record <- reactive({
    sid <- input$student_pick; df <- students()
    if (is.null(sid) || !nzchar(sid) || nrow(df) == 0) return(NULL)
    if (!"id" %in% names(df)) df$id <- df$student_id %||% NA_character_
    r <- df[df$id == sid, , drop = FALSE]
    if (nrow(r) == 0) NULL else as.list(r[1, ])
  })
  st_grade <- reactive({
    sid <- input$student_pick; gr <- grades()
    if (is.null(sid) || !nzchar(sid) || nrow(gr) == 0 || !"student_id" %in% names(gr)) return(NULL)
    g <- gr[gr$student_id == sid, , drop = FALSE]
    if (nrow(g) == 0) NULL else g
  })

  output$student_header <- renderUI({
    r <- st_record(); if (is.null(r)) return(tags$small("Pick a student to begin."))
    tags$div(style = "padding-top: 28px;",
      tags$strong(r$name %||% r$id), " · ",
      tags$span(r$email %||% "no email", style = "color:#64748b;"),
      if (isFALSE(r$active)) tags$span(" (inactive)", style = "color:#ef4444;")
    )
  })

  # ── Excel + PDF export of the selected student's data ───────────────
  st_export_filename <- function(ext) {
    sid <- input$student_pick
    base <- if (is.null(sid) || !nzchar(sid)) "students" else sprintf("student_%s", sid)
    sprintf("%s_%s.%s", base, format(Sys.time(), "%Y%m%d_%H%M%S"), ext)
  }

  st_export_sheets <- reactive({
    sid <- input$student_pick
    if (is.null(sid) || !nzchar(sid)) {
      # No student picked — export a basic students roster summary.
      s <- students(); e <- emo()
      if (nrow(s) == 0) {
        list(Students = dplyr::tibble(message = "No students yet"))
      } else {
        if (!"id" %in% names(s)) s$id <- s$student_id %||% NA_character_
        base <- s[, intersect(c("id","name","email","active"), names(s)), drop = FALSE]
        if (nrow(e) > 0) {
          ag <- e |> dplyr::group_by(id = student_id) |>
            dplyr::summarise(observations = dplyr::n(),
                             mean_engagement = round(mean(engagement_score, na.rm = TRUE), 3),
                             sleep_rate = round(mean(state == "sleeping", na.rm = TRUE), 3),
                             .groups = "drop")
          base <- dplyr::left_join(base, ag, by = "id")
        }
        list(Students = base)
      }
    } else {
      e   <- st_emo()
      r   <- st_record()
      kpi <- st_kpi()
      profile <- dplyr::tibble(
        field = c("student_id","name","email","active",
                  "observations","lectures","mean_engagement","sleep_rate",
                  "hand_raised_rate","yawn_rate"),
        value = c(sid,
                  as.character(r$name  %||% NA),
                  as.character(r$email %||% NA),
                  as.character(r$active %||% NA),
                  as.character(kpi$observations),
                  as.character(kpi$lectures),
                  fmt_pct(kpi$mean_engagement),
                  fmt_pct(kpi$sleep_rate),
                  fmt_pct(kpi$hand_raised_rate),
                  fmt_pct(kpi$yawn_rate))
      )
      cols <- intersect(c("timestamp","lecture_id","emotion","state","sleep_reason",
                          "gesture","engagement_score","confidence","attention_score","yawning"),
                        names(e))
      obs <- if (nrow(e) > 0) e[, cols, drop = FALSE] else dplyr::tibble()
      per_lec <- per_lecture_summary(e) |> join_lecture_titles(lectures())
      list(
        `Profile`            = profile,
        `Per-lecture summary` = per_lec,
        `Observations`        = obs
      )
    }
  })

  output$st_export_xlsx <- downloadHandler(
    filename = function() st_export_filename("xlsx"),
    content  = function(file) {
      sheets <- st_export_sheets()
      sheets <- lapply(sheets, function(d) if (is.null(d) || !nrow(d)) data.frame(empty = NA) else as.data.frame(d))
      writexl::write_xlsx(sheets, path = file)
    }
  )

  output$st_export_pdf <- downloadHandler(
    filename = function() st_export_filename("pdf"),
    content  = function(file) {
      sheets <- st_export_sheets()
      pdf(file, width = 11, height = 8.5)
      on.exit(dev.off(), add = TRUE)
      for (nm in names(sheets)) {
        df <- as.data.frame(sheets[[nm]])
        if (!nrow(df)) next
        # Page 1: title + the sheet
        grid::grid.newpage()
        grid::grid.text(nm, x = 0.05, y = 0.95, just = "left",
                        gp = grid::gpar(fontsize = 16, fontface = "bold"))
        grid::grid.text(sprintf("Generated %s", format(Sys.time(), "%Y-%m-%d %H:%M")),
                        x = 0.05, y = 0.92, just = "left",
                        gp = grid::gpar(fontsize = 9, col = "#64748b"))
        # Cap rows so we don't blow up huge tables
        max_rows <- 40
        chunks <- split(df, ceiling(seq_len(nrow(df)) / max_rows))
        first <- TRUE
        for (chunk in chunks) {
          if (!first) {
            grid::grid.newpage()
            grid::grid.text(paste(nm, "(cont.)"), x = 0.05, y = 0.95, just = "left",
                            gp = grid::gpar(fontsize = 16, fontface = "bold"))
          }
          first <- FALSE
          tt <- gridExtra::ttheme_minimal(
            base_size = 9,
            core    = list(fg_params = list(col = "#0f172a")),
            colhead = list(fg_params = list(col = "#ffffff", fontface = "bold"),
                           bg_params = list(fill = "#4f46e5"))
          )
          tbl <- gridExtra::tableGrob(chunk, rows = NULL, theme = tt)
          # Place under header
          vp <- grid::viewport(x = 0.5, y = 0.45, width = 0.95, height = 0.85)
          grid::pushViewport(vp); grid::grid.draw(tbl); grid::popViewport()
        }
      }
    }
  )

  output$st_obs        <- renderValueBox(valueBox(fmt_int(st_kpi()$observations), "Observations", icon = icon("eye"), color = "purple"))
  output$st_lectures   <- renderValueBox(valueBox(fmt_int(st_kpi()$lectures), "Lectures attended", icon = icon("chalkboard"), color = "blue"))
  output$st_engagement <- renderValueBox(valueBox(fmt_pct(st_kpi()$mean_engagement), "Mean engagement", icon = icon("bolt"), color = "green"))
  output$st_sleep      <- renderValueBox(valueBox(fmt_pct(st_kpi()$sleep_rate), "Sleep rate", icon = icon("bed"), color = "red"))
  output$st_handraised <- renderValueBox(valueBox(fmt_pct(st_kpi()$hand_raised_rate), "Hand-raised", icon = icon("hand"), color = "yellow"))
  output$st_yawn       <- renderValueBox(valueBox(fmt_pct(st_kpi()$yawn_rate), "Yawn rate", icon = icon("face-tired"), color = "orange"))
  output$st_attention  <- renderValueBox({
    e <- st_emo()
    v <- if ("attention_score" %in% names(e) && nrow(e) > 0) mean(e$attention_score, na.rm = TRUE) else NA_real_
    valueBox(if (is.na(v)) "—" else sprintf("%.0f", v), "Mean attention", icon = icon("eye-low-vision"), color = "teal")
  })
  output$st_grade <- renderValueBox({
    g <- st_grade()
    if (is.null(g)) return(valueBox("—", "Latest grade", icon = icon("graduation-cap"), color = "navy"))
    last <- g[nrow(g), , drop = FALSE]
    txt <- last$grade %||% last$letter %||% "—"
    valueBox(txt, "Latest grade", icon = icon("graduation-cap"), color = "navy")
  })

  output$st_timeline <- renderPlotly({
    df <- engagement_timeline(st_emo(), bin_seconds = 60)
    if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~t, y = ~mean_engagement, color = ~lecture_id,
            type = "scatter", mode = "lines+markers", colors = CHART_PALETTE) |>
      plotly::layout(yaxis = list(title = "Engagement (0–1)", range = c(0,1))) |> style_plotly()
  })

  output$st_emotion_pie <- renderPlotly({
    df <- emotion_freq(st_emo()); if (nrow(df) == 0) return(empty_plot())
    .pie(df, "emotion", "n")
  })

  output$st_per_lecture <- renderPlotly({
    df <- per_lecture_summary(st_emo()) |> join_lecture_titles(lectures())
    if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~lecture_title, y = ~mean_engagement, type = "bar",
            marker = list(color = PALETTE$primary)) |>
      plotly::layout(yaxis = list(title = "Engagement", range = c(0,1)),
                     xaxis = list(title = NULL, tickangle = -30)) |> style_plotly()
  })

  output$st_per_subject <- renderPlotly({
    e <- st_emo(); subs <- subjects(); lec <- lectures()
    if (nrow(e) == 0 || nrow(lec) == 0) return(empty_plot())
    if (!"id" %in% names(lec)) lec$id <- lec$lecture_id %||% NA_character_
    lk <- stats::setNames(lec$subject %||% lec$id, lec$id)
    e$subject <- unname(lk[e$lecture_id])
    df <- e |> dplyr::filter(!is.na(subject)) |>
      dplyr::group_by(subject) |>
      dplyr::summarise(mean_engagement = mean(engagement_score, na.rm = TRUE),
                       n = dplyr::n(), .groups = "drop") |>
      dplyr::arrange(dplyr::desc(mean_engagement))
    if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~subject, y = ~mean_engagement, type = "bar",
            marker = list(color = PALETTE$accent)) |>
      plotly::layout(yaxis = list(range = c(0,1), title = "Engagement"),
                     xaxis = list(title = NULL, tickangle = -30)) |> style_plotly()
  })

  output$st_per_doctor <- renderPlotly({
    e <- attach_doctor_id(st_emo(), lectures()) |> join_doctor_names(doctors())
    if (nrow(e) == 0) return(empty_plot())
    df <- e |> dplyr::group_by(label = dplyr::coalesce(doctor_name, doctor_id)) |>
      dplyr::summarise(mean_engagement = mean(engagement_score, na.rm = TRUE), .groups = "drop")
    plot_ly(df, x = ~label, y = ~mean_engagement, type = "bar",
            marker = list(color = PALETTE$good)) |>
      plotly::layout(yaxis = list(range = c(0,1)), xaxis = list(title = NULL, tickangle = -30)) |>
      style_plotly()
  })

  output$st_gestures <- renderPlotly({
    df <- gesture_freq(st_emo()); if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~gesture, y = ~n, type = "bar",
            marker = list(color = PALETTE$warn)) |>
      plotly::layout(xaxis = list(title = NULL), yaxis = list(title = "Count")) |>
      style_plotly()
  })

  output$st_sleep_timeline <- renderPlotly({
    e <- st_emo()
    if (nrow(e) == 0) return(empty_plot())
    df <- e |> dplyr::mutate(sleeping = as.integer(state == "sleeping")) |>
      dplyr::arrange(timestamp)
    plot_ly(df, x = ~timestamp, y = ~sleeping, type = "scatter", mode = "lines",
            line = list(color = PALETTE$bad, shape = "hv")) |>
      plotly::layout(yaxis = list(range = c(-0.1,1.1), tickvals = c(0,1),
                                  ticktext = c("Awake","Sleeping"))) |> style_plotly()
  })

  output$st_hour_pattern <- renderPlotly({
    df <- hour_of_day_pattern(st_emo()); if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~hour, y = ~mean_engagement, type = "bar",
            marker = list(color = PALETTE$primary2)) |>
      plotly::layout(yaxis = list(range = c(0,1))) |> style_plotly()
  })

  output$st_day_pattern <- renderPlotly({
    df <- day_of_week_pattern(st_emo()); if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~day, y = ~mean_engagement, type = "bar",
            marker = list(color = PALETTE$accent)) |>
      plotly::layout(yaxis = list(range = c(0,1))) |> style_plotly()
  })

  output$st_vs_class <- renderPlotly({
    e <- st_emo(); all_e <- emo()
    if (nrow(e) == 0 || nrow(all_e) == 0) return(empty_plot())
    df <- dplyr::tibble(
      who = c("This student", "Class average"),
      mean_engagement = c(mean(e$engagement_score, na.rm = TRUE),
                          mean(all_e$engagement_score, na.rm = TRUE))
    )
    plot_ly(df, x = ~who, y = ~mean_engagement, type = "bar",
            marker = list(color = c(PALETTE$primary, PALETTE$ink_soft))) |>
      plotly::layout(yaxis = list(range = c(0,1), title = "Engagement")) |>
      style_plotly()
  })

  output$st_recs <- renderUI({
    e <- st_emo(); g <- st_grade()
    att <- if (nrow(e) > 0 && "attention_score" %in% names(e)) mean(e$attention_score, na.rm = TRUE) else NA_real_
    mark <- if (!is.null(g)) suppressWarnings(as.numeric(g$mark[nrow(g)] %||% g$total[nrow(g)] %||% NA)) else NA
    grade <- if (!is.null(g)) (g$grade[nrow(g)] %||% g$letter[nrow(g)] %||% NA_character_) else NA_character_
    recs <- recommendation_text_r(att, mark = mark, grade = grade)
    tags$ul(lapply(recs, tags$li))
  })

  output$st_recent_obs <- renderDT({
    e <- st_emo(); if (nrow(e) == 0) return(datatable(data.frame(message = "No observations")))
    cols <- intersect(c("timestamp","lecture_id","emotion","state","gesture","engagement_score"), names(e))
    dt <- e[, cols, drop = FALSE]
    dt <- dt[order(dt$timestamp, decreasing = TRUE), , drop = FALSE]
    dt <- head(dt, 200)
    datatable(dt, options = list(pageLength = 10, scrollX = TRUE), rownames = FALSE)
  })

  # ════════════════════════════════════════════════════════════ DOCTOR
  dr_emo <- reactive({
    did <- input$doctor_pick; if (is.null(did) || !nzchar(did)) return(emo()[0, ])
    e <- attach_doctor_id(emo(), lectures())
    dplyr::filter(e, doctor_id == did)
  })
  dr_record <- reactive({
    did <- input$doctor_pick; df <- doctors()
    if (is.null(did) || !nzchar(did) || nrow(df) == 0) return(NULL)
    if (!"id" %in% names(df)) df$id <- df$doctor_id %||% NA_character_
    r <- df[df$id == did, , drop = FALSE]
    if (nrow(r) == 0) NULL else as.list(r[1, ])
  })
  dr_kpi <- reactive(kpi_summary(dr_emo()))

  output$doctor_header <- renderUI({
    r <- dr_record(); if (is.null(r)) return(tags$small("Pick a doctor to begin."))
    tags$div(style = "padding-top: 28px;",
      tags$strong(r$name %||% r$id), " · ",
      tags$span(r$department %||% "no department", style = "color:#64748b;"),
      " · ",
      tags$span(r$email %||% "", style = "color:#64748b;"))
  })

  output$dr_lectures   <- renderValueBox(valueBox(fmt_int(dr_kpi()$lectures),    "Lectures",    icon = icon("chalkboard"), color = "purple"))
  output$dr_students   <- renderValueBox(valueBox(fmt_int(dr_kpi()$students),    "Students",    icon = icon("user-graduate"), color = "blue"))
  output$dr_engagement <- renderValueBox(valueBox(fmt_pct(dr_kpi()$mean_engagement), "Mean engagement", icon = icon("bolt"), color = "green"))
  output$dr_sleep      <- renderValueBox(valueBox(fmt_pct(dr_kpi()$sleep_rate),  "Sleep rate",  icon = icon("bed"), color = "red"))
  output$dr_handraised <- renderValueBox(valueBox(fmt_pct(dr_kpi()$hand_raised_rate), "Hand-raised", icon = icon("hand"), color = "yellow"))
  output$dr_subjects   <- renderValueBox({
    did <- input$doctor_pick; subs <- subjects()
    n <- if (!is.null(did) && nzchar(did) && nrow(subs) > 0 && "doctor_id" %in% names(subs))
      sum(subs$doctor_id == did, na.rm = TRUE) else 0
    valueBox(fmt_int(n), "Subjects", icon = icon("book"), color = "teal")
  })
  output$dr_observations <- renderValueBox(valueBox(fmt_int(dr_kpi()$observations), "Observations", icon = icon("eye"), color = "olive"))
  output$dr_classes <- renderValueBox({
    did <- input$doctor_pick; subs <- subjects(); cl <- classes()
    n <- 0
    if (!is.null(did) && nzchar(did) && nrow(subs) > 0 && nrow(cl) > 0 &&
        "doctor_id" %in% names(subs) && "subject_id" %in% names(cl)) {
      sids <- subs$id[subs$doctor_id == did] %||% subs$subject_id[subs$doctor_id == did]
      n <- sum(cl$subject_id %in% sids, na.rm = TRUE)
    }
    valueBox(fmt_int(n), "Classes", icon = icon("users-rectangle"), color = "navy")
  })

  output$dr_per_lecture <- renderPlotly({
    df <- per_lecture_summary(dr_emo()) |> join_lecture_titles(lectures())
    if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~reorder(lecture_title, mean_engagement), y = ~mean_engagement,
            type = "bar", marker = list(color = PALETTE$primary)) |>
      plotly::layout(yaxis = list(range = c(0,1), title = "Engagement"),
                     xaxis = list(title = NULL, tickangle = -30)) |> style_plotly()
  })

  output$dr_emotion_pie <- renderPlotly({
    df <- emotion_freq(dr_emo()); if (nrow(df) == 0) return(empty_plot())
    .pie(df, "emotion", "n")
  })

  output$dr_top_students <- renderPlotly({
    df <- per_student_summary(dr_emo()) |> join_student_names(students())
    if (nrow(df) == 0) return(empty_plot())
    df <- top_n_summary(df, "mean_engagement", 8)
    plot_ly(df, x = ~mean_engagement, y = ~reorder(coalesce(student_name, student_id), mean_engagement),
            type = "bar", orientation = "h", marker = list(color = PALETTE$good)) |>
      plotly::layout(xaxis = list(range = c(0,1)), yaxis = list(title = NULL)) |>
      style_plotly()
  })

  output$dr_bottom_students <- renderPlotly({
    df <- per_student_summary(dr_emo()) |> join_student_names(students())
    if (nrow(df) == 0) return(empty_plot())
    df <- top_n_summary(df, "mean_engagement", 8, descending = FALSE)
    plot_ly(df, x = ~mean_engagement, y = ~reorder(coalesce(student_name, student_id), -mean_engagement),
            type = "bar", orientation = "h", marker = list(color = PALETTE$bad)) |>
      plotly::layout(xaxis = list(range = c(0,1)), yaxis = list(title = NULL)) |>
      style_plotly()
  })

  output$dr_heatmap <- renderPlotly({
    e <- dr_emo(); if (nrow(e) == 0) return(empty_plot())
    e <- e |> join_student_names(students()) |> join_lecture_titles(lectures())
    df <- e |> dplyr::group_by(student_label = dplyr::coalesce(student_name, student_id),
                                lecture_label = dplyr::coalesce(lecture_title, lecture_id)) |>
      dplyr::summarise(mean_engagement = mean(engagement_score, na.rm = TRUE), .groups = "drop")
    if (nrow(df) == 0) return(empty_plot())
    mat <- tidyr::pivot_wider(df, names_from = lecture_label, values_from = mean_engagement)
    rn <- mat$student_label; mat$student_label <- NULL
    plot_ly(z = as.matrix(mat), x = colnames(mat), y = rn, type = "heatmap",
            colorscale = list(c(0, PALETTE$bad), c(0.5, PALETTE$warn), c(1, PALETTE$good)),
            zmin = 0, zmax = 1) |>
      plotly::layout(xaxis = list(title = NULL, tickangle = -30),
                     yaxis = list(title = NULL)) |> style_plotly()
  })

  output$dr_handrate <- renderPlotly({
    df <- per_lecture_summary(dr_emo()) |> join_lecture_titles(lectures())
    if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~lecture_title, y = ~hand_raised_rate, type = "bar",
            marker = list(color = PALETTE$warn)) |>
      plotly::layout(yaxis = list(title = "Hand-raised %", tickformat = ".0%"),
                     xaxis = list(title = NULL, tickangle = -30)) |> style_plotly()
  })

  output$dr_sleeprate <- renderPlotly({
    df <- per_lecture_summary(dr_emo()) |> join_lecture_titles(lectures())
    if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~lecture_title, y = ~sleep_rate, type = "bar",
            marker = list(color = PALETTE$bad)) |>
      plotly::layout(yaxis = list(title = "Sleep rate", tickformat = ".0%"),
                     xaxis = list(title = NULL, tickangle = -30)) |> style_plotly()
  })

  output$dr_lecture_table <- renderDT({
    df <- per_lecture_summary(dr_emo()) |> join_lecture_titles(lectures())
    if (nrow(df) == 0) return(datatable(data.frame(message = "No lectures yet")))
    df$mean_engagement <- round(df$mean_engagement, 3)
    df$sleep_rate      <- round(df$sleep_rate, 3)
    df$hand_raised_rate <- round(df$hand_raised_rate, 3)
    cols <- c("lecture_title","observations","students","mean_engagement","sleep_rate","hand_raised_rate","first_seen","last_seen")
    df <- df[, intersect(cols, names(df)), drop = FALSE]
    datatable(df, options = list(pageLength = 10, scrollX = TRUE), rownames = FALSE)
  })

  # ════════════════════════════════════════════════════════════ PARENT
  pa_record <- reactive({
    pid <- input$parent_pick; df <- parents()
    if (is.null(pid) || !nzchar(pid) || nrow(df) == 0) return(NULL)
    if (!"id" %in% names(df)) df$id <- df$parent_id %||% NA_character_
    r <- df[df$id == pid, , drop = FALSE]
    if (nrow(r) == 0) NULL else as.list(r[1, ])
  })
  pa_child_ids <- reactive({
    r <- pa_record(); if (is.null(r)) return(character(0))
    raw <- r$linked_student_ids
    if (is.null(raw)) return(character(0))
    if (is.list(raw)) raw <- unlist(raw, use.names = FALSE)
    if (is.character(raw) && length(raw) == 1 && grepl(",", raw, fixed = TRUE)) {
      raw <- trimws(unlist(strsplit(raw, ",", fixed = TRUE)))
    }
    raw[nzchar(raw)]
  })
  pa_emo <- reactive({
    cids <- pa_child_ids(); if (!length(cids)) return(emo()[0, ])
    dplyr::filter(emo(), student_id %in% cids)
  })

  output$parent_header <- renderUI({
    r <- pa_record(); if (is.null(r)) return(tags$small("Pick a parent to begin."))
    n <- length(pa_child_ids())
    tags$div(style = "padding-top: 28px;",
      tags$strong(r$name %||% r$id), " · ",
      tags$span(r$email %||% "", style = "color:#64748b;"),
      " · ",
      tags$span(sprintf("%d linked child(ren)", n), style = "color:#64748b;"))
  })

  output$pa_children_table <- renderDT({
    cids <- pa_child_ids(); if (!length(cids)) return(datatable(data.frame(message = "No linked children")))
    s <- students(); e <- emo()
    base <- if (!"id" %in% names(s)) dplyr::mutate(s, id = NA_character_) else s
    df <- base[base$id %in% cids, , drop = FALSE]
    cols <- intersect(c("id","name","email","active"), names(df))
    df <- df[, cols, drop = FALSE]
    if (nrow(e) > 0) {
      ag <- e |> dplyr::filter(student_id %in% cids) |>
        dplyr::group_by(id = student_id) |>
        dplyr::summarise(observations = dplyr::n(),
                         mean_engagement = round(mean(engagement_score, na.rm = TRUE), 3),
                         sleep_rate      = round(mean(state == "sleeping", na.rm = TRUE), 3),
                         .groups = "drop")
      df <- dplyr::left_join(df, ag, by = "id")
    }
    datatable(df, options = list(pageLength = 8, scrollX = TRUE), rownames = FALSE)
  })

  output$pa_compare_engagement <- renderPlotly({
    e <- pa_emo(); if (nrow(e) == 0) return(empty_plot())
    df <- per_student_summary(e) |> join_student_names(students())
    plot_ly(df, x = ~coalesce(student_name, student_id), y = ~mean_engagement,
            type = "bar", marker = list(color = PALETTE$primary)) |>
      plotly::layout(yaxis = list(range = c(0,1)), xaxis = list(title = NULL)) |>
      style_plotly()
  })

  output$pa_compare_sleep <- renderPlotly({
    e <- pa_emo(); if (nrow(e) == 0) return(empty_plot())
    df <- per_student_summary(e) |> join_student_names(students())
    plot_ly(df, x = ~coalesce(student_name, student_id), y = ~sleep_rate,
            type = "bar", marker = list(color = PALETTE$bad)) |>
      plotly::layout(yaxis = list(tickformat = ".0%"), xaxis = list(title = NULL)) |>
      style_plotly()
  })

  output$pa_timeline <- renderPlotly({
    e <- pa_emo(); if (nrow(e) == 0) return(empty_plot())
    e <- e |> join_student_names(students())
    df <- e |> dplyr::mutate(t = lubridate::floor_date(timestamp, "5 minutes")) |>
      dplyr::group_by(t, label = dplyr::coalesce(student_name, student_id)) |>
      dplyr::summarise(mean_engagement = mean(engagement_score, na.rm = TRUE), .groups = "drop")
    plot_ly(df, x = ~t, y = ~mean_engagement, color = ~label,
            type = "scatter", mode = "lines", colors = CHART_PALETTE) |>
      plotly::layout(yaxis = list(range = c(0,1))) |> style_plotly()
  })

  output$pa_emotion_pie <- renderPlotly({
    df <- emotion_freq(pa_emo()); if (nrow(df) == 0) return(empty_plot())
    .pie(df, "emotion", "n")
  })

  output$pa_notifications <- renderDT({
    cids <- pa_child_ids(); n <- notifications()
    if (!length(cids) || nrow(n) == 0 || !"recipient_student_ids" %in% names(n)) {
      return(datatable(data.frame(message = "No notifications")))
    }
    keep <- vapply(n$recipient_student_ids, function(x) {
      if (is.null(x)) FALSE
      else any(unlist(x, use.names = FALSE) %in% cids)
    }, logical(1))
    df <- n[keep, , drop = FALSE]
    cols <- intersect(c("sent_at","sender_doctor_id","subject","status"), names(df))
    datatable(df[, cols, drop = FALSE], options = list(pageLength = 8, scrollX = TRUE), rownames = FALSE)
  })

  # ════════════════════════════════════════════════════════════ LECTURE
  lec_emo <- reactive({
    lid <- input$lecture_pick; if (is.null(lid) || !nzchar(lid)) return(emo()[0, ])
    dplyr::filter(emo(), lecture_id == lid)
  })
  lec_record <- reactive({
    lid <- input$lecture_pick; df <- lectures()
    if (is.null(lid) || !nzchar(lid) || nrow(df) == 0) return(NULL)
    if (!"id" %in% names(df)) df$id <- df$lecture_id %||% NA_character_
    r <- df[df$id == lid, , drop = FALSE]
    if (nrow(r) == 0) NULL else as.list(r[1, ])
  })
  lec_kpi <- reactive(kpi_summary(lec_emo()))

  output$lecture_header <- renderUI({
    r <- lec_record(); if (is.null(r)) return(tags$small("Pick a lecture to begin."))
    tags$div(style = "padding-top: 28px;",
      tags$strong(r$title %||% r$id), " · ",
      tags$span(r$subject %||% "", style = "color:#64748b;"),
      " · ",
      tags$span(r$status %||% "", style = "color:#64748b;"))
  })

  output$lec_students     <- renderValueBox(valueBox(fmt_int(lec_kpi()$students),     "Students seen", icon = icon("users"), color = "purple"))
  output$lec_observations <- renderValueBox(valueBox(fmt_int(lec_kpi()$observations), "Observations",  icon = icon("eye"),   color = "blue"))
  output$lec_engagement   <- renderValueBox(valueBox(fmt_pct(lec_kpi()$mean_engagement), "Mean engagement", icon = icon("bolt"), color = "green"))
  output$lec_sleep        <- renderValueBox(valueBox(fmt_pct(lec_kpi()$sleep_rate),    "Sleep rate", icon = icon("bed"), color = "red"))

  output$lec_timeline <- renderPlotly({
    e <- lec_emo(); if (nrow(e) == 0) return(empty_plot())
    df <- e |> dplyr::mutate(t = lubridate::floor_date(timestamp, "30 seconds")) |>
      dplyr::group_by(t) |>
      dplyr::summarise(mean_engagement = mean(engagement_score, na.rm = TRUE),
                       sleep_rate = mean(state == "sleeping", na.rm = TRUE), .groups = "drop")
    plot_ly(df) |>
      add_lines(x = ~t, y = ~mean_engagement, name = "Engagement",
                line = list(color = PALETTE$primary)) |>
      add_lines(x = ~t, y = ~sleep_rate, name = "Sleep rate",
                line = list(color = PALETTE$bad, dash = "dot")) |>
      plotly::layout(yaxis = list(range = c(0,1))) |> style_plotly()
  })

  output$lec_emotion_pie <- renderPlotly({
    df <- emotion_freq(lec_emo()); if (nrow(df) == 0) return(empty_plot())
    .pie(df, "emotion", "n")
  })

  output$lec_per_student <- renderPlotly({
    df <- per_student_summary(lec_emo()) |> join_student_names(students())
    if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~mean_engagement, y = ~reorder(coalesce(student_name, student_id), mean_engagement),
            type = "bar", orientation = "h", marker = list(color = PALETTE$primary)) |>
      plotly::layout(xaxis = list(range = c(0,1)), yaxis = list(title = NULL)) |>
      style_plotly()
  })

  output$lec_sleep_bars <- renderPlotly({
    e <- lec_emo(); if (nrow(e) == 0) return(empty_plot())
    df <- e |> dplyr::group_by(student_id) |>
      dplyr::summarise(sleep_events = sum(state == "sleeping", na.rm = TRUE), .groups = "drop") |>
      join_student_names(students())
    plot_ly(df, x = ~sleep_events, y = ~reorder(coalesce(student_name, student_id), sleep_events),
            type = "bar", orientation = "h", marker = list(color = PALETTE$bad)) |>
      plotly::layout(yaxis = list(title = NULL)) |> style_plotly()
  })

  output$lec_gestures <- renderPlotly({
    df <- gesture_freq(lec_emo()); if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~gesture, y = ~n, type = "bar",
            marker = list(color = PALETTE$warn)) |> style_plotly()
  })

  output$lec_yawns <- renderPlotly({
    e <- lec_emo(); if (nrow(e) == 0 || !"yawning" %in% names(e)) return(empty_plot())
    df <- e |> dplyr::group_by(student_id) |>
      dplyr::summarise(yawn_rate = mean(as.logical(yawning), na.rm = TRUE), .groups = "drop") |>
      join_student_names(students())
    plot_ly(df, x = ~coalesce(student_name, student_id), y = ~yawn_rate, type = "bar",
            marker = list(color = PALETTE$primary2)) |>
      plotly::layout(yaxis = list(tickformat = ".0%"), xaxis = list(title = NULL)) |>
      style_plotly()
  })

  output$lec_transcript <- renderDT({
    lid <- input$lecture_pick; ts <- transcripts(); seg <- segments()
    if (is.null(lid) || !nzchar(lid) || nrow(ts) == 0 || nrow(seg) == 0) {
      return(datatable(data.frame(message = "No transcript")))
    }
    if (!"lecture_id" %in% names(ts)) return(datatable(data.frame(message = "No transcript")))
    tids <- ts$id[ts$lecture_id == lid]
    if (!length(tids)) return(datatable(data.frame(message = "No transcript")))
    s <- seg[seg$transcript_id %in% tids, , drop = FALSE]
    if (nrow(s) == 0) return(datatable(data.frame(message = "No segments")))
    s <- s[order(suppressWarnings(as.numeric(s$start))), , drop = FALSE]
    cols <- intersect(c("chunk_index","start","end","text"), names(s))
    datatable(head(s[, cols, drop = FALSE], 30),
              options = list(pageLength = 10, scrollX = TRUE), rownames = FALSE)
  })

  # ═══════════════════════════════════════════════════ SUBJECTS & CLASSES
  output$cu_subjects <- renderValueBox(valueBox(fmt_int(nrow(subjects())), "Subjects", icon = icon("book"), color = "purple"))
  output$cu_classes  <- renderValueBox(valueBox(fmt_int(nrow(classes())),  "Classes",  icon = icon("users-rectangle"), color = "blue"))
  output$cu_weeks    <- renderValueBox(valueBox(fmt_int(nrow(weeks())),    "Weeks",    icon = icon("calendar"), color = "teal"))
  output$cu_enrolment <- renderValueBox({
    cl <- classes()
    n <- if (nrow(cl) > 0 && "enrolled_student_ids" %in% names(cl)) {
      sum(vapply(cl$enrolled_student_ids, function(x)
        length(unlist(x, use.names = FALSE) %||% character(0)), integer(1)))
    } else 0
    valueBox(fmt_int(n), "Total enrollments", icon = icon("user-plus"), color = "olive")
  })

  output$cu_subject_eng <- renderPlotly({
    e <- emo(); lec <- lectures()
    if (nrow(e) == 0 || nrow(lec) == 0) return(empty_plot())
    if (!"id" %in% names(lec)) lec$id <- lec$lecture_id %||% NA_character_
    lk <- stats::setNames(lec$subject %||% lec$id, lec$id)
    e$subject <- unname(lk[e$lecture_id])
    df <- e |> dplyr::filter(!is.na(subject)) |>
      dplyr::group_by(subject) |>
      dplyr::summarise(mean_engagement = mean(engagement_score, na.rm = TRUE),
                       n = dplyr::n(), .groups = "drop") |>
      dplyr::arrange(dplyr::desc(mean_engagement))
    plot_ly(df, x = ~reorder(subject, mean_engagement), y = ~mean_engagement, type = "bar",
            marker = list(color = PALETTE$primary)) |>
      plotly::layout(yaxis = list(range = c(0,1))) |> style_plotly()
  })

  output$cu_subject_sleep <- renderPlotly({
    e <- emo(); lec <- lectures()
    if (nrow(e) == 0 || nrow(lec) == 0) return(empty_plot())
    if (!"id" %in% names(lec)) lec$id <- lec$lecture_id %||% NA_character_
    lk <- stats::setNames(lec$subject %||% lec$id, lec$id)
    e$subject <- unname(lk[e$lecture_id])
    df <- e |> dplyr::filter(!is.na(subject)) |>
      dplyr::group_by(subject) |>
      dplyr::summarise(sleep_rate = mean(state == "sleeping", na.rm = TRUE), .groups = "drop")
    plot_ly(df, x = ~subject, y = ~sleep_rate, type = "bar",
            marker = list(color = PALETTE$bad)) |>
      plotly::layout(yaxis = list(tickformat = ".0%")) |> style_plotly()
  })

  output$cu_lectures_per_subject <- renderPlotly({
    lec <- lectures(); if (nrow(lec) == 0 || !"subject" %in% names(lec)) return(empty_plot())
    df <- lec |> dplyr::count(subject, name = "n") |> dplyr::arrange(dplyr::desc(n))
    plot_ly(df, x = ~reorder(subject, n), y = ~n, type = "bar",
            marker = list(color = PALETTE$accent)) |> style_plotly()
  })

  output$cu_enrol_per_class <- renderPlotly({
    cl <- classes(); if (nrow(cl) == 0 || !"enrolled_student_ids" %in% names(cl)) return(empty_plot())
    df <- cl |> dplyr::mutate(
      label = dplyr::coalesce(name, id),
      enrolled = vapply(enrolled_student_ids, function(x)
        length(unlist(x, use.names = FALSE) %||% character(0)), integer(1))
    )
    plot_ly(df, x = ~reorder(label, enrolled), y = ~enrolled, type = "bar",
            marker = list(color = PALETTE$good)) |>
      plotly::layout(xaxis = list(title = NULL, tickangle = -30)) |> style_plotly()
  })

  output$cu_week_trend <- renderPlotly({
    e <- emo(); lec <- lectures(); wk <- weeks()
    if (nrow(e) == 0 || nrow(lec) == 0 || nrow(wk) == 0) return(empty_plot())
    if (!"id" %in% names(lec)) lec$id <- lec$lecture_id %||% NA_character_
    if (!"id" %in% names(wk))  wk$id  <- wk$week_id %||% NA_character_
    week_lk <- stats::setNames(wk$week_number %||% rep(NA, nrow(wk)), wk$id)
    lec$week_number <- unname(week_lk[lec$week_id])
    lec_lk <- stats::setNames(lec$week_number, lec$id)
    e$week_number <- unname(lec_lk[e$lecture_id])
    df <- e |> dplyr::filter(!is.na(week_number)) |>
      dplyr::group_by(week_number) |>
      dplyr::summarise(mean_engagement = mean(engagement_score, na.rm = TRUE),
                       sleep_rate = mean(state == "sleeping", na.rm = TRUE), .groups = "drop") |>
      dplyr::arrange(week_number)
    plot_ly(df) |>
      add_lines(x = ~week_number, y = ~mean_engagement, name = "Engagement",
                line = list(color = PALETTE$primary)) |>
      add_lines(x = ~week_number, y = ~sleep_rate, name = "Sleep rate",
                line = list(color = PALETTE$bad, dash = "dot")) |>
      plotly::layout(yaxis = list(range = c(0,1))) |> style_plotly()
  })

  output$cu_subject_table <- renderDT({
    df <- subjects(); if (nrow(df) == 0) return(datatable(data.frame(message = "No subjects")))
    cols <- intersect(c("id","name","code","doctor_id","active"), names(df))
    datatable(df[, cols, drop = FALSE], options = list(pageLength = 8, scrollX = TRUE), rownames = FALSE)
  })
  output$cu_class_table <- renderDT({
    df <- classes(); if (nrow(df) == 0) return(datatable(data.frame(message = "No classes")))
    df$enrolled <- if ("enrolled_student_ids" %in% names(df))
      vapply(df$enrolled_student_ids, function(x) length(unlist(x, use.names = FALSE) %||% character(0)), integer(1))
    else NA_integer_
    cols <- intersect(c("id","name","subject_id","section","academic_year","term","enrolled","active"), names(df))
    datatable(df[, cols, drop = FALSE], options = list(pageLength = 8, scrollX = TRUE), rownames = FALSE)
  })

  # ════════════════════════════════════════════════════════════ TRENDS
  output$tr_hour <- renderPlotly({
    df <- hour_of_day_pattern(emo()); if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~hour, y = ~mean_engagement, type = "bar",
            marker = list(color = PALETTE$primary)) |>
      plotly::layout(yaxis = list(range = c(0,1))) |> style_plotly()
  })
  output$tr_day <- renderPlotly({
    df <- day_of_week_pattern(emo()); if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~day, y = ~mean_engagement, type = "bar",
            marker = list(color = PALETTE$accent)) |>
      plotly::layout(yaxis = list(range = c(0,1))) |> style_plotly()
  })

  output$tr_doc_cluster <- renderPlotly({
    df <- per_doctor_summary(emo(), lectures()) |> join_doctor_names(doctors())
    if (nrow(df) < 2) return(empty_plot("Need at least 2 doctors to cluster."))
    k <- min(3L, nrow(df))
    cl <- tryCatch(stats::kmeans(df[, c("mean_engagement","sleep_rate")], centers = k, nstart = 5),
                   error = function(e) NULL)
    if (is.null(cl)) return(empty_plot())
    df$cluster <- as.factor(cl$cluster)
    plot_ly(df, x = ~mean_engagement, y = ~sleep_rate, color = ~cluster,
            text = ~coalesce(doctor_name, doctor_id), type = "scatter", mode = "markers+text",
            marker = list(size = 14), colors = CHART_PALETTE, textposition = "top right") |>
      plotly::layout(xaxis = list(range = c(0,1)), yaxis = list(range = c(0,1))) |>
      style_plotly()
  })

  output$tr_st_cluster <- renderPlotly({
    df <- per_student_summary(emo()) |> join_student_names(students())
    if (nrow(df) < 3) return(empty_plot("Need at least 3 students to cluster."))
    k <- min(3L, nrow(df))
    cl <- tryCatch(stats::kmeans(df[, c("mean_engagement","hand_raised_rate")], centers = k, nstart = 5),
                   error = function(e) NULL)
    if (is.null(cl)) return(empty_plot())
    df$cluster <- as.factor(cl$cluster)
    plot_ly(df, x = ~mean_engagement, y = ~hand_raised_rate, color = ~cluster,
            text = ~coalesce(student_name, student_id), type = "scatter", mode = "markers",
            marker = list(size = 12), colors = CHART_PALETTE) |>
      plotly::layout(xaxis = list(range = c(0,1))) |> style_plotly()
  })

  output$tr_eng_hist <- renderPlotly({
    e <- emo(); if (nrow(e) == 0) return(empty_plot())
    plot_ly(x = ~e$engagement_score, type = "histogram", nbinsx = 20,
            marker = list(color = PALETTE$primary)) |>
      plotly::layout(xaxis = list(title = "Engagement", range = c(0,1)),
                     yaxis = list(title = "Frequency")) |> style_plotly()
  })

  output$tr_lecture_scatter <- renderPlotly({
    df <- per_lecture_summary(emo()) |> join_lecture_titles(lectures())
    if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~observations, y = ~mean_engagement, text = ~lecture_title,
            type = "scatter", mode = "markers",
            marker = list(size = 10, color = PALETTE$primary)) |>
      plotly::layout(xaxis = list(title = "Observations"),
                     yaxis = list(title = "Engagement", range = c(0,1))) |>
      style_plotly()
  })

  output$tr_calendar <- renderPlotly({
    e <- emo(); if (nrow(e) == 0) return(empty_plot())
    df <- e |> dplyr::mutate(week = lubridate::floor_date(as.Date(timestamp), "week")) |>
      dplyr::group_by(week) |>
      dplyr::summarise(mean_engagement = mean(engagement_score, na.rm = TRUE),
                       sleep_rate = mean(state == "sleeping", na.rm = TRUE), .groups = "drop")
    plot_ly(df) |>
      add_lines(x = ~week, y = ~mean_engagement, name = "Engagement",
                line = list(color = PALETTE$primary)) |>
      add_lines(x = ~week, y = ~sleep_rate, name = "Sleep rate",
                line = list(color = PALETTE$bad, dash = "dot")) |>
      plotly::layout(yaxis = list(range = c(0,1))) |> style_plotly()
  })

  # ════════════════════════════════════════════════════════════ TRANSCRIPTS
  tx_summary <- reactive(transcript_segment_summary(segments()))

  output$tx_transcripts <- renderValueBox(valueBox(fmt_int(nrow(transcripts())), "Transcripts", icon = icon("file-lines"), color = "purple"))
  output$tx_segments    <- renderValueBox(valueBox(fmt_int(nrow(segments())),    "Segments",    icon = icon("layer-group"), color = "blue"))
  output$tx_words       <- renderValueBox({
    s <- segments()
    n <- if (nrow(s) > 0 && "text" %in% names(s))
      sum(vapply(strsplit(as.character(s$text), "\\s+"), length, integer(1)))
    else 0
    valueBox(fmt_int(n), "Total words", icon = icon("font"), color = "teal")
  })
  output$tx_languages <- renderValueBox({
    t <- transcripts()
    n <- if (nrow(t) > 0 && "language" %in% names(t))
      length(unique(stats::na.omit(t$language))) else 0
    valueBox(fmt_int(n), "Languages", icon = icon("language"), color = "olive")
  })

  output$tx_segments_per <- renderPlotly({
    df <- tx_summary(); if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~reorder(transcript_id, segments), y = ~segments, type = "bar",
            marker = list(color = PALETTE$primary)) |>
      plotly::layout(xaxis = list(title = NULL, tickangle = -30)) |> style_plotly()
  })
  output$tx_avg_seg <- renderPlotly({
    df <- tx_summary(); if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~transcript_id, y = ~avg_segment_seconds, type = "bar",
            marker = list(color = PALETTE$accent)) |> style_plotly()
  })
  output$tx_words_chart <- renderPlotly({
    df <- transcript_word_freq(segments(), top_n = 25)
    if (nrow(df) == 0) return(empty_plot())
    plot_ly(df, x = ~n, y = ~reorder(word, n), type = "bar", orientation = "h",
            marker = list(color = PALETTE$primary2)) |>
      plotly::layout(yaxis = list(title = NULL)) |> style_plotly()
  })
  output$tx_languages_pie <- renderPlotly({
    t <- transcripts(); if (nrow(t) == 0 || !"language" %in% names(t)) return(empty_plot())
    df <- t |> dplyr::filter(!is.na(language)) |> dplyr::count(language, name = "n")
    if (nrow(df) == 0) return(empty_plot())
    .pie(df, "language", "n")
  })
  output$tx_table <- renderDT({
    t <- transcripts(); if (nrow(t) == 0) return(datatable(data.frame(message = "No transcripts")))
    cols <- intersect(c("id","lecture_id","language","segment_count","completed",
                        "started_at","last_updated_at"), names(t))
    datatable(t[, cols, drop = FALSE], options = list(pageLength = 10, scrollX = TRUE), rownames = FALSE)
  })

  # ════════════════════════════════════════════════════════════ NOTIFICATIONS
  output$nt_total      <- renderValueBox(valueBox(fmt_int(nrow(notifications())), "Total", icon = icon("envelope"), color = "purple"))
  output$nt_sent       <- renderValueBox({
    n <- notifications(); v <- if (nrow(n) > 0 && "status" %in% names(n)) sum(n$status == "sent", na.rm = TRUE) else 0
    valueBox(fmt_int(v), "Sent", icon = icon("paper-plane"), color = "green")
  })
  output$nt_failed     <- renderValueBox({
    n <- notifications(); v <- if (nrow(n) > 0 && "status" %in% names(n)) sum(n$status == "failed", na.rm = TRUE) else 0
    valueBox(fmt_int(v), "Failed", icon = icon("triangle-exclamation"), color = "red")
  })
  output$nt_recipients <- renderValueBox({
    n <- notifications()
    v <- if (nrow(n) > 0 && "recipient_student_ids" %in% names(n))
      length(unique(unlist(n$recipient_student_ids, use.names = FALSE))) else 0
    valueBox(fmt_int(v), "Unique recipients", icon = icon("users"), color = "blue")
  })

  output$nt_per_doctor <- renderPlotly({
    n <- notifications()
    if (nrow(n) == 0 || !"sender_doctor_id" %in% names(n)) return(empty_plot())
    df <- n |> dplyr::count(sender_doctor_id, name = "count") |>
      dplyr::arrange(dplyr::desc(count))
    plot_ly(df, x = ~count, y = ~reorder(sender_doctor_id, count),
            type = "bar", orientation = "h", marker = list(color = PALETTE$primary)) |>
      plotly::layout(yaxis = list(title = NULL)) |> style_plotly()
  })

  output$nt_status_pie <- renderPlotly({
    n <- notifications(); if (nrow(n) == 0 || !"status" %in% names(n)) return(empty_plot())
    df <- n |> dplyr::count(status, name = "n")
    .pie(df, "status", "n")
  })

  output$nt_timeline <- renderPlotly({
    n <- notifications(); if (nrow(n) == 0 || !"sent_at" %in% names(n)) return(empty_plot())
    df <- n |> dplyr::mutate(day = as.Date(lubridate::as_datetime(sent_at))) |>
      dplyr::count(day, name = "n")
    plot_ly(df, x = ~day, y = ~n, type = "bar",
            marker = list(color = PALETTE$accent)) |> style_plotly()
  })

  output$nt_table <- renderDT({
    n <- notifications(); if (nrow(n) == 0) return(datatable(data.frame(message = "No notifications")))
    cols <- intersect(c("sent_at","sender_doctor_id","lecture_id","subject","status"), names(n))
    datatable(n[, cols, drop = FALSE], options = list(pageLength = 10, scrollX = TRUE), rownames = FALSE)
  })

  # ════════════════════════════════════════════════════════════ DATA QUALITY
  dq <- reactive(data_quality_summary(emo(), students(), doctors(), lectures()))

  output$dq_emo_rows         <- renderValueBox(valueBox(fmt_int(dq()$emo_rows),         "Observations",     icon = icon("eye"),       color = "purple"))
  output$dq_students_no_data <- renderValueBox(valueBox(fmt_int(dq()$students_no_data), "Students no data", icon = icon("user-slash"), color = "red"))
  output$dq_lectures_no_data <- renderValueBox(valueBox(fmt_int(dq()$lectures_no_data), "Lectures no data", icon = icon("circle-xmark"), color = "orange"))
  output$dq_date_span <- renderValueBox({
    s <- dq()
    txt <- if (is.na(s$earliest_obs) || is.na(s$latest_obs)) "—"
           else sprintf("%s → %s", as.Date(s$earliest_obs), as.Date(s$latest_obs))
    valueBox(txt, "Coverage span", icon = icon("calendar"), color = "blue")
  })

  output$dq_collection_counts <- renderPlotly({
    df <- dplyr::tibble(
      collection = c("students","doctors","parents","admins","subjects","classes",
                     "weeks","lectures","emotions","transcripts","notifications","grades"),
      n = c(nrow(students()), nrow(doctors()), nrow(parents()), nrow(admins_data()),
            nrow(subjects()), nrow(classes()), nrow(weeks()), nrow(lectures()),
            nrow(emo()), nrow(transcripts()), nrow(notifications()), nrow(grades()))
    )
    plot_ly(df, x = ~n, y = ~reorder(collection, n), type = "bar", orientation = "h",
            marker = list(color = PALETTE$primary)) |>
      plotly::layout(xaxis = list(title = "Documents"),
                     yaxis = list(title = NULL)) |> style_plotly()
  })

  output$dq_obs_per_day <- renderPlotly({
    e <- emo(); if (nrow(e) == 0) return(empty_plot())
    df <- e |> dplyr::mutate(day = as.Date(timestamp)) |>
      dplyr::count(day, name = "n")
    plot_ly(df, x = ~day, y = ~n, type = "bar",
            marker = list(color = PALETTE$accent)) |> style_plotly()
  })

  output$dq_students_coverage <- renderPlotly({
    s <- dq()
    df <- dplyr::tibble(group = c("With data","Missing data"),
                        n = c(s$students_with_data, s$students_no_data))
    .pie(df, "group", "n")
  })

  output$dq_lectures_coverage <- renderPlotly({
    s <- dq()
    df <- dplyr::tibble(group = c("With data","Missing data"),
                        n = c(s$lectures_with_data, s$lectures_no_data))
    .pie(df, "group", "n")
  })
}

shinyApp(ui = ui, server = server)
