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

# ============================================================ UI ============

ui <- dashboardPage(
  skin = "blue",
  dashboardHeader(title = "Classroom Emotions"),
  dashboardSidebar(
    sidebarMenu(
      menuItem("Overview",             tabName = "overview",     icon = icon("gauge")),
      menuItem("Emotion distribution", tabName = "emotion_dist", icon = icon("chart-bar")),
      menuItem("Per-lecture",          tabName = "per_lecture",  icon = icon("chalkboard")),
      menuItem("Engagement trends",    tabName = "trends",       icon = icon("chart-line")),
      menuItem("Lecturer clustering",  tabName = "cluster_doc",  icon = icon("user-tie")),
      menuItem("Student×Subject",      tabName = "cluster_ss",   icon = icon("users")),
      menuItem("Raw data",             tabName = "raw",          icon = icon("table"))
    ),
    hr(),
    actionButton("refresh", "↻ Refresh data", class = "btn-primary",
                 style = "margin-left: 15px;")
  ),
  dashboardBody(
    tabItems(
      # -- Overview --
      tabItem(tabName = "overview",
        fluidRow(
          valueBoxOutput("kpi_students", width = 3),
          valueBoxOutput("kpi_lectures", width = 3),
          valueBoxOutput("kpi_engagement", width = 3),
          valueBoxOutput("kpi_sleep_rate", width = 3)
        ),
        fluidRow(
          box(title = "Emotion mix", width = 6, plotlyOutput("overview_emotion")),
          box(title = "Gesture mix", width = 6, plotlyOutput("overview_gesture"))
        )
      ),
      # -- Emotion distribution --
      tabItem(tabName = "emotion_dist",
        fluidRow(box(title = "Emotion frequency (all observations)", width = 12,
                     plotlyOutput("plot_emotion_freq", height = 480)))
      ),
      # -- Per-lecture --
      tabItem(tabName = "per_lecture",
        fluidRow(
          box(width = 4, selectInput("lecture_pick", "Lecture:", choices = NULL)),
          valueBoxOutput("lec_engagement", width = 4),
          valueBoxOutput("lec_sleep", width = 4)
        ),
        fluidRow(box(title = "Emotion breakdown", width = 12,
                     plotlyOutput("plot_emotion_by_lecture", height = 420)))
      ),
      # -- Engagement trends --
      tabItem(tabName = "trends",
        fluidRow(box(title = "Engagement over time (30-sec buckets)",
                     width = 12, plotlyOutput("plot_trend", height = 480)))
      ),
      # -- Lecturer clustering --
      tabItem(tabName = "cluster_doc",
        fluidRow(box(title = "Lecturer clusters (k-means)",
                     width = 12, plotOutput("plot_cluster_doc", height = 520),
                     footer = "Needs ≥ 3 lecturers in the dataset. Shows a bar chart otherwise."))
      ),
      # -- Student × Subject clustering --
      tabItem(tabName = "cluster_ss",
        fluidRow(box(title = "Student × Subject clusters (k-means)",
                     width = 12, plotOutput("plot_cluster_ss", height = 520),
                     footer = "Needs ≥ 3 (student, lecture) pairs."))
      ),
      # -- Raw data --
      tabItem(tabName = "raw",
        fluidRow(box(title = "All observations — filter / sort / export",
                     width = 12, DTOutput("raw_table")))
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

  # Populate the lecture dropdown once data lands.
  observe({
    df <- data_r()
    updateSelectInput(session, "lecture_pick",
                      choices = sort(unique(df$lecture_id)),
                      selected = df$lecture_id[1])
  })

  # ---------- KPI boxes (Overview) ----------
  output$kpi_students <- renderValueBox({
    valueBox(length(unique(data_r()$student_id)), "students seen", icon = icon("user"))
  })
  output$kpi_lectures <- renderValueBox({
    valueBox(length(unique(data_r()$lecture_id)), "lectures recorded", icon = icon("chalkboard"))
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
            marker = list(color = "#2a7ae2")) |>
      layout(xaxis = list(title = ""), yaxis = list(title = "observations"))
  })
  output$overview_gesture <- renderPlotly({
    df <- data_r() |> count(gesture, sort = TRUE)
    plot_ly(df, x = ~reorder(gesture, -n), y = ~n, type = "bar",
            marker = list(color = "#6a51a3")) |>
      layout(xaxis = list(title = ""), yaxis = list(title = "observations"))
  })

  # ---------- Emotion distribution tab ----------
  output$plot_emotion_freq <- renderPlotly({
    df <- data_r() |> count(emotion, sort = TRUE) |>
      mutate(pct = n / sum(n))
    plot_ly(df, x = ~reorder(emotion, -n), y = ~n, type = "bar",
            text = ~sprintf("%d (%.1f%%)", n, pct * 100),
            textposition = "outside",
            marker = list(color = "#2a7ae2")) |>
      layout(xaxis = list(title = ""), yaxis = list(title = "observations"))
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
            marker = list(color = "#27ae60")) |>
      layout(xaxis = list(title = ""), yaxis = list(title = "observations"))
  })

  # ---------- Trends tab ----------
  output$plot_trend <- renderPlotly({
    b <- data_r() |>
      mutate(bucket = lubridate::floor_date(timestamp, "30 seconds")) |>
      group_by(lecture_id, bucket) |>
      summarise(engagement = mean(engagement_score, na.rm = TRUE), .groups = "drop")
    plot_ly(b, x = ~bucket, y = ~engagement, color = ~lecture_id,
            type = "scatter", mode = "lines+markers") |>
      layout(xaxis = list(title = "time"),
             yaxis = list(title = "mean engagement"))
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
        geom_col(show.legend = FALSE) +
        labs(title = "Need ≥ 3 lecturers to cluster — showing engagement bar",
             x = NULL, y = "mean engagement") +
        theme_minimal()
    } else {
      X <- features |> select(-doctor_id) |> scale()
      k <- min(3, nrow(X) - 1)
      km <- kmeans(X, centers = k, nstart = 10)
      factoextra::fviz_cluster(km, data = X, labelsize = 10,
                                geom = c("point", "text"),
                                main = sprintf("Lecturer clusters (k = %d)", k))
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
        geom_col(show.legend = FALSE) +
        labs(title = "Need ≥ 3 (student, lecture) pairs",
             x = NULL, y = "mean engagement") +
        theme_minimal() +
        theme(axis.text.x = element_text(angle = 30, hjust = 1))
    } else {
      X <- pairs |> select(mean_engagement, sleep_rate, hand_rate) |> scale()
      k <- min(3, nrow(X) - 1)
      km <- kmeans(X, centers = k, nstart = 10)
      factoextra::fviz_cluster(km, data = X, labelsize = 9,
                               geom = c("point", "text"),
                               main = sprintf("Student × subject clusters (k = %d)", k))
    }
  })

  # ---------- Raw data tab ----------
  output$raw_table <- renderDT({
    datatable(data_r(), filter = "top", rownames = FALSE,
              options = list(pageLength = 25, scrollX = TRUE))
  })
}

shinyApp(ui, server)
