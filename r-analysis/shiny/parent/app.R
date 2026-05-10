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
      tags$span(style = "font-weight:800;letter-spacing:-0.03em;", "Parent"),
      tags$span(style = "font-weight:400;opacity:0.55;margin-left:4px;", "Dashboard")
    ),
    titleWidth = 260
  ),
  dashboardSidebar(
    width = 260,
    sidebarMenu(
      tags$li(class = "header", "Navigation"),
      menuItem("Overview",       tabName = "overview",     icon = icon("gauge-high"),    class = "sec-analytics"),
      menuItem("Child View",     tabName = "parent_view",  icon = icon("house-user"),    class = "sec-analytics"),
      menuItem("Grades",         tabName = "grades",       icon = icon("award"),         class = "sec-data"),
      menuItem("Recommendations",tabName = "recs",         icon = icon("lightbulb"),     class = "sec-insights")
    ),
    tags$hr(),
    div(style = "padding: 0 10px;",
      selectizeInput("child_pick", "Select child", choices = NULL,
                     options = list(placeholder = "Choose child…"))
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
              div(class = "page-hero__eyebrow", icon("house-user"), "Parent Portal"),
              div(class = "page-hero__title", "Your Child's Progress"),
              p(class = "page-hero__text",
                "Monitor your child's engagement, attention, and grades across all lectures."),
              div(class = "page-hero__meta",
                span(class = "page-hero__pill", icon("bolt"),       "Engagement tracking"),
                span(class = "page-hero__pill", icon("graduation-cap"), "Grade overview"),
                span(class = "page-hero__pill", icon("lightbulb"), "Recommendations")
              )
            )
          )
        ),
        fluidRow(
          valueBoxOutput("pv_lectures",   width = 3),
          valueBoxOutput("pv_engagement", width = 3),
          valueBoxOutput("pv_attention",  width = 3),
          valueBoxOutput("pv_warnings",   width = 3)
        ),
        fluidRow(
          box(title = "Engagement per lecture", width = 7,
              plotlyOutput("pv_lecture_trend", height = 300)),
          box(title = "Emotion mix", width = 5,
              plotlyOutput("pv_emotion_pie", height = 300))
        )
      ),

      # ── Parent / Child View ───────────────────────────────────────────────────
      tabItem(tabName = "parent_view",
        h1("Child View", tags$small("engagement and attendance for selected child")),
        fluidRow(
          box(title = "Engagement per lecture", width = 8,
              plotlyOutput("pv2_lecture_trend", height = 320)),
          box(title = "Recommendation", width = 4,
              uiOutput("pv_recommendation"))
        ),
        fluidRow(
          box(title = "Emotion distribution", width = 6,
              plotlyOutput("pv2_emotion_pie", height = 300)),
          box(title = "State breakdown", width = 6,
              plotlyOutput("pv2_state_pie", height = 300))
        )
      ),

      # ── Grades ───────────────────────────────────────────────────────────────
      tabItem(tabName = "grades",
        h1("Grades", tags$small("marks and letter grades for selected child")),
        fluidRow(box(title = "Gradebook", width = 12, DTOutput("pv_grades_table")))
      ),

      # ── Recommendations ───────────────────────────────────────────────────────
      tabItem(tabName = "recs",
        h1("Recommendations", tags$small("personalised suggestions for your child")),
        fluidRow(
          box(title = "Attention over lectures", width = 8,
              plotlyOutput("pv_attn_trend", height = 300)),
          box(title = "Suggestions", width = 4,
              uiOutput("pv_recs_panel"))
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

  # Populate child picker once on load
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
    updateSelectizeInput(session, "child_pick",
                         choices  = c("Select child" = "", choices),
                         selected = if (length(choices) > 0) choices[[1]] else "",
                         server   = TRUE)
  })

  child_df_r <- reactive({
    req(nzchar(input$child_pick %||% ""))
    all_data_r() |> filter(student_id == input$child_pick)
  })

  grades_r <- reactive({
    req(nzchar(input$child_pick %||% ""))
    g <- grades_all_r()
    if (nrow(g) == 0) return(dplyr::tibble())
    g |> filter(student_id == input$child_pick)
  })

  # ── KPI boxes ──────────────────────────────────────────────────────────────
  output$pv_lectures <- renderValueBox({
    valueBox(length(unique(child_df_r()$lecture_id)),
             "Lectures attended", icon = icon("chalkboard"), color = "purple")
  })
  output$pv_engagement <- renderValueBox({
    e <- mean(child_df_r()$engagement_score, na.rm = TRUE)
    if (!is.finite(e)) e <- 0
    valueBox(sprintf("%.2f", e), "Avg engagement", icon = icon("bolt"),
             color = if (e >= 0.5) "green" else if (e >= 0.3) "yellow" else "red")
  })
  output$pv_attention <- renderValueBox({
    a <- mean(suppressWarnings(as.numeric(child_df_r()$attention_score)), na.rm = TRUE)
    if (!is.finite(a)) a <- 0
    valueBox(sprintf("%.1f", a), "Avg attention", icon = icon("eye"),
             color = if (a >= 70) "green" else if (a >= 50) "yellow" else "red")
  })
  output$pv_warnings <- renderValueBox({
    n <- sum(suppressWarnings(as.logical(child_df_r()$attention_warning %||% FALSE)) == TRUE, na.rm = TRUE)
    valueBox(n, "Attention warnings", icon = icon("triangle-exclamation"),
             color = if (n == 0) "green" else "red")
  })

  # ── Charts ─────────────────────────────────────────────────────────────────
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

  output$pv_lecture_trend  <- renderPlotly({ .lecture_bar(child_df_r()) })
  output$pv2_lecture_trend <- renderPlotly({ .lecture_bar(child_df_r()) })

  output$pv_emotion_pie <- renderPlotly({
    df <- child_df_r() |> count(emotion, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "emotion", "n")
  })
  output$pv2_emotion_pie <- renderPlotly({
    df <- child_df_r() |> count(emotion, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "emotion", "n")
  })
  output$pv2_state_pie <- renderPlotly({
    df <- child_df_r() |> count(state, sort = TRUE)
    if (nrow(df) == 0) return(plotly_empty())
    .pie(df, "state", "n",
         palette = c("awake" = PALETTE$good, "sleeping" = PALETTE$bad))
  })

  output$pv_attn_trend <- renderPlotly({
    df <- child_df_r()
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

  # ── Recommendation ─────────────────────────────────────────────────────────
  .recs_ui <- function(attention, mark, grade, att_rate) {
    recs <- recommendation_text_r(attention, mark, grade, att_rate)
    tagList(lapply(recs, function(r) {
      cls <- if (!is.finite(attention %||% NaN)) "" else if (attention < 45) "danger" else if (attention < 70) "warn" else "good"
      div(class = paste("rec-card", cls), r)
    }))
  }

  output$pv_recommendation <- renderUI({
    df  <- child_df_r()
    g   <- grades_r()
    att <- mean(suppressWarnings(as.numeric(df$attention_score)), na.rm = TRUE)
    mark <- if (nrow(g) > 0) mean(suppressWarnings(as.numeric(g$mark)), na.rm = TRUE) else NA_real_
    grade <- if (nrow(g) > 0 && "grade" %in% names(g)) as.character(g$grade[[1]]) else NA_character_
    total <- length(unique(all_data_r()$lecture_id))
    rate  <- if (total > 0) length(unique(df$lecture_id)) / total else NA_real_
    .recs_ui(att, mark, grade, rate)
  })
  output$pv_recs_panel <- renderUI({
    df  <- child_df_r()
    g   <- grades_r()
    att <- mean(suppressWarnings(as.numeric(df$attention_score)), na.rm = TRUE)
    mark <- if (nrow(g) > 0) mean(suppressWarnings(as.numeric(g$mark)), na.rm = TRUE) else NA_real_
    grade <- if (nrow(g) > 0 && "grade" %in% names(g)) as.character(g$grade[[1]]) else NA_character_
    total <- length(unique(all_data_r()$lecture_id))
    rate  <- if (total > 0) length(unique(df$lecture_id)) / total else NA_real_
    .recs_ui(att, mark, grade, rate)
  })

  # ── Grades table ───────────────────────────────────────────────────────────
  output$pv_grades_table <- renderDT({
    g <- grades_r()
    if (nrow(g) == 0) {
      return(datatable(data.frame(Message = "No grades found."),
                       rownames = FALSE, options = list(dom = "t", paging = FALSE)))
    }
    cols <- intersect(c("subject_name","doctor_name","mark","grade","observations"), names(g))
    datatable(g[, cols, drop = FALSE], rownames = FALSE,
              class = "stripe hover row-border",
              options = list(pageLength = 20, dom = "lftipr",
                             language = list(search = "", searchPlaceholder = "Search…")))
  })
}

shinyApp(ui, server)
