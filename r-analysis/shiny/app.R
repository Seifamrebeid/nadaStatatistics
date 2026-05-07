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

html, body, .content-wrapper, .right-side {
  font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
  background-color: var(--bg) !important;
  color: var(--ink);
  letter-spacing: -0.005em;
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
"

# ============================================================ UI ============

ui <- dashboardPage(
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
        h1("Overview", tags$small("real-time class engagement at a glance")),
        fluidRow(
          valueBoxOutput("kpi_students",   width = 3),
          valueBoxOutput("kpi_lectures",   width = 3),
          valueBoxOutput("kpi_engagement", width = 3),
          valueBoxOutput("kpi_sleep_rate", width = 3)
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

  # Reload on demand. `load_emotions()` prefers Firestore when the emulator
  # (or a real service-account key) is configured and falls back to the CSV
  # backup otherwise. Force one path with env var DATA_SOURCE=csv|firestore.
  data_r <- reactive({
    input$refresh  # trigger reactive
    load_emotions() |> attach_doctor_id()
  })

  # Cache lecture labels so we don't hit Firestore on every reactive turn.
  lecture_labels_r <- reactive({
    input$refresh
    load_lecture_labels()
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
}

shinyApp(ui, server)
