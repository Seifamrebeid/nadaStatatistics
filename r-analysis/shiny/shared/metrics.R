# ── Aggregation helpers used across all role lenses ──────────────────────
#
# Every function here takes pre-loaded tibbles (emotions / lectures / ...)
# and returns a tibble suitable for plotting, with no Firestore calls of its
# own. Keeps the Shiny server reactive code thin.

suppressPackageStartupMessages({
  library(dplyr); library(tidyr); library(lubridate)
})

`%||%` <- function(a, b) if (is.null(a)) b else a

EMOTION_ORDER  <- c("happy", "surprise", "neutral", "sad", "angry", "fear", "disgust")
GESTURE_ORDER  <- c("hand_raised", "thumbs_up", "thumbs_down", "pointing",
                    "toilet_request", "none")
DAY_ORDER      <- c("Mon","Tue","Wed","Thu","Fri","Sat","Sun")

# ---- KPI single-value summaries ---------------------------------------------

kpi_summary <- function(emo) {
  if (nrow(emo) == 0) {
    return(list(observations = 0L, students = 0L, lectures = 0L,
                mean_engagement = NA_real_, sleep_rate = NA_real_,
                hand_raised_rate = NA_real_, yawn_rate = NA_real_,
                phone_rate = NA_real_))
  }
  list(
    observations     = nrow(emo),
    students         = dplyr::n_distinct(emo$student_id),
    lectures         = dplyr::n_distinct(emo$lecture_id),
    mean_engagement  = mean(emo$engagement_score, na.rm = TRUE),
    sleep_rate       = mean(emo$state == "sleeping", na.rm = TRUE),
    hand_raised_rate = mean(emo$gesture == "hand_raised", na.rm = TRUE),
    yawn_rate        = if ("yawning" %in% names(emo))
                         mean(as.logical(emo$yawning), na.rm = TRUE) else NA_real_,
    phone_rate       = if ("cheat_warning" %in% names(emo))
                         mean(as.logical(emo$cheat_warning), na.rm = TRUE) else NA_real_
  )
}

# ---- Frequency tables -------------------------------------------------------

emotion_freq <- function(emo) {
  if (nrow(emo) == 0) return(dplyr::tibble(emotion = character(), n = integer(), pct = numeric()))
  emo |> dplyr::count(emotion, name = "n") |>
    dplyr::mutate(pct = n / sum(n),
                  emotion = factor(emotion, levels = EMOTION_ORDER)) |>
    dplyr::arrange(emotion)
}

gesture_freq <- function(emo) {
  if (nrow(emo) == 0) return(dplyr::tibble(gesture = character(), n = integer()))
  emo |> dplyr::count(gesture, name = "n") |>
    dplyr::arrange(dplyr::desc(n))
}

state_freq <- function(emo) {
  if (nrow(emo) == 0) return(dplyr::tibble(state = character(), n = integer()))
  emo |> dplyr::count(state, name = "n")
}

# ---- Per-student summaries --------------------------------------------------

per_student_summary <- function(emo) {
  if (nrow(emo) == 0) return(dplyr::tibble())
  emo |>
    dplyr::group_by(student_id) |>
    dplyr::summarise(
      observations     = dplyr::n(),
      lectures         = dplyr::n_distinct(lecture_id),
      mean_engagement  = mean(engagement_score, na.rm = TRUE),
      sleep_rate       = mean(state == "sleeping", na.rm = TRUE),
      hand_raised_rate = mean(gesture == "hand_raised", na.rm = TRUE),
      mean_attention   = if ("attention_score" %in% names(emo))
                           mean(attention_score, na.rm = TRUE) else NA_real_,
      .groups = "drop"
    ) |>
    dplyr::arrange(dplyr::desc(mean_engagement))
}

per_lecture_summary <- function(emo) {
  if (nrow(emo) == 0) return(dplyr::tibble())
  emo |>
    dplyr::group_by(lecture_id) |>
    dplyr::summarise(
      observations    = dplyr::n(),
      students        = dplyr::n_distinct(student_id),
      mean_engagement = mean(engagement_score, na.rm = TRUE),
      sleep_rate      = mean(state == "sleeping", na.rm = TRUE),
      hand_raised_rate = mean(gesture == "hand_raised", na.rm = TRUE),
      first_seen = min(timestamp, na.rm = TRUE),
      last_seen  = max(timestamp, na.rm = TRUE),
      .groups = "drop"
    ) |>
    dplyr::arrange(dplyr::desc(mean_engagement))
}

per_doctor_summary <- function(emo, lectures) {
  if (nrow(emo) == 0) return(dplyr::tibble())
  if (!"doctor_id" %in% names(emo)) {
    if (nrow(lectures) == 0 || !"doctor_id" %in% names(lectures)) {
      return(dplyr::tibble())
    }
    if (!"id" %in% names(lectures)) lectures$id <- lectures$lecture_id %||% NA_character_
    lk <- stats::setNames(lectures$doctor_id, lectures$id)
    emo$doctor_id <- unname(lk[emo$lecture_id])
  }
  emo |> dplyr::filter(!is.na(doctor_id)) |>
    dplyr::group_by(doctor_id) |>
    dplyr::summarise(
      observations    = dplyr::n(),
      lectures        = dplyr::n_distinct(lecture_id),
      students        = dplyr::n_distinct(student_id),
      mean_engagement = mean(engagement_score, na.rm = TRUE),
      sleep_rate      = mean(state == "sleeping", na.rm = TRUE),
      hand_raised_rate = mean(gesture == "hand_raised", na.rm = TRUE),
      .groups = "drop"
    ) |>
    dplyr::arrange(dplyr::desc(mean_engagement))
}

# ---- Time series ------------------------------------------------------------

engagement_timeline <- function(emo, bin_seconds = 30) {
  if (nrow(emo) == 0) return(dplyr::tibble(t = as.POSIXct(character()), mean_engagement = numeric()))
  emo |>
    dplyr::mutate(t = lubridate::floor_date(timestamp, unit = paste(bin_seconds, "seconds"))) |>
    dplyr::group_by(t, lecture_id) |>
    dplyr::summarise(mean_engagement = mean(engagement_score, na.rm = TRUE),
                     sleep_rate      = mean(state == "sleeping", na.rm = TRUE),
                     n = dplyr::n(),
                     .groups = "drop")
}

day_of_week_pattern <- function(emo) {
  if (nrow(emo) == 0) return(dplyr::tibble(day = character(), mean_engagement = numeric()))
  emo |>
    dplyr::mutate(day = factor(format(timestamp, "%a"), levels = DAY_ORDER)) |>
    dplyr::group_by(day) |>
    dplyr::summarise(mean_engagement = mean(engagement_score, na.rm = TRUE),
                     sleep_rate      = mean(state == "sleeping", na.rm = TRUE),
                     n = dplyr::n(), .groups = "drop")
}

hour_of_day_pattern <- function(emo) {
  if (nrow(emo) == 0) return(dplyr::tibble(hour = integer(), mean_engagement = numeric()))
  emo |>
    dplyr::mutate(hour = lubridate::hour(timestamp)) |>
    dplyr::group_by(hour) |>
    dplyr::summarise(mean_engagement = mean(engagement_score, na.rm = TRUE),
                     n = dplyr::n(), .groups = "drop")
}

# ---- Comparisons / ranking --------------------------------------------------

top_n_summary <- function(summary_df, metric, n = 10, descending = TRUE) {
  if (nrow(summary_df) == 0 || !metric %in% names(summary_df)) return(summary_df)
  ord <- if (descending) order(-summary_df[[metric]]) else order(summary_df[[metric]])
  summary_df[head(ord, n), , drop = FALSE]
}

# ---- Joins / lookups --------------------------------------------------------

join_student_names <- function(df, students) {
  if (nrow(df) == 0 || !"student_id" %in% names(df)) return(df)
  if (nrow(students) == 0) { df$student_name <- NA_character_; return(df) }
  if (!"id" %in% names(students)) students$id <- students$student_id %||% NA_character_
  lk <- stats::setNames(students$name %||% rep(NA, nrow(students)), students$id)
  df$student_name <- unname(lk[df$student_id])
  df
}
join_doctor_names <- function(df, doctors) {
  if (nrow(df) == 0 || !"doctor_id" %in% names(df)) return(df)
  if (nrow(doctors) == 0) { df$doctor_name <- NA_character_; return(df) }
  if (!"id" %in% names(doctors)) doctors$id <- doctors$doctor_id %||% NA_character_
  lk <- stats::setNames(doctors$name %||% rep(NA, nrow(doctors)), doctors$id)
  df$doctor_name <- unname(lk[df$doctor_id])
  df
}
join_lecture_titles <- function(df, lectures) {
  if (nrow(df) == 0 || !"lecture_id" %in% names(df)) return(df)
  if (nrow(lectures) == 0) { df$lecture_title <- df$lecture_id; return(df) }
  if (!"id" %in% names(lectures)) lectures$id <- lectures$lecture_id %||% NA_character_
  lk <- stats::setNames(lectures$title %||% lectures$id, lectures$id)
  df$lecture_title <- dplyr::coalesce(unname(lk[df$lecture_id]), df$lecture_id)
  df
}

# ---- Transcript text analytics ---------------------------------------------

transcript_word_freq <- function(segments, top_n = 30, min_chars = 3,
                                 stopwords = NULL) {
  if (nrow(segments) == 0 || !"text" %in% names(segments)) {
    return(dplyr::tibble(word = character(), n = integer()))
  }
  txt <- paste(segments$text, collapse = " ")
  txt <- tolower(txt)
  toks <- unlist(strsplit(txt, "[^\\p{L}0-9]+", perl = TRUE))
  toks <- toks[nchar(toks) >= min_chars]
  if (!is.null(stopwords)) toks <- toks[!toks %in% stopwords]
  if (!length(toks)) return(dplyr::tibble(word = character(), n = integer()))
  tab <- sort(table(toks), decreasing = TRUE)
  dplyr::tibble(word = names(tab)[seq_len(min(top_n, length(tab)))],
                n    = as.integer(tab)[seq_len(min(top_n, length(tab)))])
}

transcript_segment_summary <- function(segments) {
  if (nrow(segments) == 0) {
    return(dplyr::tibble(transcript_id = character(), segments = integer(),
                         total_words = integer(), avg_segment_seconds = numeric()))
  }
  segments |>
    dplyr::mutate(
      duration_s = pmax(0, suppressWarnings(as.numeric(end) - as.numeric(start))),
      words      = vapply(strsplit(as.character(text), "\\s+"), length, integer(1))
    ) |>
    dplyr::group_by(transcript_id) |>
    dplyr::summarise(
      segments            = dplyr::n(),
      total_words         = sum(words, na.rm = TRUE),
      avg_segment_seconds = mean(duration_s, na.rm = TRUE),
      avg_words_per_seg   = mean(words, na.rm = TRUE),
      .groups = "drop"
    )
}

# ---- Data quality -----------------------------------------------------------

data_quality_summary <- function(emo, students, doctors, lectures) {
  list(
    emo_rows           = nrow(emo),
    students_total     = nrow(students),
    doctors_total      = nrow(doctors),
    lectures_total     = nrow(lectures),
    students_with_data = if (nrow(emo) > 0) dplyr::n_distinct(emo$student_id) else 0L,
    lectures_with_data = if (nrow(emo) > 0) dplyr::n_distinct(emo$lecture_id) else 0L,
    students_no_data   = max(0L, nrow(students) -
                               (if (nrow(emo) > 0) dplyr::n_distinct(emo$student_id) else 0L)),
    lectures_no_data   = max(0L, nrow(lectures) -
                               (if (nrow(emo) > 0) dplyr::n_distinct(emo$lecture_id) else 0L)),
    earliest_obs       = if (nrow(emo) > 0) min(emo$timestamp, na.rm = TRUE) else NA,
    latest_obs         = if (nrow(emo) > 0) max(emo$timestamp, na.rm = TRUE) else NA
  )
}
