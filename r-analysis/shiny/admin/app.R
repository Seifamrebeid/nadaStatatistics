user_lib <- file.path(Sys.getenv("LOCALAPPDATA"), "R", "win-library", "4.5")
if (dir.exists(user_lib) && !(user_lib %in% .libPaths())) .libPaths(c(user_lib, .libPaths()))

suppressPackageStartupMessages({
  library(shiny); library(shinydashboard); library(dplyr)
  library(ggplot2); library(plotly); library(DT); library(lubridate)
  library(tidyr); library(cluster)
})

source("../../load_data.R")
source("../shared/theme.R")
source("../shared/helpers.R")

# ── UI ────────────────────────────────────────────────────────────────────────
ui <- dashboardPage(
  skin = "red",
  dashboardHeader(
    title = tags$span(
      tags$span(style = "font-weight:800;letter-spacing:-0.03em;", "Admin"),
      tags$span(style = "font-weight:400;opacity:0.55;margin-left:4px;", "Dashboard")
    ),
    titleWidth = 260
  ),
  dashboardSidebar(
    width = 260,
    sidebarMenu(
      tags$li(class = "header", "Analytics"),
      menuItem("Overview",          tabName = "overview",      icon = icon("gauge-high"),     class = "sec-analytics"),
      menuItem("Distributions",     tabName = "distributions", icon = icon("chart-bar"),      class = "sec-analytics"),
      menuItem("Emotion Analysis",  tabName = "emotion_dist",  icon = icon("face-smile"),     class = "sec-analytics"),
      menuItem("Per-Lecture",       tabName = "per_lecture",   icon = icon("chalkboard"),     class = "sec-analytics"),
      menuItem("Trends",            tabName = "trends",        icon = icon("arrow-trend-up"), class = "sec-analytics"),
      tags$li(class = "header", "Data"),
      menuItem("Student Directory", tabName = "students",      icon = icon("users"),          class = "sec-data"),
      menuItem("Doctor Directory",  tabName = "doctors",       icon = icon("user-doctor"),    class = "sec-data"),
      menuItem("Grades",            tabName = "grades",        icon = icon("award"),          class = "sec-data"),
      menuItem("Attendance",        tabName = "attendance",    icon = icon("calendar-check"), class = "sec-data"),
      menuItem("Raw Data",          tabName = "raw",           icon = icon("table"),          class = "sec-data"),
      tags$li(class = "header", "Insights"),
      menuItem("Attention Analysis",tabName = "attention",     icon = icon("eye"),            class = "sec-insights"),
      menuItem("Cheating Detection",tabName = "cheating",      icon = icon("triangle-exclamation"), class = "sec-insights"),
      menuItem("Clustering — Doctors",  tabName = "cluster_doc",   icon = icon("circle-nodes"), class = "sec-insights"),
      menuItem("Clustering — Students", tabName = "cluster_stud",  icon = icon("circle-nodes"), class = "sec-insights"),
      menuItem("Recommendations",   tabName = "recs",          icon = icon("lightbulb"),      class = "sec-insights")
    ),
    tags$hr(),
    div(style = "padding: 0 10px;",
      selectizeInput("lecture_pick", "Filter by lecture", choices = NULL,
                     options = list(placeholder = "All lectures")),
      selectizeInput("student_filter", "Filter by student", choices = NULL,
                     options = list(placeholder = "All students")),
      selectizeInput("doctor_filter", "Filter by doctor", choices = NULL,
                     options = list(placeholder = "All doctors"))
    ),
    actionButton("refresh", "↻ Refresh", class = "btn-primary",
                 width = "calc(100% - 20px)", style = "margin: 8px 10px;"),
    uiOutput("last_refresh_ui")
  ),
  dashboardBody(
    tags$head(tags$style(HTML(CUSTOM_CSS))),
    tabItems(

      # ── Overview ─────────────────────────────────────────────────────────────
      tabItem(tabName = "overview",
        div(class = "page-hero",
          div(class = "page-hero__layout",
            div(class = "page-hero__copy",
              div(class = "page-hero__eyebrow", icon("shield-halved"), "Admin Portal"),
              div(class = "page-hero__title", "System-wide Analytics"),
              p(class = "page-hero__text",
                "Full visibility across all students, doctors, lectures, and grades."),
              div(class = "page-hero__meta",
                span(class = "page-hero__pill", icon("users"),      "All students"),
                span(class = "page-hero__pill", icon("chalkboard"), "All lectures"),
                span(class = "page-hero__pill", icon("circle-nodes"), "Clustering")
              )
            )
          )
        ),
        fluidRow(
          valueBoxOutput("ad_students",   width = 3),
          valueBoxOutput("ad_doctors",    width = 3),
          valueBoxOutput("ad_lectures",   width = 3),
          valueBoxOutput("ad_engagement", width = 3)
        ),
        fluidRow(
          box(title = "Avg engagement per lecture", width = 7,
              plotlyOutput("ad_lecture_trend", height = 300)),
          box(title = "Overall emotion mix", width = 5,
              plotlyOutput("ad_emotion_pie", height = 300))
        ),
        fluidRow(
          box(title = "Students per lecture (attendance)", width = 6,
              plotlyOutput("ad_attendance_bar", height = 260)),
          box(title = "Engagement by doctor", width = 6,
              plotlyOutput("ad_doc_eng_bar", height = 260))
        )
      ),

      # ── Distributions ─────────────────────────────────────────────────────────
      tabItem(tabName = "distributions",
        h1("Distributions", tags$small("engagement and attention spread")),
        fluidRow(
          box(title = "Engagement distribution", width = 6,
              plotlyOutput("dist_eng_hist", height = 300)),
          box(title = "Attention distribution", width = 6,
              plotlyOutput("dist_attn_hist", height = 300))
        ),
        fluidRow(
          box(title = "Engagement vs attention scatter", width = 12,
              plotlyOutput("dist_scatter", height = 350))
        )
      ),

      # ── Emotion analysis ──────────────────────────────────────────────────────
      tabItem(tabName = "emotion_dist",
        h1("Emotion Analysis"),
        fluidRow(
          box(title = "Emotion breakdown", width = 6,
              plotlyOutput("emo_bar", height = 350)),
          box(title = "Emotion heatmap (lecture × emotion)", width = 6,
              plotlyOutput("emo_heat", height = 350))
        ),
        fluidRow(
          box(title = "Emotion over time", width = 12,
              plotlyOutput("emo_line", height = 300))
        )
      ),

      # ── Per-Lecture ───────────────────────────────────────────────────────────
      tabItem(tabName = "per_lecture",
        h1("Per-Lecture Breakdown"),
        fluidRow(
          column(4,
            box(title = "Lecture picker", width = 12,
              selectizeInput("lec_detail_pick", "Lecture", choices = NULL,
                             options = list(placeholder = "Choose…")),
              uiOutput("lec_stats_box")
            )
          ),
          column(8,
            box(title = "Engagement over time", width = 12,
                plotlyOutput("lec_eng_line", height = 300))
          )
        ),
        fluidRow(
          box(title = "Emotion breakdown", width = 4,
              plotlyOutput("lec_emotion_pie", height = 280)),
          box(title = "Per-student engagement", width = 4,
              plotlyOutput("lec_student_bar", height = 280)),
          box(title = "Gesture breakdown", width = 4,
              plotlyOutput("lec_gesture_pie", height = 280))
        )
      ),

      # ── Trends ───────────────────────────────────────────────────────────────
      tabItem(tabName = "trends",
        h1("Trends", tags$small("how metrics evolve across the semester")),
        fluidRow(
          box(title = "Class avg engagement", width = 6,
              plotlyOutput("trend_eng_line", height = 280)),
          box(title = "Class avg attention", width = 6,
              plotlyOutput("trend_attn_line", height = 280))
        ),
        fluidRow(
          box(title = "Emotion mix over lectures (stacked bar)", width = 12,
              plotlyOutput("trend_emo_area", height = 350))
        )
      ),

      # ── Student Directory ─────────────────────────────────────────────────────
      tabItem(tabName = "students",
        h1("Student Directory"),
        fluidRow(
          box(title = "Search students", width = 12,
            fluidRow(
              column(5,
                textInput("stud_q", "Search by name, ID, or email",
                          placeholder = "e.g. Alice or s001")
              )
            ),
            DTOutput("stud_table")
          )
        ),
        fluidRow(
          box(title = "Engagement per student", width = 12,
              plotlyOutput("stud_eng_bar", height = 300))
        )
      ),

      # ── Doctor Directory ──────────────────────────────────────────────────────
      tabItem(tabName = "doctors",
        h1("Doctor Directory"),
        fluidRow(
          box(title = "Search doctors", width = 12,
            fluidRow(
              column(5,
                textInput("doc_q", "Search by name, ID, or department",
                          placeholder = "e.g. Smith or CS")
              )
            ),
            DTOutput("doc_table")
          )
        ),
        fluidRow(
          box(title = "Avg engagement by doctor", width = 12,
              plotlyOutput("doc_eng_bar", height = 300))
        )
      ),

      # ── Grades ───────────────────────────────────────────────────────────────
      tabItem(tabName = "grades",
        h1("Grades"),
        fluidRow(
          valueBoxOutput("grd_avg_mark",  width = 4),
          valueBoxOutput("grd_pass_rate", width = 4),
          valueBoxOutput("grd_count",     width = 4)
        ),
        fluidRow(
          box(title = "Gradebook", width = 8, DTOutput("grd_table")),
          box(title = "Grade distribution", width = 4,
              plotlyOutput("grd_pie", height = 300))
        )
      ),

      # ── Attendance ────────────────────────────────────────────────────────────
      tabItem(tabName = "attendance",
        h1("Attendance"),
        fluidRow(
          box(title = "Students per lecture", width = 8,
              plotlyOutput("att_bar", height = 300)),
          box(title = "Attendance rate distribution", width = 4,
              plotlyOutput("att_hist", height = 300))
        ),
        fluidRow(
          box(title = "Student attendance records", width = 12,
              DTOutput("att_table"))
        )
      ),

      # ── Raw Data ─────────────────────────────────────────────────────────────
      tabItem(tabName = "raw",
        h1("Raw Data", tags$small("all emotion observations")),
        fluidRow(
          box(title = "Emotions table", width = 12, DTOutput("raw_table"))
        )
      ),

      # ── Attention analysis ────────────────────────────────────────────────────
      tabItem(tabName = "attention",
        h1("Attention Analysis"),
        fluidRow(
          box(title = "Avg attention by student", width = 8,
              plotlyOutput("attn_student_bar", height = 350)),
          box(title = "Attention distribution", width = 4,
              plotlyOutput("attn_hist", height = 350))
        ),
        fluidRow(
          box(title = "Students with most warnings", width = 12,
              DTOutput("attn_warn_table"))
        )
      ),

      # ── Cheating detection ────────────────────────────────────────────────────
      tabItem(tabName = "cheating",
        h1("Cheating Detection"),
        fluidRow(
          valueBoxOutput("cheat_flags",    width = 4),
          valueBoxOutput("cheat_students", width = 4),
          valueBoxOutput("cheat_lectures", width = 4)
        ),
        fluidRow(
          box(title = "Flags per student", width = 6,
              plotlyOutput("cheat_student_bar", height = 300)),
          box(title = "Flags per lecture", width = 6,
              plotlyOutput("cheat_lec_bar", height = 300))
        ),
        fluidRow(
          box(title = "Integrity flag events", width = 12,
              DTOutput("cheat_table"))
        )
      ),

      # ── Clustering — Doctors ──────────────────────────────────────────────────
      tabItem(tabName = "cluster_doc",
        h1("Doctor Clustering", tags$small("group lecturers by class engagement patterns")),
        fluidRow(
          column(3,
            box(title = "Settings", width = 12,
              sliderInput("dc_k", "Number of clusters (k)", min = 2, max = 6, value = 3),
              actionButton("dc_run", "Run clustering", class = "btn-primary",
                           width = "100%")
            )
          ),
          column(9,
            box(title = "Doctor cluster plot", width = 12,
                plotlyOutput("dc_plot", height = 400))
          )
        ),
        fluidRow(
          box(title = "Cluster assignments", width = 12,
              DTOutput("dc_table"))
        )
      ),

      # ── Clustering — Students ─────────────────────────────────────────────────
      tabItem(tabName = "cluster_stud",
        h1("Student Clustering", tags$small("group students by engagement and attention")),
        fluidRow(
          column(3,
            box(title = "Settings", width = 12,
              sliderInput("sc_k", "Number of clusters (k)", min = 2, max = 6, value = 3),
              selectizeInput("sc_subject", "By subject (optional)", choices = NULL,
                             options = list(placeholder = "All subjects")),
              actionButton("sc_run", "Run clustering", class = "btn-primary",
                           width = "100%")
            )
          ),
          column(9,
            box(title = "Student cluster plot", width = 12,
                plotlyOutput("sc_plot", height = 400))
          )
        ),
        fluidRow(
          box(title = "Cluster assignments", width = 12,
              DTOutput("sc_table"))
        )
      ),

      # ── Recommendations ───────────────────────────────────────────────────────
      tabItem(tabName = "recs",
        h1("Recommendations", tags$small("system-wide insights and action items")),
        fluidRow(
          box(title = "Engagement vs attention", width = 8,
              plotlyOutput("recs_scatter", height = 350)),
          box(title = "Students needing support", width = 4,
              uiOutput("recs_panel"))
        ),
        fluidRow(
          box(title = "Doctors with lowest class engagement", width = 6,
              plotlyOutput("recs_doc_bar", height = 280)),
          box(title = "Lectures with lowest attendance", width = 6,
              plotlyOutput("recs_att_bar", height = 280))
        )
      )
    )
  )
)

# ── Server ────────────────────────────────────────────────────────────────────
server <- function(input, output, session) {

  refresh_trigger <- reactive({ input$refresh; Sys.time() })

  last_rt <- reactiveVal(Sys.time())
  observeEvent(refresh_trigger(), { last_rt(Sys.time()) })
  output$last_refresh_ui <- renderUI({
    div(style = "color:#94a3b8;font-size:10px;padding:0 18px;",
        paste("Updated", format(last_rt(), "%H:%M:%S")))
  })

  all_data_r <- reactive({
    refresh_trigger()
    tryCatch(load_emotions() |> attach_doctor_id(),
             error = function(e) dplyr::tibble())
  })

  grades_all_r <- reactive({
    refresh_trigger()
    tryCatch(load_grades(), error = function(e) dplyr::tibble())
  })

  students_r <- reactive({
    refresh_trigger()
    tryCatch(load_students_directory(), error = function(e) dplyr::tibble())
  })

  doctors_r <- reactive({
    refresh_trigger()
    tryCatch(load_doctors_directory(), error = function(e) dplyr::tibble())
  })

  # Filtered data
  filtered_r <- reactive({
    df  <- all_data_r()
    lid <- input$lecture_pick  %||% ""
    sid <- input$student_filter %||% ""
    did <- input$doctor_filter  %||% ""
    if (nzchar(lid)) df <- df |> filter(lecture_id == lid)
    if (nzchar(sid)) df <- df |> filter(student_id == sid)
    if (nzchar(did)) df <- df |> filter(doctor_id  == did)
    df
  })

  # Populate sidebar filters
  observe({
    df  <- all_data_r()
    dir <- students_r()
    drs <- doctors_r()

    lids <- sort(unique(na.omit(as.character(df$lecture_id))))
    updateSelectizeInput(session, "lecture_pick",
                         choices = c("All lectures" = "", stats::setNames(lids, lids)),
                         server  = TRUE)
    updateSelectizeInput(session, "lec_detail_pick",
                         choices = stats::setNames(lids, lids), server = TRUE)

    if (nrow(dir) > 0) {
      raw <- if ("id" %in% names(dir)) dir$id else dir$student_id
      sid <- na.omit(as.character(raw))
      nm  <- na.omit(as.character(dir$name %||% sid))
      if (length(nm) != length(sid)) nm <- sid
      choices <- if (length(sid) > 0) stats::setNames(sid, nm) else character(0)
    } else {
      sids <- sort(na.omit(unique(as.character(df$student_id))))
      choices <- stats::setNames(sids, sids)
    }
    updateSelectizeInput(session, "student_filter",
                         choices = c("All students" = "", choices), server = TRUE)

    if (nrow(drs) > 0) {
      raw <- if ("id" %in% names(drs)) drs$id else drs$doctor_id
      did <- na.omit(as.character(raw))
      nm  <- na.omit(as.character(drs$name %||% did))
      if (length(nm) != length(did)) nm <- did
      dchoices <- if (length(did) > 0) stats::setNames(did, nm) else character(0)
    } else {
      dids <- sort(na.omit(unique(as.character(df$doctor_id))))
      dchoices <- stats::setNames(dids, dids)
    }
    updateSelectizeInput(session, "doctor_filter",
                         choices = c("All doctors" = "", dchoices), server = TRUE)
  })

  # ── Overview KPIs ──────────────────────────────────────────────────────────
  output$ad_students <- renderValueBox({
    valueBox(n_distinct(filtered_r()$student_id),
             "Students", icon = icon("users"), color = "blue")
  })
  output$ad_doctors <- renderValueBox({
    valueBox(n_distinct(filtered_r()$doctor_id),
             "Doctors", icon = icon("user-doctor"), color = "purple")
  })
  output$ad_lectures <- renderValueBox({
    valueBox(n_distinct(filtered_r()$lecture_id),
             "Lectures", icon = icon("chalkboard"), color = "orange")
  })
  output$ad_engagement <- renderValueBox({
    e <- mean(filtered_r()$engagement_score, na.rm = TRUE)
    if (!is.finite(e)) e <- 0
    valueBox(sprintf("%.2f", e), "Avg engagement", icon = icon("bolt"),
             color = if (e >= 0.5) "green" else if (e >= 0.3) "yellow" else "red")
  })

  output$ad_lecture_trend <- renderPlotly({
    df <- filtered_r()
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> group_by(lecture_id) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE), .groups = "drop")
    plot_ly(b, x = ~lecture_id, y = ~eng, type = "bar",
            marker = list(color = PALETTE$primary, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Lecture", tickangle = -30),
                     yaxis = list(title = "Avg engagement", range = c(0, 1))) |>
      style_plotly()
  })

  output$ad_emotion_pie <- renderPlotly({
    df <- filtered_r() |> count(emotion, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "emotion", "n")
  })

  output$ad_attendance_bar <- renderPlotly({
    df <- filtered_r()
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> group_by(lecture_id) |>
      summarise(students = n_distinct(student_id), .groups = "drop")
    plot_ly(b, x = ~lecture_id, y = ~students, type = "bar",
            marker = list(color = PALETTE$accent, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Lecture", tickangle = -30),
                     yaxis = list(title = "Students")) |>
      style_plotly()
  })

  output$ad_doc_eng_bar <- renderPlotly({
    df <- filtered_r()
    if (nrow(df) == 0 || !"doctor_id" %in% names(df)) return(plotly_empty())
    b <- df |> group_by(doctor_id) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE), .groups = "drop") |>
      arrange(desc(eng))
    plot_ly(b, x = ~doctor_id, y = ~eng, type = "bar",
            marker = list(color = PALETTE$primary2, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Doctor", tickangle = -30),
                     yaxis = list(title = "Avg engagement", range = c(0, 1))) |>
      style_plotly()
  })

  # ── Distributions ─────────────────────────────────────────────────────────
  output$dist_eng_hist <- renderPlotly({
    df <- filtered_r()
    if (nrow(df) == 0) return(plotly_empty())
    plot_ly(x = df$engagement_score[!is.na(df$engagement_score)], type = "histogram",
            marker = list(color = PALETTE$primary, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Engagement"),
                     yaxis = list(title = "Count")) |>
      style_plotly()
  })

  output$dist_attn_hist <- renderPlotly({
    df <- filtered_r()
    attn <- suppressWarnings(as.numeric(df$attention_score))
    attn <- attn[!is.na(attn)]
    if (length(attn) == 0) return(plotly_empty())
    plot_ly(x = attn, type = "histogram",
            marker = list(color = PALETTE$accent, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Attention"),
                     yaxis = list(title = "Count")) |>
      style_plotly()
  })

  output$dist_scatter <- renderPlotly({
    df <- filtered_r() |>
      mutate(attn = suppressWarnings(as.numeric(attention_score))) |>
      filter(!is.na(attn) & !is.na(engagement_score))
    if (nrow(df) == 0) return(plotly_empty())
    plot_ly(df, x = ~engagement_score, y = ~attn, color = ~emotion,
            type = "scatter", mode = "markers",
            marker = list(size = 4, opacity = 0.5)) |>
      plotly::layout(xaxis = list(title = "Engagement"),
                     yaxis = list(title = "Attention")) |>
      style_plotly()
  })

  # ── Emotion analysis ───────────────────────────────────────────────────────
  output$emo_bar <- renderPlotly({
    df <- filtered_r() |> count(emotion, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    plot_ly(df, x = ~emotion, y = ~n, type = "bar",
            marker = list(color = PALETTE$accent, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Emotion"),
                     yaxis = list(title = "Count")) |>
      style_plotly()
  })

  output$emo_heat <- renderPlotly({
    df <- filtered_r()
    if (nrow(df) == 0) return(plotly_empty())
    mat <- df |> count(lecture_id, emotion) |>
      pivot_wider(names_from = emotion, values_from = n, values_fill = 0)
    lids <- mat$lecture_id
    vals <- as.matrix(mat[, -1, drop = FALSE])
    plot_ly(x = colnames(vals), y = lids, z = vals, type = "heatmap",
            colorscale = "Blues") |>
      plotly::layout(xaxis = list(title = "Emotion"),
                     yaxis = list(title = "Lecture")) |>
      style_plotly()
  })

  output$emo_line <- renderPlotly({
    df <- filtered_r() |> filter(!is.na(timestamp)) |>
      mutate(hour = lubridate::floor_date(timestamp, "hour")) |>
      count(hour, emotion)
    if (nrow(df) == 0) return(plotly_empty())
    plot_ly(df, x = ~hour, y = ~n, color = ~emotion, type = "scatter", mode = "lines") |>
      plotly::layout(xaxis = list(title = "Time"),
                     yaxis = list(title = "Count")) |>
      style_plotly()
  })

  # ── Per-Lecture ────────────────────────────────────────────────────────────
  lec_detail_r <- reactive({
    req(nzchar(input$lec_detail_pick %||% ""))
    all_data_r() |> filter(lecture_id == input$lec_detail_pick)
  })

  output$lec_stats_box <- renderUI({
    df <- lec_detail_r()
    if (nrow(df) == 0) return(p("No data."))
    e <- mean(df$engagement_score, na.rm = TRUE)
    a <- mean(suppressWarnings(as.numeric(df$attention_score)), na.rm = TRUE)
    tagList(
      div(style = "margin-top:10px;",
        div(style = "font-size:12px;color:#94a3b8;", "Students"),
        div(style = "font-size:22px;font-weight:700;", n_distinct(df$student_id))
      ),
      div(style = "margin-top:10px;",
        div(style = "font-size:12px;color:#94a3b8;", "Avg engagement"),
        div(style = "font-size:22px;font-weight:700;color:#6366f1;",
            if (is.finite(e)) sprintf("%.2f", e) else "—")
      ),
      div(style = "margin-top:10px;",
        div(style = "font-size:12px;color:#94a3b8;", "Avg attention"),
        div(style = "font-size:22px;font-weight:700;color:#06b6d4;",
            if (is.finite(a)) sprintf("%.1f", a) else "—")
      )
    )
  })

  output$lec_eng_line <- renderPlotly({
    df <- lec_detail_r() |> filter(!is.na(timestamp)) |> arrange(timestamp)
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> group_by(timestamp) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE), .groups = "drop")
    plot_ly(b, x = ~timestamp, y = ~eng, type = "scatter", mode = "lines",
            line = list(color = PALETTE$primary, width = 2)) |>
      plotly::layout(yaxis = list(title = "Engagement", range = c(0, 1))) |>
      style_plotly()
  })

  output$lec_emotion_pie <- renderPlotly({
    df <- lec_detail_r() |> count(emotion, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "emotion", "n")
  })

  output$lec_student_bar <- renderPlotly({
    df <- lec_detail_r()
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> group_by(student_id) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE), .groups = "drop") |>
      arrange(desc(eng))
    plot_ly(b, x = ~student_id, y = ~eng, type = "bar",
            marker = list(color = PALETTE$primary2, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Student", tickangle = -30),
                     yaxis = list(title = "Engagement", range = c(0, 1))) |>
      style_plotly()
  })

  output$lec_gesture_pie <- renderPlotly({
    df <- lec_detail_r() |>
      filter(!is.na(gesture) & gesture != "none") |>
      count(gesture, sort = TRUE)
    if (nrow(df) == 0) df <- lec_detail_r() |> count(gesture, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "gesture", "n")
  })

  # ── Trends ────────────────────────────────────────────────────────────────
  output$trend_eng_line <- renderPlotly({
    df <- all_data_r()
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> group_by(lecture_id) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE), .groups = "drop")
    plot_ly(b, x = ~lecture_id, y = ~eng, type = "scatter", mode = "lines+markers",
            line = list(color = PALETTE$primary, width = 2)) |>
      plotly::layout(xaxis = list(title = "Lecture", tickangle = -30),
                     yaxis = list(title = "Avg engagement", range = c(0, 1))) |>
      style_plotly()
  })

  output$trend_attn_line <- renderPlotly({
    df <- all_data_r()
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> group_by(lecture_id) |>
      summarise(attn = mean(suppressWarnings(as.numeric(attention_score)), na.rm = TRUE),
                .groups = "drop")
    plot_ly(b, x = ~lecture_id, y = ~attn, type = "scatter", mode = "lines+markers",
            line = list(color = PALETTE$accent, width = 2)) |>
      plotly::layout(xaxis = list(title = "Lecture", tickangle = -30),
                     yaxis = list(title = "Avg attention")) |>
      style_plotly()
  })

  output$trend_emo_area <- renderPlotly({
    df <- all_data_r()
    if (nrow(df) == 0) return(plotly_empty())
    emo_counts <- df |> count(lecture_id, emotion)
    plot_ly(emo_counts, x = ~lecture_id, y = ~n, color = ~emotion, type = "bar") |>
      plotly::layout(barmode = "stack",
                     xaxis = list(title = "Lecture", tickangle = -30),
                     yaxis = list(title = "Count")) |>
      style_plotly()
  })

  # ── Student Directory ──────────────────────────────────────────────────────
  output$stud_table <- renderDT({
    dir <- students_r()
    q   <- trimws(input$stud_q %||% "")
    if (nrow(dir) == 0) return(datatable(data.frame(Message = "No students found.")))
    if (nzchar(q)) {
      hay <- paste(as.character(dir$name %||% ""),
                   as.character(dir$student_id %||% dir$id %||% ""),
                   as.character(dir$email %||% ""))
      dir <- dir[grepl(q, hay, ignore.case = TRUE, perl = TRUE), , drop = FALSE]
    }
    cols <- intersect(c("name","student_id","email","active"), names(dir))
    datatable(dir[, cols, drop = FALSE], rownames = FALSE,
              class = "stripe hover row-border",
              options = list(pageLength = 20, dom = "lftipr",
                             language = list(searchPlaceholder = "Search…")))
  })

  output$stud_eng_bar <- renderPlotly({
    df <- filtered_r()
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> group_by(student_id) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE), .groups = "drop") |>
      arrange(desc(eng))
    plot_ly(b, x = ~student_id, y = ~eng, type = "bar",
            marker = list(color = PALETTE$primary, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Student", tickangle = -30),
                     yaxis = list(title = "Avg engagement", range = c(0, 1))) |>
      style_plotly()
  })

  # ── Doctor Directory ───────────────────────────────────────────────────────
  output$doc_table <- renderDT({
    drs <- doctors_r()
    q   <- trimws(input$doc_q %||% "")
    if (nrow(drs) == 0) return(datatable(data.frame(Message = "No doctors found.")))
    if (nzchar(q)) {
      hay <- paste(as.character(drs$name        %||% ""),
                   as.character(drs$doctor_id   %||% drs$id %||% ""),
                   as.character(drs$department  %||% ""),
                   as.character(drs$email       %||% ""))
      drs <- drs[grepl(q, hay, ignore.case = TRUE, perl = TRUE), , drop = FALSE]
    }
    cols <- intersect(c("name","doctor_id","department","email","active"), names(drs))
    datatable(drs[, cols, drop = FALSE], rownames = FALSE,
              class = "stripe hover row-border",
              options = list(pageLength = 20, dom = "lftipr",
                             language = list(searchPlaceholder = "Search…")))
  })

  output$doc_eng_bar <- renderPlotly({
    df <- filtered_r()
    if (nrow(df) == 0 || !"doctor_id" %in% names(df)) return(plotly_empty())
    b <- df |> group_by(doctor_id) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE), .groups = "drop") |>
      arrange(desc(eng))
    plot_ly(b, x = ~doctor_id, y = ~eng, type = "bar",
            marker = list(color = PALETTE$primary2, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Doctor", tickangle = -30),
                     yaxis = list(title = "Avg engagement", range = c(0, 1))) |>
      style_plotly()
  })

  # ── Grades ─────────────────────────────────────────────────────────────────
  output$grd_avg_mark <- renderValueBox({
    g <- grades_all_r()
    m <- if (nrow(g) > 0) mean(suppressWarnings(as.numeric(g$mark)), na.rm = TRUE) else NA_real_
    valueBox(if (is.finite(m)) sprintf("%.1f", m) else "—",
             "Avg mark", icon = icon("chart-line"),
             color = if (!is.finite(m)) "blue" else if (m >= 70) "green" else if (m >= 50) "yellow" else "red")
  })
  output$grd_pass_rate <- renderValueBox({
    g <- grades_all_r()
    if (nrow(g) == 0) return(valueBox("—", "Pass rate", icon = icon("percent"), color = "blue"))
    rate <- mean(suppressWarnings(as.numeric(g$mark)) >= 50, na.rm = TRUE)
    valueBox(if (is.finite(rate)) sprintf("%.0f%%", rate * 100) else "—",
             "Pass rate", icon = icon("percent"),
             color = if (!is.finite(rate)) "blue" else if (rate >= 0.7) "green" else "red")
  })
  output$grd_count <- renderValueBox({
    valueBox(nrow(grades_all_r()), "Grade records", icon = icon("list"), color = "purple")
  })

  output$grd_table <- renderDT({
    g <- grades_all_r()
    if (nrow(g) == 0) {
      return(datatable(data.frame(Message = "No grades found."),
                       rownames = FALSE, options = list(dom = "t", paging = FALSE)))
    }
    cols <- intersect(c("student_name","subject_name","doctor_name","mark","grade"), names(g))
    datatable(g[, cols, drop = FALSE], rownames = FALSE,
              class = "stripe hover row-border",
              options = list(pageLength = 20, dom = "lftipr",
                             language = list(searchPlaceholder = "Search…")))
  })

  output$grd_pie <- renderPlotly({
    g <- grades_all_r()
    if (nrow(g) == 0 || !"grade" %in% names(g)) return(plotly_empty())
    df <- g |> count(grade, sort = TRUE)
    .pie(df, "grade", "n")
  })

  # ── Attendance ─────────────────────────────────────────────────────────────
  output$att_bar <- renderPlotly({
    df <- all_data_r()
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> group_by(lecture_id) |>
      summarise(students = n_distinct(student_id), .groups = "drop")
    plot_ly(b, x = ~lecture_id, y = ~students, type = "bar",
            marker = list(color = PALETTE$primary, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Lecture", tickangle = -30),
                     yaxis = list(title = "Students")) |>
      style_plotly()
  })

  output$att_hist <- renderPlotly({
    df <- all_data_r()
    if (nrow(df) == 0) return(plotly_empty())
    total_lec <- n_distinct(df$lecture_id)
    rates <- df |> group_by(student_id) |>
      summarise(rate = n_distinct(lecture_id) / total_lec, .groups = "drop")
    plot_ly(x = rates$rate, type = "histogram",
            marker = list(color = PALETTE$accent, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Attendance rate"),
                     yaxis = list(title = "Students")) |>
      style_plotly()
  })

  output$att_table <- renderDT({
    df <- all_data_r()
    if (nrow(df) == 0) return(datatable(data.frame(Message = "No data.")))
    total_lec <- n_distinct(df$lecture_id)
    att <- df |> group_by(student_id) |>
      summarise(lectures_attended = n_distinct(lecture_id),
                attendance_rate   = round(n_distinct(lecture_id) / total_lec, 3),
                avg_engagement    = round(mean(engagement_score, na.rm = TRUE), 3),
                .groups = "drop") |>
      arrange(attendance_rate)
    datatable(att, rownames = FALSE, class = "stripe hover row-border",
              options = list(pageLength = 25, dom = "lftipr"))
  })

  # ── Raw data ────────────────────────────────────────────────────────────────
  output$raw_table <- renderDT({
    df <- filtered_r()
    if (nrow(df) == 0) return(datatable(data.frame(Message = "No data.")))
    cols <- intersect(c("timestamp","student_id","lecture_id","doctor_id","emotion","state",
                        "engagement_score","attention_score","gesture","cheat_warning"), names(df))
    datatable(df[, cols, drop = FALSE], rownames = FALSE,
              class = "stripe hover row-border",
              options = list(pageLength = 30, dom = "lftipr", scrollX = TRUE))
  })

  # ── Attention analysis ─────────────────────────────────────────────────────
  output$attn_student_bar <- renderPlotly({
    df <- filtered_r() |>
      mutate(attn = suppressWarnings(as.numeric(attention_score))) |>
      group_by(student_id) |>
      summarise(avg_attn = mean(attn, na.rm = TRUE), .groups = "drop") |>
      arrange(avg_attn)
    if (nrow(df) == 0) return(plotly_empty())
    plot_ly(df, x = ~student_id, y = ~avg_attn, type = "bar",
            marker = list(color = PALETTE$accent, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Student", tickangle = -30),
                     yaxis = list(title = "Avg attention")) |>
      style_plotly()
  })

  output$attn_hist <- renderPlotly({
    df <- filtered_r()
    attn <- suppressWarnings(as.numeric(df$attention_score))
    attn <- attn[!is.na(attn)]
    if (length(attn) == 0) return(plotly_empty())
    plot_ly(x = attn, type = "histogram",
            marker = list(color = PALETTE$primary2, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Attention"),
                     yaxis = list(title = "Count")) |>
      style_plotly()
  })

  output$attn_warn_table <- renderDT({
    df <- filtered_r()
    if (nrow(df) == 0) return(datatable(data.frame(Message = "No data.")))
    warns <- df |>
      mutate(warn = suppressWarnings(as.logical(attention_warning %||% FALSE))) |>
      group_by(student_id) |>
      summarise(warnings = sum(warn == TRUE, na.rm = TRUE),
                avg_attn = round(mean(suppressWarnings(as.numeric(attention_score)), na.rm = TRUE), 1),
                .groups = "drop") |>
      arrange(desc(warnings))
    datatable(warns, rownames = FALSE, class = "stripe hover row-border",
              options = list(pageLength = 20, dom = "lftipr"))
  })

  # ── Cheating detection ─────────────────────────────────────────────────────
  cheat_df_r <- reactive({
    df <- all_data_r()
    if (nrow(df) == 0 || !"cheat_warning" %in% names(df)) return(dplyr::tibble())
    df |> filter(suppressWarnings(as.logical(cheat_warning)) == TRUE)
  })

  output$cheat_flags    <- renderValueBox({
    valueBox(nrow(cheat_df_r()), "Total flags", icon = icon("flag"), color = "red")
  })
  output$cheat_students <- renderValueBox({
    valueBox(n_distinct(cheat_df_r()$student_id),
             "Students flagged", icon = icon("user-xmark"), color = "orange")
  })
  output$cheat_lectures <- renderValueBox({
    valueBox(n_distinct(cheat_df_r()$lecture_id),
             "Lectures with flags", icon = icon("chalkboard"), color = "yellow")
  })

  output$cheat_student_bar <- renderPlotly({
    df <- cheat_df_r()
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> count(student_id, sort = TRUE)
    plot_ly(b, x = ~student_id, y = ~n, type = "bar",
            marker = list(color = PALETTE$bad, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Student", tickangle = -30),
                     yaxis = list(title = "Flags")) |>
      style_plotly()
  })

  output$cheat_lec_bar <- renderPlotly({
    df <- cheat_df_r()
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> count(lecture_id, sort = TRUE)
    plot_ly(b, x = ~lecture_id, y = ~n, type = "bar",
            marker = list(color = PALETTE$accent, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Lecture", tickangle = -30),
                     yaxis = list(title = "Flags")) |>
      style_plotly()
  })

  output$cheat_table <- renderDT({
    df <- cheat_df_r()
    if (nrow(df) == 0) {
      return(datatable(data.frame(Message = "No integrity flags."),
                       rownames = FALSE, options = list(dom = "t", paging = FALSE)))
    }
    cols <- intersect(c("timestamp","student_id","lecture_id","gesture","cheat_score","emotion"), names(df))
    datatable(df[, cols, drop = FALSE], rownames = FALSE,
              class = "stripe hover row-border",
              options = list(pageLength = 20, dom = "lftipr"))
  })

  # ── Clustering — Doctors ───────────────────────────────────────────────────
  dc_result <- eventReactive(input$dc_run, ignoreNULL = FALSE, {
    df <- all_data_r()
    if (nrow(df) == 0 || !"doctor_id" %in% names(df)) return(NULL)
    feat <- df |> group_by(doctor_id) |>
      summarise(avg_eng  = mean(engagement_score, na.rm = TRUE),
                avg_attn = mean(suppressWarnings(as.numeric(attention_score)), na.rm = TRUE),
                n_lec    = n_distinct(lecture_id),
                n_stud   = n_distinct(student_id),
                .groups  = "drop") |>
      filter(!is.na(avg_eng) & !is.na(avg_attn))
    if (nrow(feat) < 2) return(list(feat = feat, km = NULL))
    k <- min(input$dc_k, nrow(feat))
    mat <- scale(feat[, c("avg_eng","avg_attn","n_lec","n_stud")])
    set.seed(42)
    km <- kmeans(mat, centers = k, nstart = 10)
    feat$cluster <- factor(km$cluster)
    list(feat = feat, km = km)
  })

  output$dc_plot <- renderPlotly({
    res <- dc_result()
    if (is.null(res) || is.null(res$km)) return(plotly_empty())
    df <- res$feat
    plot_ly(df, x = ~avg_eng, y = ~avg_attn, color = ~cluster,
            text = ~doctor_id, type = "scatter", mode = "markers+text",
            textposition = "top center",
            marker = list(size = 14, opacity = 0.8)) |>
      plotly::layout(xaxis = list(title = "Avg engagement"),
                     yaxis = list(title = "Avg attention"),
                     title = "Doctor clusters") |>
      style_plotly()
  })

  output$dc_table <- renderDT({
    res <- dc_result()
    if (is.null(res)) return(datatable(data.frame(Message = "Run clustering first.")))
    df <- res$feat
    cols <- intersect(c("doctor_id","cluster","avg_eng","avg_attn","n_lec","n_stud"), names(df))
    datatable(df[, cols, drop = FALSE], rownames = FALSE,
              options = list(pageLength = 20, dom = "t", paging = FALSE))
  })

  # ── Clustering — Students ──────────────────────────────────────────────────
  # Populate subject picker for student clustering
  observe({
    g <- grades_all_r()
    if (nrow(g) > 0 && "subject_name" %in% names(g)) {
      subs <- sort(unique(na.omit(g$subject_name)))
      updateSelectizeInput(session, "sc_subject",
                           choices = c("All subjects" = "", stats::setNames(subs, subs)),
                           server  = TRUE)
    }
  })

  sc_result <- eventReactive(input$sc_run, ignoreNULL = FALSE, {
    df <- all_data_r()
    if (nrow(df) == 0) return(NULL)
    subj <- input$sc_subject %||% ""
    if (nzchar(subj)) {
      g <- grades_all_r()
      if (nrow(g) > 0 && "subject_name" %in% names(g)) {
        stud_in_subj <- unique(na.omit(g$student_id[g$subject_name == subj]))
        df <- df |> filter(student_id %in% stud_in_subj)
      }
    }
    feat <- df |> group_by(student_id) |>
      summarise(avg_eng  = mean(engagement_score, na.rm = TRUE),
                avg_attn = mean(suppressWarnings(as.numeric(attention_score)), na.rm = TRUE),
                n_lec    = n_distinct(lecture_id),
                warn     = sum(suppressWarnings(as.logical(attention_warning %||% FALSE)) == TRUE, na.rm = TRUE),
                .groups  = "drop") |>
      filter(!is.na(avg_eng) & !is.na(avg_attn))
    if (nrow(feat) < 2) return(list(feat = feat, km = NULL))
    k <- min(input$sc_k, nrow(feat))
    mat <- scale(feat[, c("avg_eng","avg_attn","n_lec","warn")])
    set.seed(42)
    km <- kmeans(mat, centers = k, nstart = 10)
    feat$cluster <- factor(km$cluster)
    list(feat = feat, km = km)
  })

  output$sc_plot <- renderPlotly({
    res <- sc_result()
    if (is.null(res) || is.null(res$km)) return(plotly_empty())
    df <- res$feat
    plot_ly(df, x = ~avg_eng, y = ~avg_attn, color = ~cluster,
            text = ~student_id, type = "scatter", mode = "markers",
            marker = list(size = 8, opacity = 0.7)) |>
      plotly::layout(xaxis = list(title = "Avg engagement"),
                     yaxis = list(title = "Avg attention"),
                     title = "Student clusters") |>
      style_plotly()
  })

  output$sc_table <- renderDT({
    res <- sc_result()
    if (is.null(res)) return(datatable(data.frame(Message = "Run clustering first.")))
    df <- res$feat
    cols <- intersect(c("student_id","cluster","avg_eng","avg_attn","n_lec","warn"), names(df))
    datatable(df[, cols, drop = FALSE], rownames = FALSE,
              class = "stripe hover row-border",
              options = list(pageLength = 25, dom = "lftipr"))
  })

  # ── Recommendations ────────────────────────────────────────────────────────
  output$recs_scatter <- renderPlotly({
    df <- filtered_r() |>
      mutate(attn = suppressWarnings(as.numeric(attention_score))) |>
      group_by(student_id) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE),
                attn = mean(attn, na.rm = TRUE), .groups = "drop")
    if (nrow(df) == 0) return(plotly_empty())
    df$needs_support <- df$eng < 0.4 | df$attn < 50
    plot_ly(df, x = ~eng, y = ~attn, color = ~needs_support,
            colors = c("FALSE" = PALETTE$good, "TRUE" = PALETTE$bad),
            text = ~student_id, type = "scatter", mode = "markers",
            marker = list(size = 10, opacity = 0.7)) |>
      plotly::layout(xaxis = list(title = "Avg engagement"),
                     yaxis = list(title = "Avg attention")) |>
      style_plotly()
  })

  output$recs_panel <- renderUI({
    df <- filtered_r() |>
      mutate(attn = suppressWarnings(as.numeric(attention_score))) |>
      group_by(student_id) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE),
                attn = mean(attn, na.rm = TRUE), .groups = "drop") |>
      filter(eng < 0.4 | attn < 50)
    if (nrow(df) == 0) {
      return(div(class = "rec-card good", "All students performing well."))
    }
    tagList(
      p(style = "color:#94a3b8;font-size:12px;", sprintf("%d student(s) need support:", nrow(df))),
      lapply(seq_len(min(nrow(df), 5)), function(i) {
        cls <- if (df$eng[i] < 0.25 || df$attn[i] < 35) "danger" else "warn"
        div(class = paste("rec-card", cls),
            strong(df$student_id[i]), br(),
            sprintf("Eng %.2f · Attn %.0f", df$eng[i], df$attn[i]))
      })
    )
  })

  output$recs_doc_bar <- renderPlotly({
    df <- all_data_r()
    if (nrow(df) == 0 || !"doctor_id" %in% names(df)) return(plotly_empty())
    b <- df |> group_by(doctor_id) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE), .groups = "drop") |>
      arrange(eng) |> head(10)
    plot_ly(b, x = ~doctor_id, y = ~eng, type = "bar",
            marker = list(color = PALETTE$warn, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Doctor", tickangle = -30),
                     yaxis = list(title = "Avg engagement", range = c(0, 1))) |>
      style_plotly()
  })

  output$recs_att_bar <- renderPlotly({
    df <- all_data_r()
    if (nrow(df) == 0) return(plotly_empty())
    total_stud <- n_distinct(df$student_id)
    b <- df |> group_by(lecture_id) |>
      summarise(rate = n_distinct(student_id) / total_stud, .groups = "drop") |>
      arrange(rate) |> head(10)
    plot_ly(b, x = ~lecture_id, y = ~rate, type = "bar",
            marker = list(color = PALETTE$bad, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Lecture", tickangle = -30),
                     yaxis = list(title = "Attendance rate", range = c(0, 1))) |>
      style_plotly()
  })
}

shinyApp(ui, server)
