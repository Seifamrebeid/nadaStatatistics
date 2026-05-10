user_lib <- file.path(Sys.getenv("LOCALAPPDATA"), "R", "win-library", "4.5")
if (dir.exists(user_lib) && !(user_lib %in% .libPaths())) .libPaths(c(user_lib, .libPaths()))

suppressPackageStartupMessages({
  library(shiny); library(shinydashboard); library(dplyr)
  library(ggplot2); library(plotly); library(DT); library(lubridate)
  library(tidyr)
})

source("../../load_data.R")
source("../shared/theme.R")
source("../shared/helpers.R")

# ── UI ────────────────────────────────────────────────────────────────────────
ui <- dashboardPage(
  skin = "purple",
  dashboardHeader(
    title = tags$span(
      tags$span(style = "font-weight:800;letter-spacing:-0.03em;", "Doctor"),
      tags$span(style = "font-weight:400;opacity:0.55;margin-left:4px;", "Dashboard")
    ),
    titleWidth = 260
  ),
  dashboardSidebar(
    width = 260,
    sidebarMenu(
      tags$li(class = "header", "Navigation"),
      menuItem("Overview",          tabName = "overview",      icon = icon("gauge-high"),     class = "sec-analytics"),
      menuItem("Doctor Dashboard",  tabName = "doctor_dash",   icon = icon("user-doctor"),    class = "sec-analytics"),
      menuItem("Live Classroom",    tabName = "live",          icon = icon("circle-dot"),     class = "sec-analytics"),
      menuItem("Distributions",     tabName = "distributions", icon = icon("chart-bar"),      class = "sec-analytics"),
      menuItem("Emotion Analysis",  tabName = "emotion_dist",  icon = icon("face-smile"),     class = "sec-analytics"),
      menuItem("Per-Lecture",       tabName = "per_lecture",   icon = icon("chalkboard"),     class = "sec-data"),
      menuItem("Trends",            tabName = "trends",        icon = icon("arrow-trend-up"), class = "sec-data"),
      menuItem("Student Search",    tabName = "student_search",icon = icon("magnifying-glass"),class = "sec-data"),
      menuItem("Grades",            tabName = "grades",        icon = icon("award"),          class = "sec-data"),
      menuItem("Attendance",        tabName = "attendance",    icon = icon("calendar-check"), class = "sec-data"),
      menuItem("Attention Analysis",tabName = "attention",     icon = icon("eye"),            class = "sec-insights"),
      menuItem("Cheating Detection",tabName = "cheating",      icon = icon("triangle-exclamation"), class = "sec-insights"),
      menuItem("Recommendations",   tabName = "recs",          icon = icon("lightbulb"),      class = "sec-insights")
    ),
    tags$hr(),
    div(style = "padding: 0 10px;",
      selectizeInput("lecture_pick", "Filter by lecture", choices = NULL,
                     options = list(placeholder = "All lectures")),
      selectizeInput("student_filter", "Filter by student", choices = NULL,
                     options = list(placeholder = "All students"))
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
              div(class = "page-hero__eyebrow", icon("user-doctor"), "Doctor Portal"),
              div(class = "page-hero__title", "Classroom Analytics"),
              p(class = "page-hero__text",
                "Monitor student engagement, attention, emotions, and grades across your lectures."),
              div(class = "page-hero__meta",
                span(class = "page-hero__pill", icon("bolt"),      "Engagement tracking"),
                span(class = "page-hero__pill", icon("eye"),       "Attention analysis"),
                span(class = "page-hero__pill", icon("triangle-exclamation"), "Integrity alerts")
              )
            )
          )
        ),
        fluidRow(
          valueBoxOutput("dr_students",   width = 3),
          valueBoxOutput("dr_lectures",   width = 3),
          valueBoxOutput("dr_engagement", width = 3),
          valueBoxOutput("dr_warnings",   width = 3)
        ),
        fluidRow(
          box(title = "Engagement per lecture", width = 7,
              plotlyOutput("dr_lecture_trend", height = 300)),
          box(title = "Emotion mix", width = 5,
              plotlyOutput("dr_emotion_pie", height = 300))
        )
      ),

      # ── Doctor Dashboard ──────────────────────────────────────────────────────
      tabItem(tabName = "doctor_dash",
        h1("Doctor Dashboard", tags$small("class-wide engagement and performance")),
        fluidRow(
          box(title = "Avg engagement by student", width = 7,
              plotlyOutput("dr_student_eng_bar", height = 350)),
          box(title = "Top engaged students", width = 5,
              DTOutput("dr_top_students"))
        ),
        fluidRow(
          box(title = "Engagement heatmap (student × lecture)", width = 12,
              plotlyOutput("dr_eng_heat", height = 400))
        )
      ),

      # ── Live Classroom ────────────────────────────────────────────────────────
      tabItem(tabName = "live",
        h1("Live Classroom", tags$small("most recent lecture snapshot")),
        fluidRow(
          valueBoxOutput("live_active",  width = 3),
          valueBoxOutput("live_eng",     width = 3),
          valueBoxOutput("live_attn",    width = 3),
          valueBoxOutput("live_cheat",   width = 3)
        ),
        fluidRow(
          box(title = "Real-time emotion distribution", width = 6,
              plotlyOutput("live_emotion_pie", height = 300)),
          box(title = "Engagement over time (latest lecture)", width = 6,
              plotlyOutput("live_eng_line", height = 300))
        ),
        fluidRow(
          box(title = "Student states", width = 12,
              DTOutput("live_student_table"))
        )
      ),

      # ── Distributions ─────────────────────────────────────────────────────────
      tabItem(tabName = "distributions",
        h1("Distributions", tags$small("how engagement and attention are spread")),
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

      # ── Emotion distribution ──────────────────────────────────────────────────
      tabItem(tabName = "emotion_dist",
        h1("Emotion Analysis", tags$small("emotions across the class")),
        fluidRow(
          box(title = "Emotion breakdown (bar)", width = 6,
              plotlyOutput("emo_bar", height = 350)),
          box(title = "Emotion heatmap by lecture", width = 6,
              plotlyOutput("emo_heat", height = 350))
        ),
        fluidRow(
          box(title = "Emotion over time", width = 12,
              plotlyOutput("emo_line", height = 300))
        )
      ),

      # ── Per-Lecture ───────────────────────────────────────────────────────────
      tabItem(tabName = "per_lecture",
        h1("Per-Lecture Breakdown", tags$small("detailed stats for one lecture")),
        fluidRow(
          column(4,
            box(title = "Lecture picker", width = 12,
              selectizeInput("lec_detail_pick", "Lecture", choices = NULL,
                             options = list(placeholder = "Choose lecture…")),
              uiOutput("lec_stats_box")
            )
          ),
          column(8,
            box(title = "Engagement over time", width = 12,
                plotlyOutput("lec_eng_line", height = 300))
          )
        ),
        fluidRow(
          box(title = "Emotion breakdown", width = 6,
              plotlyOutput("lec_emotion_pie", height = 300)),
          box(title = "Per-student engagement", width = 6,
              plotlyOutput("lec_student_bar", height = 300))
        )
      ),

      # ── Trends ───────────────────────────────────────────────────────────────
      tabItem(tabName = "trends",
        h1("Trends", tags$small("how the class evolves across weeks")),
        fluidRow(
          box(title = "Class avg engagement (per lecture)", width = 8,
              plotlyOutput("trend_eng_line", height = 300)),
          box(title = "Attention trend", width = 4,
              plotlyOutput("trend_attn_line", height = 300))
        ),
        fluidRow(
          box(title = "Emotion mix over lectures", width = 12,
              plotlyOutput("trend_emo_area", height = 350))
        )
      ),

      # ── Student Search ────────────────────────────────────────────────────────
      tabItem(tabName = "student_search",
        h1("Student Search", tags$small("look up any student's engagement profile")),
        fluidRow(
          box(title = "Find student", width = 12,
            fluidRow(
              column(6,
                textInput("stud_search_q", "Search by name or ID", placeholder = "e.g. Alice or s001")
              )
            ),
            DTOutput("stud_directory_table")
          )
        ),
        fluidRow(
          box(title = "Selected student engagement", width = 8,
              plotlyOutput("stud_eng_bar", height = 300)),
          box(title = "Selected student emotion mix", width = 4,
              plotlyOutput("stud_emo_pie", height = 300))
        )
      ),

      # ── Grades ───────────────────────────────────────────────────────────────
      tabItem(tabName = "grades",
        h1("Grades", tags$small("class gradebook")),
        fluidRow(
          valueBoxOutput("grd_avg_mark",  width = 4),
          valueBoxOutput("grd_pass_rate", width = 4),
          valueBoxOutput("grd_students",  width = 4)
        ),
        fluidRow(
          box(title = "Gradebook", width = 8,
              DTOutput("grd_table")),
          box(title = "Grade distribution", width = 4,
              plotlyOutput("grd_pie", height = 300))
        )
      ),

      # ── Attendance ────────────────────────────────────────────────────────────
      tabItem(tabName = "attendance",
        h1("Attendance", tags$small("who attended which lectures")),
        fluidRow(
          box(title = "Attendance per lecture", width = 8,
              plotlyOutput("att_bar", height = 300)),
          box(title = "Attendance rate distribution", width = 4,
              plotlyOutput("att_hist", height = 300))
        ),
        fluidRow(
          box(title = "Student attendance records", width = 12,
              DTOutput("att_table"))
        )
      ),

      # ── Attention analysis ────────────────────────────────────────────────────
      tabItem(tabName = "attention",
        h1("Attention Analysis", tags$small("who needs the most support")),
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
        h1("Cheating Detection", tags$small("integrity flags raised during lectures")),
        fluidRow(
          valueBoxOutput("cheat_flags",    width = 4),
          valueBoxOutput("cheat_students", width = 4),
          valueBoxOutput("cheat_lectures", width = 4)
        ),
        fluidRow(
          box(title = "Integrity flag events", width = 12,
              DTOutput("cheat_table"))
        )
      ),

      # ── Recommendations ───────────────────────────────────────────────────────
      tabItem(tabName = "recs",
        h1("Recommendations", tags$small("teaching insights and next steps")),
        fluidRow(
          box(title = "Engagement vs attention (per student)", width = 8,
              plotlyOutput("recs_scatter", height = 350)),
          box(title = "Students needing support", width = 4,
              uiOutput("recs_panel"))
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

  # Filtered data (lecture + student sidebar filters)
  filtered_r <- reactive({
    df <- all_data_r()
    lid <- input$lecture_pick %||% ""
    sid <- input$student_filter %||% ""
    if (nzchar(lid)) df <- df |> filter(lecture_id == lid)
    if (nzchar(sid)) df <- df |> filter(student_id == sid)
    df
  })

  # Populate sidebar pickers
  observe({
    df  <- all_data_r()
    dir <- students_r()

    lids <- sort(unique(na.omit(as.character(df$lecture_id))))
    updateSelectizeInput(session, "lecture_pick",
                         choices  = c("All lectures" = "", stats::setNames(lids, lids)),
                         server   = TRUE)

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
                         choices = c("All students" = "", choices),
                         server  = TRUE)
    updateSelectizeInput(session, "lec_detail_pick",
                         choices = stats::setNames(
                           sort(unique(na.omit(as.character(df$lecture_id)))),
                           sort(unique(na.omit(as.character(df$lecture_id))))
                         ),
                         server = TRUE)
  })

  # Per-lecture detail reactive
  lec_detail_r <- reactive({
    req(nzchar(input$lec_detail_pick %||% ""))
    all_data_r() |> filter(lecture_id == input$lec_detail_pick)
  })

  # ── Overview KPIs ──────────────────────────────────────────────────────────
  output$dr_students <- renderValueBox({
    valueBox(length(unique(filtered_r()$student_id)),
             "Students", icon = icon("users"), color = "blue")
  })
  output$dr_lectures <- renderValueBox({
    valueBox(length(unique(filtered_r()$lecture_id)),
             "Lectures", icon = icon("chalkboard"), color = "purple")
  })
  output$dr_engagement <- renderValueBox({
    e <- mean(filtered_r()$engagement_score, na.rm = TRUE)
    if (!is.finite(e)) e <- 0
    valueBox(sprintf("%.2f", e), "Avg engagement", icon = icon("bolt"),
             color = if (e >= 0.5) "green" else if (e >= 0.3) "yellow" else "red")
  })
  output$dr_warnings <- renderValueBox({
    n <- sum(suppressWarnings(as.logical(filtered_r()$attention_warning %||% FALSE)) == TRUE, na.rm = TRUE)
    valueBox(n, "Attention warnings", icon = icon("triangle-exclamation"),
             color = if (n == 0) "green" else "orange")
  })

  # ── Overview charts ────────────────────────────────────────────────────────
  output$dr_lecture_trend <- renderPlotly({
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

  output$dr_emotion_pie <- renderPlotly({
    df <- filtered_r() |> count(emotion, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "emotion", "n")
  })

  # ── Doctor Dashboard ───────────────────────────────────────────────────────
  output$dr_student_eng_bar <- renderPlotly({
    df <- filtered_r()
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> group_by(student_id) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE), .groups = "drop") |>
      arrange(desc(eng))
    plot_ly(b, x = ~student_id, y = ~eng, type = "bar",
            marker = list(color = PALETTE$primary2, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Student", tickangle = -30),
                     yaxis = list(title = "Avg engagement", range = c(0, 1))) |>
      style_plotly()
  })

  output$dr_top_students <- renderDT({
    df <- filtered_r()
    if (nrow(df) == 0) return(datatable(data.frame(Message = "No data.")))
    top <- df |> group_by(student_id) |>
      summarise(avg_eng = round(mean(engagement_score, na.rm = TRUE), 3),
                lectures = n_distinct(lecture_id), .groups = "drop") |>
      arrange(desc(avg_eng)) |> head(10)
    datatable(top, rownames = FALSE,
              options = list(dom = "t", paging = FALSE))
  })

  output$dr_eng_heat <- renderPlotly({
    df <- filtered_r()
    if (nrow(df) == 0) return(plotly_empty())
    mat <- df |> group_by(student_id, lecture_id) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE), .groups = "drop") |>
      pivot_wider(names_from = lecture_id, values_from = eng, values_fill = NA)
    sids <- mat$student_id
    vals <- as.matrix(mat[, -1, drop = FALSE])
    plot_ly(x = colnames(vals), y = sids, z = vals, type = "heatmap",
            colorscale = "RdYlGn", zmin = 0, zmax = 1) |>
      plotly::layout(xaxis = list(title = "Lecture"),
                     yaxis = list(title = "Student")) |>
      style_plotly()
  })

  # ── Live Classroom ─────────────────────────────────────────────────────────
  latest_lec_r <- reactive({
    df <- all_data_r()
    if (nrow(df) == 0) return(character(0))
    df |> filter(!is.na(timestamp)) |>
      group_by(lecture_id) |>
      summarise(last = max(timestamp, na.rm = TRUE), .groups = "drop") |>
      slice_max(last, n = 1) |> pull(lecture_id)
  })

  live_df_r <- reactive({
    lid <- latest_lec_r()
    if (length(lid) == 0) return(dplyr::tibble())
    all_data_r() |> filter(lecture_id == lid)
  })

  output$live_active <- renderValueBox({
    valueBox(length(unique(live_df_r()$student_id)),
             "Active students", icon = icon("users"), color = "blue")
  })
  output$live_eng <- renderValueBox({
    e <- mean(live_df_r()$engagement_score, na.rm = TRUE)
    if (!is.finite(e)) e <- 0
    valueBox(sprintf("%.2f", e), "Live engagement", icon = icon("bolt"),
             color = if (e >= 0.5) "green" else if (e >= 0.3) "yellow" else "red")
  })
  output$live_attn <- renderValueBox({
    a <- mean(suppressWarnings(as.numeric(live_df_r()$attention_score)), na.rm = TRUE)
    if (!is.finite(a)) a <- 0
    valueBox(sprintf("%.1f", a), "Live attention", icon = icon("eye"),
             color = if (a >= 70) "green" else if (a >= 50) "yellow" else "red")
  })
  output$live_cheat <- renderValueBox({
    n <- sum(suppressWarnings(as.logical(live_df_r()$cheat_warning %||% FALSE)) == TRUE, na.rm = TRUE)
    valueBox(n, "Integrity flags", icon = icon("triangle-exclamation"),
             color = if (n == 0) "green" else "red")
  })

  output$live_emotion_pie <- renderPlotly({
    df <- live_df_r() |> count(emotion, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "emotion", "n")
  })

  output$live_eng_line <- renderPlotly({
    df <- live_df_r() |> filter(!is.na(timestamp)) |> arrange(timestamp)
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> group_by(timestamp) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE), .groups = "drop")
    plot_ly(b, x = ~timestamp, y = ~eng, type = "scatter", mode = "lines",
            line = list(color = PALETTE$primary, width = 2)) |>
      plotly::layout(yaxis = list(title = "Engagement", range = c(0, 1))) |>
      style_plotly()
  })

  output$live_student_table <- renderDT({
    df <- live_df_r()
    if (nrow(df) == 0) return(datatable(data.frame(Message = "No live data.")))
    snap <- df |> group_by(student_id) |>
      slice_max(timestamp, n = 1, with_ties = FALSE) |>
      ungroup() |>
      select(any_of(c("student_id","emotion","state","engagement_score","attention_score","timestamp")))
    datatable(snap, rownames = FALSE, class = "stripe hover row-border",
              options = list(pageLength = 20, dom = "lftipr"))
  })

  # ── Distributions ─────────────────────────────────────────────────────────
  output$dist_eng_hist <- renderPlotly({
    df <- filtered_r()
    if (nrow(df) == 0) return(plotly_empty())
    plot_ly(x = df$engagement_score[!is.na(df$engagement_score)], type = "histogram",
            marker = list(color = PALETTE$primary, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Engagement score"),
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
      plotly::layout(xaxis = list(title = "Attention score"),
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
            marker = list(size = 5, opacity = 0.5)) |>
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

  # ── Per-Lecture detail ─────────────────────────────────────────────────────
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
    plot_ly(emo_counts, x = ~lecture_id, y = ~n, color = ~emotion,
            type = "bar") |>
      plotly::layout(barmode = "stack",
                     xaxis = list(title = "Lecture", tickangle = -30),
                     yaxis = list(title = "Count")) |>
      style_plotly()
  })

  # ── Student search ─────────────────────────────────────────────────────────
  output$stud_directory_table <- renderDT({
    dir <- students_r()
    q   <- trimws(input$stud_search_q %||% "")
    if (nrow(dir) == 0) return(datatable(data.frame(Message = "No students found.")))
    if (nzchar(q)) {
      hay <- paste(
        as.character(dir$name       %||% ""),
        as.character(dir$student_id %||% dir$id %||% ""),
        as.character(dir$email      %||% "")
      )
      dir <- dir[grepl(q, hay, ignore.case = TRUE, perl = TRUE), , drop = FALSE]
    }
    cols <- intersect(c("name","student_id","email","active"), names(dir))
    datatable(dir[, cols, drop = FALSE], rownames = FALSE,
              class = "stripe hover row-border",
              options = list(pageLength = 15, dom = "lftipr",
                             language = list(search = "", searchPlaceholder = "Search…")))
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

  output$stud_emo_pie <- renderPlotly({
    df <- filtered_r() |> count(emotion, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "emotion", "n")
  })

  # ── Grades ─────────────────────────────────────────────────────────────────
  output$grd_avg_mark <- renderValueBox({
    g <- grades_all_r()
    m <- if (nrow(g) > 0) mean(suppressWarnings(as.numeric(g$mark)), na.rm = TRUE) else NA_real_
    valueBox(if (is.finite(m)) sprintf("%.1f", m) else "—",
             "Class avg mark", icon = icon("chart-line"),
             color = if (!is.finite(m)) "blue" else if (m >= 70) "green" else if (m >= 50) "yellow" else "red")
  })
  output$grd_pass_rate <- renderValueBox({
    g <- grades_all_r()
    if (nrow(g) == 0) return(valueBox("—", "Pass rate", icon = icon("percent"), color = "blue"))
    marks <- suppressWarnings(as.numeric(g$mark))
    rate  <- mean(marks >= 50, na.rm = TRUE)
    valueBox(if (is.finite(rate)) sprintf("%.0f%%", rate * 100) else "—",
             "Pass rate", icon = icon("percent"),
             color = if (!is.finite(rate)) "blue" else if (rate >= 0.7) "green" else "red")
  })
  output$grd_students <- renderValueBox({
    g <- grades_all_r()
    n <- if (nrow(g) > 0) n_distinct(g$student_id) else 0
    valueBox(n, "Students graded", icon = icon("user-check"), color = "purple")
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
                             language = list(search = "", searchPlaceholder = "Search…")))
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
                     yaxis = list(title = "Students attended")) |>
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
              options = list(pageLength = 20, dom = "lftipr"))
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
      plotly::layout(xaxis = list(title = "Attention score"),
                     yaxis = list(title = "Observations")) |>
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

  output$cheat_flags <- renderValueBox({
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

  output$cheat_table <- renderDT({
    df <- cheat_df_r()
    if (nrow(df) == 0) {
      return(datatable(data.frame(Message = "No integrity flags detected."),
                       rownames = FALSE, options = list(dom = "t", paging = FALSE)))
    }
    cols <- intersect(c("timestamp","student_id","lecture_id","gesture","cheat_score","emotion"), names(df))
    datatable(df[, cols, drop = FALSE], rownames = FALSE,
              class = "stripe hover row-border",
              options = list(pageLength = 20, dom = "lftipr"))
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
      return(div(class = "rec-card good", "All students are performing well."))
    }
    tagList(
      p(style = "color:#94a3b8;font-size:12px;", sprintf("%d student(s) need attention:", nrow(df))),
      lapply(seq_len(min(nrow(df), 5)), function(i) {
        cls <- if (df$eng[i] < 0.25 || df$attn[i] < 35) "danger" else "warn"
        div(class = paste("rec-card", cls),
            strong(df$student_id[i]), " — ",
            sprintf("Engagement %.2f, Attention %.0f", df$eng[i], df$attn[i]))
      })
    )
  })
}

shinyApp(ui, server)
