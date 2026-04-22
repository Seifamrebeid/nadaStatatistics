# Lecture report rendering — hand-rolled HTML.
#
# Dev machines often lack pandoc (rmarkdown requires it). To keep the endpoint
# 500-proof we bypass rmarkdown entirely and emit HTML directly, embedding
# ggplot charts as inline SVG so the result is a single self-contained file.
# Once pandoc is available this could be swapped for the .Rmd template at
# reports/lecture_report.Rmd without changing any other code.

suppressPackageStartupMessages({
  library(dplyr)
  library(ggplot2)
  library(lubridate)
})

.html_escape <- function(x) {
  x <- gsub("&", "&amp;", x, fixed = TRUE)
  x <- gsub("<", "&lt;",  x, fixed = TRUE)
  x <- gsub(">", "&gt;",  x, fixed = TRUE)
  x
}

.kv <- function(k, v) {
  if (is.null(v) || (length(v) == 1 && is.na(v))) v <- "—"
  sprintf("<p><b>%s:</b> %s</p>", .html_escape(k), .html_escape(as.character(v)))
}

.plot_to_svg <- function(plot, width = 7, height = 3.5) {
  f <- tempfile(fileext = ".svg")
  on.exit(unlink(f), add = TRUE)
  ggplot2::ggsave(f, plot, width = width, height = height, dpi = 96)
  paste(readLines(f, warn = FALSE), collapse = "\n")
}

.table_html <- function(df) {
  if (nrow(df) == 0) return("<p><em>(no rows)</em></p>")
  cols <- names(df)
  head <- paste0("<tr>", paste0("<th>", .html_escape(cols), "</th>", collapse = ""), "</tr>")
  body <- vapply(seq_len(nrow(df)), function(i) {
    paste0("<tr>",
           paste0("<td>", .html_escape(as.character(unlist(df[i, ]))), "</td>",
                  collapse = ""),
           "</tr>")
  }, character(1))
  paste0("<table><thead>", head, "</thead><tbody>",
         paste(body, collapse = ""), "</tbody></table>")
}

#' Render a self-contained HTML report for a lecture. Returns the output path.
render_lecture_report <- function(lecture_id) {
  out_dir <- env_or("REPORT_OUTPUT_DIR", "../reports-out")
  if (!dir.exists(out_dir)) dir.create(out_dir, recursive = TRUE)
  out_path <- normalizePath(file.path(out_dir, sprintf("%s.html", lecture_id)),
                            winslash = "/", mustWork = FALSE)

  lec_doc <- tryCatch(fs_get(sprintf("lectures/%s", lecture_id)),
                      error = function(e) NULL)
  lec <- if (is.null(lec_doc)) list() else fs_unwrap_fields(lec_doc$fields)

  all <- fs_collection_df("emotions")
  df <- if (nrow(all) == 0) data.frame() else
    all[!is.na(all$lecture_id) & all$lecture_id == lecture_id, , drop = FALSE]

  attendance_html <- "<p><em>no observations</em></p>"
  engagement_svg  <- ""
  emotion_svg     <- ""
  sleep_line      <- ""
  gesture_html    <- ""

  if (nrow(df) > 0) {
    df$timestamp <- lubridate::as_datetime(df$timestamp)
    df$engagement_score <- as.numeric(df$engagement_score)

    attendance <- df |>
      group_by(student_id) |>
      summarise(observations    = n(),
                first_seen      = format(min(timestamp), "%H:%M:%S"),
                last_seen       = format(max(timestamp), "%H:%M:%S"),
                mean_engagement = round(mean(engagement_score, na.rm = TRUE), 2),
                .groups = "drop")
    attendance_html <- .table_html(attendance)

    trend <- df |>
      mutate(bucket = lubridate::floor_date(timestamp, "30 seconds")) |>
      group_by(bucket) |>
      summarise(engagement = mean(engagement_score, na.rm = TRUE), .groups = "drop")
    engagement_svg <- .plot_to_svg(
      ggplot(trend, aes(x = bucket, y = engagement)) +
        geom_line(colour = "#2a7ae2", linewidth = 0.8) +
        geom_point(colour = "#2a7ae2") +
        labs(title = "Engagement over time", x = "time", y = "mean engagement") +
        theme_minimal(base_size = 11),
      width = 8, height = 3.5
    )

    emo <- df |> count(emotion, sort = TRUE)
    emotion_svg <- .plot_to_svg(
      ggplot(emo, aes(x = reorder(emotion, -n), y = n, fill = emotion)) +
        geom_col(show.legend = FALSE) +
        labs(title = "Emotion distribution", x = NULL, y = "observations") +
        theme_minimal(base_size = 11),
      width = 7, height = 3.5
    )

    if ("state" %in% names(df)) {
      rate <- mean(df$state == "sleeping", na.rm = TRUE)
      sleep_line <- sprintf("<p><b>Sleep rate:</b> %.1f%% of observations</p>", rate * 100)
    }
    if ("gesture" %in% names(df)) {
      g <- df[!is.na(df$gesture) & df$gesture != "none",
              c("timestamp", "student_id", "gesture"), drop = FALSE]
      if (nrow(g) > 0) {
        g$timestamp <- format(g$timestamp, "%H:%M:%S")
        gesture_html <- paste0("<h2>Gesture log</h2>", .table_html(g))
      }
    }
  }

  html <- sprintf('<!doctype html>
<html><head><meta charset="utf-8"><title>Lecture Report — %s</title>
<style>
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; max-width: 880px; margin: 2em auto; padding: 0 1em; color: #222; }
  h1 { border-bottom: 2px solid #2a7ae2; padding-bottom: .3em; }
  h2 { margin-top: 2em; color: #2a7ae2; }
  table { border-collapse: collapse; width: 100%%; margin: 1em 0; }
  th, td { border: 1px solid #ddd; padding: .4em .7em; text-align: left; font-size: .9em; }
  thead { background: #f0f4fa; }
  svg { max-width: 100%%; height: auto; }
  .meta p { margin: .3em 0; }
</style></head><body>
<h1>Lecture Report</h1>
<div class="meta">
%s%s%s%s%s
</div>
<h2>Attendance</h2>%s
<h2>Engagement over time</h2>%s
<h2>Emotion distribution</h2>%s
%s%s
<hr><p style="color:#888;font-size:.85em">Generated %s</p>
</body></html>',
    .html_escape(lecture_id),
    .kv("Lecture",      lec$title    %||% lecture_id),
    .kv("Doctor ID",    lec$doctor_id %||% "unknown"),
    .kv("Status",       lec$status    %||% "unknown"),
    .kv("Finalized at", lec$finalized_at %||% "pending"),
    .kv("Observations", nrow(df)),
    attendance_html,
    if (nzchar(engagement_svg)) engagement_svg else "<p><em>no data</em></p>",
    if (nzchar(emotion_svg))    emotion_svg    else "<p><em>no data</em></p>",
    sleep_line,
    gesture_html,
    now_iso()
  )

  writeLines(html, out_path, useBytes = TRUE)

  fs_update(sprintf("lectures/%s", lecture_id),
            list(report_path = out_path,
                 report_generated_at = now_iso(),
                 report_format = "html"))
  out_path
}
