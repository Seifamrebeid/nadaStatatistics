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

# ── Cached loaders (refresh button below resets these) ────────────────────
.cache <- new.env(parent = emptyenv())

bust_cache <- function() rm(list = ls(.cache), envir = .cache)

cached <- function(key, expr) {
  if (!exists(key, envir = .cache, inherits = FALSE)) {
    assign(key, eval.parent(substitute(expr)), envir = .cache)
  }
  get(key, envir = .cache)
}

emo_data        <- function() cached("emo",       load_emotions())
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
  dashboardHeader(title = "Classroom Analytics"),
  dashboardSidebar(
    width = 260,
    sidebarMenu(
      id = "sidebar",
      menuItem("Overview",          tabName = "overview",      icon = icon("gauge-high")),
      menuItem("Live Lecture",      tabName = "live",          icon = icon("circle-dot"),
               badgeLabel = "live", badgeColor = "red"),
      menuItem("Students",          tabName = "students",      icon = icon("user-graduate")),
      menuItem("Doctors",           tabName = "doctors",       icon = icon("user-tie")),
      menuItem("Parents",           tabName = "parents",       icon = icon("people-roof")),
      menuItem("Lectures",          tabName = "lectures",      icon = icon("chalkboard-user")),
      menuItem("Subjects & Classes",tabName = "curriculum",    icon = icon("book")),
      menuItem("Trends & Clusters", tabName = "trends",        icon = icon("chart-line")),
      menuItem("Transcripts",       tabName = "transcripts",   icon = icon("file-lines")),
      menuItem("Notifications",     tabName = "notifications", icon = icon("envelope")),
      menuItem("Data Quality",      tabName = "data_quality",  icon = icon("database"))
    ),
    div(style = "padding: 12px 16px;",
        actionButton("refresh", "Reload data",
                     icon = icon("rotate"),
                     class = "btn-block",
                     style = "background:#7c3aed;color:white;border:none;width:100%;"),
        actionButton("theme_toggle",
                     label = if (is_light_mode()) "Dark mode" else "Light mode",
                     icon  = icon(if (is_light_mode()) "moon" else "sun"),
                     class = "btn-block",
                     style = "width:100%;margin-top:8px;"),
        tags$small(textOutput("env_info"),
                   style = "color:#94a3b8;display:block;margin-top:8px;")
    )
  ),
  dashboardBody(
    tags$head(tags$style(HTML(CUSTOM_CSS))),
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
  emo       <- reactive({ input$refresh; emo_data() })
  students  <- reactive({ input$refresh; students_data() })
  doctors   <- reactive({ input$refresh; doctors_data() })
  parents   <- reactive({ input$refresh; parents_data() })
  subjects  <- reactive({ input$refresh; subjects_data() })
  classes   <- reactive({ input$refresh; classes_data() })
  weeks     <- reactive({ input$refresh; weeks_data() })
  lectures  <- reactive({ input$refresh; lectures_data() })
  grades    <- reactive({ input$refresh; grades_data() })
  notifications <- reactive({ input$refresh; notifications_data() })
  transcripts   <- reactive({ input$refresh; transcripts_data() })
  segments      <- reactive({ input$refresh; segments_data() })

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
