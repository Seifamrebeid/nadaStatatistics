user_lib <- file.path(Sys.getenv("LOCALAPPDATA"), "R", "win-library", "4.5")
if (dir.exists(user_lib) && !(user_lib %in% .libPaths())) .libPaths(c(user_lib, .libPaths()))

suppressPackageStartupMessages({
  library(shiny); library(shinydashboard); library(dplyr)
  library(ggplot2); library(plotly); library(DT); library(lubridate)
})

source("../../load_data.R")
source("../shared/theme.R")
source("../shared/helpers.R")

# ── UI ────────────────────────────────────────────────────────────────────────
ui <- dashboardPage(
  skin = "blue",
  dashboardHeader(
    title = tags$span(
      tags$span(style = "font-weight:800;letter-spacing:-0.03em;", "Student"),
      tags$span(style = "font-weight:400;opacity:0.55;margin-left:4px;", "Dashboard")
    ),
    titleWidth = 260
  ),
  dashboardSidebar(
    width = 260,
    sidebarMenu(
      tags$li(class = "header", "Navigation"),
      menuItem("Overview",          tabName = "overview",      icon = icon("gauge-high"),    class = "sec-analytics"),
      menuItem("My Performance",    tabName = "student_view",  icon = icon("user-graduate"), class = "sec-analytics"),
      menuItem("Emotion Analysis",  tabName = "emotion_dist",  icon = icon("face-smile"),    class = "sec-analytics"),
      menuItem("Per-Lecture",       tabName = "per_lecture",   icon = icon("chalkboard"),    class = "sec-data"),
      menuItem("Doctor Search",     tabName = "doc_search",    icon = icon("user-doctor"),   class = "sec-data"),
      menuItem("Grades",            tabName = "grades",        icon = icon("award"),         class = "sec-data"),
      menuItem("Attention Analysis",tabName = "attention",     icon = icon("eye"),           class = "sec-insights"),
      menuItem("Recommendations",   tabName = "recs",          icon = icon("lightbulb"),     class = "sec-insights")
    ),
    tags$hr(),
    div(style = "padding: 0 10px;",
      selectizeInput("student_pick", "Select student", choices = NULL,
                     options = list(placeholder = "Choose student…"))
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
              div(class = "page-hero__eyebrow", icon("user-graduate"), "Student Portal"),
              div(class = "page-hero__title", "My Classroom Analytics"),
              p(class = "page-hero__text",
                "Track your engagement, attention, emotions, and grades across all lectures."),
              div(class = "page-hero__meta",
                span(class = "page-hero__pill", icon("bolt"),      "Engagement tracking"),
                span(class = "page-hero__pill", icon("eye"),       "Attention analysis"),
                span(class = "page-hero__pill", icon("award"),     "Grade overview")
              )
            )
          )
        ),
        fluidRow(
          valueBoxOutput("sv_lectures",   width = 3),
          valueBoxOutput("sv_engagement", width = 3),
          valueBoxOutput("sv_attention",  width = 3),
          valueBoxOutput("sv_warnings",   width = 3)
        ),
        fluidRow(
          box(title = "Engagement per lecture", width = 7,
              plotlyOutput("sv_lecture_trend", height = 300)),
          box(title = "Emotion mix", width = 5,
              plotlyOutput("sv_emotion_pie", height = 300))
        )
      ),

      # ── Student View ─────────────────────────────────────────────────────────
      tabItem(tabName = "student_view",
        h1("My Performance", tags$small("engagement and attention across lectures")),
        fluidRow(
          box(title = "Engagement per lecture", width = 8,
              plotlyOutput("sv2_lecture_trend", height = 320)),
          box(title = "Recommendation", width = 4,
              uiOutput("sv_recommendation"))
        ),
        fluidRow(
          box(title = "Emotion distribution", width = 6,
              plotlyOutput("sv2_emotion_pie", height = 300)),
          box(title = "State breakdown", width = 6,
              plotlyOutput("sv2_state_pie", height = 300))
        )
      ),

      # ── Emotion distribution ──────────────────────────────────────────────────
      tabItem(tabName = "emotion_dist",
        h1("Emotion Analysis", tags$small("how my emotions vary across lectures")),
        fluidRow(
          box(title = "Emotion distribution (all lectures)", width = 6,
              plotlyOutput("sv_emotion_bar", height = 350)),
          box(title = "Emotion over time", width = 6,
              plotlyOutput("sv_emotion_line", height = 350))
        ),
        fluidRow(
          box(title = "Emotion heatmap by lecture", width = 12,
              plotlyOutput("sv_emotion_heat", height = 350))
        )
      ),

      # ── Per-lecture ───────────────────────────────────────────────────────────
      tabItem(tabName = "per_lecture",
        h1("Per-Lecture Breakdown", tags$small("select a lecture for detailed stats")),
        fluidRow(
          column(4,
            box(title = "Lecture picker", width = 12,
              selectizeInput("sv_lecture_pick", "Lecture", choices = NULL,
                             options = list(placeholder = "Choose lecture…")),
              uiOutput("sv_lecture_stats")
            )
          ),
          column(8,
            box(title = "Engagement over time (selected lecture)", width = 12,
                plotlyOutput("sv_lec_eng_line", height = 300))
          )
        ),
        fluidRow(
          box(title = "Emotion breakdown (selected lecture)", width = 6,
              plotlyOutput("sv_lec_emotion_pie", height = 300)),
          box(title = "Gesture breakdown (selected lecture)", width = 6,
              plotlyOutput("sv_lec_gesture_pie", height = 300))
        )
      ),

      # ── Doctor search ─────────────────────────────────────────────────────────
      tabItem(tabName = "doc_search",
        h1("Doctor Search", tags$small("find lecturer contact and department info")),
        fluidRow(
          box(title = "Search doctors", width = 12,
            fluidRow(
              column(6,
                textInput("doc_search_q", "Search by name or department", placeholder = "e.g. Smith or Computer Science")
              )
            ),
            DTOutput("sv_doctors_table")
          )
        )
      ),

      # ── Grades ───────────────────────────────────────────────────────────────
      tabItem(tabName = "grades",
        h1("Grades", tags$small("marks and letter grades per subject")),
        fluidRow(
          valueBoxOutput("sv_avg_mark",   width = 4),
          valueBoxOutput("sv_best_grade", width = 4),
          valueBoxOutput("sv_subjects",   width = 4)
        ),
        fluidRow(
          box(title = "Gradebook", width = 8,
              DTOutput("sv_grades_table")),
          box(title = "Grade distribution", width = 4,
              plotlyOutput("sv_grade_pie", height = 300))
        )
      ),

      # ── Attention analysis ────────────────────────────────────────────────────
      tabItem(tabName = "attention",
        h1("Attention Analysis", tags$small("how my focus changes across sessions")),
        fluidRow(
          box(title = "Attention per lecture", width = 8,
              plotlyOutput("sv_attn_bar", height = 300)),
          box(title = "Attention distribution", width = 4,
              plotlyOutput("sv_attn_hist", height = 300))
        ),
        fluidRow(
          box(title = "Attention vs engagement scatter", width = 12,
              plotlyOutput("sv_attn_scatter", height = 350))
        )
      ),

      # ── Recommendations ───────────────────────────────────────────────────────
      tabItem(tabName = "recs",
        h1("Recommendations", tags$small("personalised suggestions based on your data")),
        fluidRow(
          box(title = "Performance trend", width = 8,
              plotlyOutput("sv_recs_trend", height = 300)),
          box(title = "Suggestions", width = 4,
              uiOutput("sv_recs_panel"))
        ),
        fluidRow(
          box(title = "Cheating / integrity warnings", width = 12,
              DTOutput("sv_cheat_table"))
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

  # Populate student picker
  observe({
    dir <- students_r()
    df  <- all_data_r()
    if (nrow(dir) > 0 && length(intersect(c("id","student_id"), names(dir))) > 0) {
      raw  <- if ("id" %in% names(dir)) dir$id else dir$student_id
      sid  <- na.omit(as.character(raw))
      nm   <- na.omit(as.character(dir$name %||% sid))
      if (length(nm) != length(sid)) nm <- sid
      choices <- if (length(sid) > 0) stats::setNames(sid, nm) else character(0)
    } else if (nrow(df) > 0) {
      sid <- sort(na.omit(unique(as.character(df$student_id))))
      choices <- stats::setNames(sid, sid)
    } else {
      choices <- character(0)
    }
    updateSelectizeInput(session, "student_pick",
                         choices  = c("Select student" = "", choices),
                         selected = if (length(choices) > 0) choices[[1]] else "",
                         server   = TRUE)
  })

  # Filtered data for selected student
  student_df_r <- reactive({
    req(nzchar(input$student_pick %||% ""))
    all_data_r() |> filter(student_id == input$student_pick)
  })

  grades_r <- reactive({
    req(nzchar(input$student_pick %||% ""))
    g <- grades_all_r()
    if (nrow(g) == 0) return(dplyr::tibble())
    g |> filter(student_id == input$student_pick)
  })

  # Populate lecture picker (per-lecture tab)
  observe({
    df <- student_df_r()
    lids <- sort(unique(as.character(df$lecture_id)))
    updateSelectizeInput(session, "sv_lecture_pick",
                         choices  = stats::setNames(lids, lids),
                         server   = TRUE)
  })

  lecture_df_r <- reactive({
    req(nzchar(input$sv_lecture_pick %||% ""))
    student_df_r() |> filter(lecture_id == input$sv_lecture_pick)
  })

  # ── KPI boxes ──────────────────────────────────────────────────────────────
  output$sv_lectures <- renderValueBox({
    valueBox(length(unique(student_df_r()$lecture_id)),
             "Lectures attended", icon = icon("chalkboard"), color = "purple")
  })
  output$sv_engagement <- renderValueBox({
    e <- mean(student_df_r()$engagement_score, na.rm = TRUE)
    if (!is.finite(e)) e <- 0
    valueBox(sprintf("%.2f", e), "Avg engagement", icon = icon("bolt"),
             color = if (e >= 0.5) "green" else if (e >= 0.3) "yellow" else "red")
  })
  output$sv_attention <- renderValueBox({
    a <- mean(suppressWarnings(as.numeric(student_df_r()$attention_score)), na.rm = TRUE)
    if (!is.finite(a)) a <- 0
    valueBox(sprintf("%.1f", a), "Avg attention", icon = icon("eye"),
             color = if (a >= 70) "green" else if (a >= 50) "yellow" else "red")
  })
  output$sv_warnings <- renderValueBox({
    n <- sum(suppressWarnings(as.logical(student_df_r()$attention_warning %||% FALSE)) == TRUE, na.rm = TRUE)
    valueBox(n, "Attention warnings", icon = icon("triangle-exclamation"),
             color = if (n == 0) "green" else "red")
  })

  # ── Lecture trend bar ──────────────────────────────────────────────────────
  .lecture_bar <- function(df) {
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> group_by(lecture_id) |>
      summarise(engagement = mean(engagement_score, na.rm = TRUE), .groups = "drop")
    plot_ly(b, x = ~lecture_id, y = ~engagement, type = "bar",
            marker = list(color = PALETTE$primary, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Lecture", tickangle = -30),
                     yaxis = list(title = "Avg engagement", range = c(0, 1))) |>
      style_plotly()
  }

  output$sv_lecture_trend  <- renderPlotly({ .lecture_bar(student_df_r()) })
  output$sv2_lecture_trend <- renderPlotly({ .lecture_bar(student_df_r()) })

  # ── Emotion pies ───────────────────────────────────────────────────────────
  output$sv_emotion_pie <- renderPlotly({
    df <- student_df_r() |> count(emotion, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "emotion", "n")
  })
  output$sv2_emotion_pie <- renderPlotly({
    df <- student_df_r() |> count(emotion, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "emotion", "n")
  })
  output$sv2_state_pie <- renderPlotly({
    df <- student_df_r() |> count(state, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "state", "n",
         palette = c("awake" = PALETTE$good, "sleeping" = PALETTE$bad))
  })

  # ── Emotion distribution tab ───────────────────────────────────────────────
  output$sv_emotion_bar <- renderPlotly({
    df <- student_df_r() |> count(emotion, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    plot_ly(df, x = ~emotion, y = ~n, type = "bar",
            marker = list(color = PALETTE$accent, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Emotion"),
                     yaxis = list(title = "Count")) |>
      style_plotly()
  })

  output$sv_emotion_line <- renderPlotly({
    df <- student_df_r()
    if (nrow(df) == 0) return(plotly_empty())
    ts <- df |> filter(!is.na(timestamp)) |>
      mutate(hour = lubridate::floor_date(timestamp, "hour")) |>
      count(hour, emotion)
    plot_ly(ts, x = ~hour, y = ~n, color = ~emotion, type = "scatter", mode = "lines") |>
      plotly::layout(xaxis = list(title = "Time"),
                     yaxis = list(title = "Count")) |>
      style_plotly()
  })

  output$sv_emotion_heat <- renderPlotly({
    df <- student_df_r()
    if (nrow(df) == 0) return(plotly_empty())
    mat <- df |> count(lecture_id, emotion) |>
      tidyr::pivot_wider(names_from = emotion, values_from = n, values_fill = 0)
    lids <- mat$lecture_id
    vals <- as.matrix(mat[, -1, drop = FALSE])
    plot_ly(x = colnames(vals), y = lids, z = vals, type = "heatmap",
            colorscale = "Blues") |>
      plotly::layout(xaxis = list(title = "Emotion"),
                     yaxis = list(title = "Lecture")) |>
      style_plotly()
  })

  # ── Per-lecture detail ─────────────────────────────────────────────────────
  output$sv_lecture_stats <- renderUI({
    df <- lecture_df_r()
    if (nrow(df) == 0) return(p("No data for this lecture."))
    e <- mean(df$engagement_score, na.rm = TRUE)
    a <- mean(suppressWarnings(as.numeric(df$attention_score)), na.rm = TRUE)
    tagList(
      div(style = "margin-top:10px;",
        div(style = "font-size:12px;color:#94a3b8;", "Avg engagement"),
        div(style = "font-size:22px;font-weight:700;color:#6366f1;",
            if (is.finite(e)) sprintf("%.2f", e) else "—")
      ),
      div(style = "margin-top:10px;",
        div(style = "font-size:12px;color:#94a3b8;", "Avg attention"),
        div(style = "font-size:22px;font-weight:700;color:#06b6d4;",
            if (is.finite(a)) sprintf("%.1f", a) else "—")
      ),
      div(style = "margin-top:10px;",
        div(style = "font-size:12px;color:#94a3b8;", "Observations"),
        div(style = "font-size:22px;font-weight:700;", nrow(df))
      )
    )
  })

  output$sv_lec_eng_line <- renderPlotly({
    df <- lecture_df_r()
    if (nrow(df) == 0) return(plotly_empty())
    df2 <- df |> filter(!is.na(timestamp)) |> arrange(timestamp)
    plot_ly(df2, x = ~timestamp, y = ~engagement_score, type = "scatter", mode = "lines+markers",
            line = list(color = PALETTE$primary, width = 2),
            marker = list(color = PALETTE$primary, size = 4)) |>
      plotly::layout(xaxis = list(title = "Time"),
                     yaxis = list(title = "Engagement", range = c(0, 1))) |>
      style_plotly()
  })

  output$sv_lec_emotion_pie <- renderPlotly({
    df <- lecture_df_r() |> count(emotion, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "emotion", "n")
  })

  output$sv_lec_gesture_pie <- renderPlotly({
    df <- lecture_df_r() |>
      filter(!is.na(gesture) & gesture != "none") |>
      count(gesture, sort = TRUE)
    if (nrow(df) == 0) {
      df <- lecture_df_r() |> count(gesture, sort = TRUE)
    }
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "gesture", "n")
  })

  # ── Doctor search ──────────────────────────────────────────────────────────
  output$sv_doctors_table <- renderDT({
    drs <- doctors_r()
    q   <- trimws(input$doc_search_q %||% "")
    if (nrow(drs) == 0) {
      return(datatable(data.frame(Message = "No doctors found."),
                       rownames = FALSE, options = list(dom = "t", paging = FALSE)))
    }
    if (nzchar(q)) {
      hay <- paste(
        as.character(drs$name        %||% ""),
        as.character(drs$department  %||% ""),
        as.character(drs$email       %||% ""),
        as.character(drs$doctor_id   %||% drs$id %||% "")
      )
      drs <- drs[grepl(q, hay, ignore.case = TRUE, perl = TRUE), , drop = FALSE]
    }
    cols <- intersect(c("name","department","email","doctor_id"), names(drs))
    if (length(cols) == 0) cols <- names(drs)
    datatable(drs[, cols, drop = FALSE], rownames = FALSE,
              class = "stripe hover row-border",
              options = list(pageLength = 15, dom = "lftipr",
                             language = list(search = "", searchPlaceholder = "Search…")))
  })

  # ── Grades ─────────────────────────────────────────────────────────────────
  output$sv_avg_mark <- renderValueBox({
    g <- grades_r()
    m <- if (nrow(g) > 0) mean(suppressWarnings(as.numeric(g$mark)), na.rm = TRUE) else NA_real_
    valueBox(if (is.finite(m)) sprintf("%.1f", m) else "—",
             "Avg mark", icon = icon("chart-line"),
             color = if (!is.finite(m)) "blue" else if (m >= 70) "green" else if (m >= 50) "yellow" else "red")
  })
  output$sv_best_grade <- renderValueBox({
    g <- grades_r()
    best <- if (nrow(g) > 0 && "grade" %in% names(g)) {
      gg <- na.omit(g$grade)
      if (length(gg)) gg[1] else "—"
    } else "—"
    valueBox(best, "Best grade", icon = icon("trophy"), color = "yellow")
  })
  output$sv_subjects <- renderValueBox({
    g <- grades_r()
    n <- if (nrow(g) > 0) length(unique(na.omit(g$subject_id))) else 0
    valueBox(n, "Subjects", icon = icon("book"), color = "purple")
  })

  output$sv_grades_table <- renderDT({
    g <- grades_r()
    if (nrow(g) == 0) {
      return(datatable(data.frame(Message = "No grades found."),
                       rownames = FALSE, options = list(dom = "t", paging = FALSE)))
    }
    cols <- intersect(c("subject_name","subject_code","doctor_name","mark","grade","observations"), names(g))
    datatable(g[, cols, drop = FALSE], rownames = FALSE,
              class = "stripe hover row-border",
              options = list(pageLength = 20, dom = "lftipr",
                             language = list(search = "", searchPlaceholder = "Search…")))
  })

  output$sv_grade_pie <- renderPlotly({
    g <- grades_r()
    if (nrow(g) == 0 || !"grade" %in% names(g)) return(plotly_empty())
    df <- g |> count(grade, sort = TRUE)
    .pie(df, "grade", "n")
  })

  # ── Attention analysis ─────────────────────────────────────────────────────
  output$sv_attn_bar <- renderPlotly({
    df <- student_df_r()
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> group_by(lecture_id) |>
      summarise(attn = mean(suppressWarnings(as.numeric(attention_score)), na.rm = TRUE),
                .groups = "drop")
    plot_ly(b, x = ~lecture_id, y = ~attn, type = "bar",
            marker = list(color = PALETTE$accent, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Lecture", tickangle = -30),
                     yaxis = list(title = "Avg attention")) |>
      style_plotly()
  })

  output$sv_attn_hist <- renderPlotly({
    df <- student_df_r()
    if (nrow(df) == 0) return(plotly_empty())
    attn <- suppressWarnings(as.numeric(df$attention_score))
    plot_ly(x = attn[!is.na(attn)], type = "histogram",
            marker = list(color = PALETTE$primary2, line = list(width = 0))) |>
      plotly::layout(xaxis = list(title = "Attention score"),
                     yaxis = list(title = "Count")) |>
      style_plotly()
  })

  output$sv_attn_scatter <- renderPlotly({
    df <- student_df_r()
    if (nrow(df) == 0) return(plotly_empty())
    df2 <- df |>
      mutate(attn = suppressWarnings(as.numeric(attention_score))) |>
      filter(!is.na(attn) & !is.na(engagement_score))
    if (nrow(df2) == 0) return(plotly_empty())
    plot_ly(df2, x = ~engagement_score, y = ~attn, color = ~emotion,
            type = "scatter", mode = "markers",
            marker = list(size = 6, opacity = 0.6)) |>
      plotly::layout(xaxis = list(title = "Engagement score"),
                     yaxis = list(title = "Attention score")) |>
      style_plotly()
  })

  # ── Recommendations ────────────────────────────────────────────────────────
  output$sv_recs_trend <- renderPlotly({
    df <- student_df_r()
    if (nrow(df) == 0) return(plotly_empty())
    b <- df |> group_by(lecture_id) |>
      summarise(eng = mean(engagement_score, na.rm = TRUE),
                attn = mean(suppressWarnings(as.numeric(attention_score)), na.rm = TRUE),
                .groups = "drop")
    plot_ly(b) |>
      add_bars(x = ~lecture_id, y = ~eng,  name = "Engagement",
               marker = list(color = PALETTE$primary)) |>
      add_lines(x = ~lecture_id, y = ~attn / 100, name = "Attention (scaled)",
                line = list(color = PALETTE$accent, width = 2)) |>
      plotly::layout(xaxis = list(title = "Lecture", tickangle = -30),
                     yaxis = list(title = "Score", range = c(0, 1))) |>
      style_plotly()
  })

  .recs_ui <- function(attention, mark, grade, att_rate) {
    recs <- recommendation_text_r(attention, mark, grade, att_rate)
    tagList(lapply(recs, function(r) {
      cls <- if (!is.finite(attention %||% NaN)) "" else if (attention < 45) "danger" else if (attention < 70) "warn" else "good"
      div(class = paste("rec-card", cls), r)
    }))
  }

  output$sv_recs_panel <- renderUI({
    df   <- student_df_r()
    g    <- grades_r()
    att  <- mean(suppressWarnings(as.numeric(df$attention_score)), na.rm = TRUE)
    mark <- if (nrow(g) > 0) mean(suppressWarnings(as.numeric(g$mark)), na.rm = TRUE) else NA_real_
    grade <- if (nrow(g) > 0 && "grade" %in% names(g)) as.character(g$grade[[1]]) else NA_character_
    total <- length(unique(all_data_r()$lecture_id))
    rate  <- if (total > 0) length(unique(df$lecture_id)) / total else NA_real_
    .recs_ui(att, mark, grade, rate)
  })

  output$sv_recommendation <- renderUI({
    df   <- student_df_r()
    g    <- grades_r()
    att  <- mean(suppressWarnings(as.numeric(df$attention_score)), na.rm = TRUE)
    mark <- if (nrow(g) > 0) mean(suppressWarnings(as.numeric(g$mark)), na.rm = TRUE) else NA_real_
    grade <- if (nrow(g) > 0 && "grade" %in% names(g)) as.character(g$grade[[1]]) else NA_character_
    total <- length(unique(all_data_r()$lecture_id))
    rate  <- if (total > 0) length(unique(df$lecture_id)) / total else NA_real_
    .recs_ui(att, mark, grade, rate)
  })

  # ── Cheating / integrity warnings ─────────────────────────────────────────
  output$sv_cheat_table <- renderDT({
    df <- student_df_r()
    if (nrow(df) == 0 || !"cheat_warning" %in% names(df)) {
      return(datatable(data.frame(Message = "No integrity warnings."),
                       rownames = FALSE, options = list(dom = "t", paging = FALSE)))
    }
    flags <- df |> filter(cheat_warning == TRUE)
    if (nrow(flags) == 0) {
      return(datatable(data.frame(Message = "No integrity warnings detected."),
                       rownames = FALSE, options = list(dom = "t", paging = FALSE)))
    }
    cols <- intersect(c("timestamp","lecture_id","emotion","gesture","cheat_score"), names(flags))
    datatable(flags[, cols, drop = FALSE], rownames = FALSE,
              class = "stripe hover row-border",
              options = list(pageLength = 15, dom = "lftipr"))
  })
}

shinyApp(ui, server)
