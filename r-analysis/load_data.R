# Data loader — Firestore emulator first, CSV fallback.
# Standalone (no dependency on backend-r-plumber).

user_lib <- file.path(Sys.getenv("LOCALAPPDATA"), "R", "win-library", "4.5")
if (dir.exists(user_lib) && !(user_lib %in% .libPaths())) .libPaths(c(user_lib, .libPaths()))

suppressPackageStartupMessages({
  library(readr); library(dplyr); library(lubridate)
  library(httr); library(jsonlite); library(tidyr)
})

`%||%` <- function(a, b) if (is.null(a)) b else a

.find_repo_root <- function(start = getwd()) {
  d <- normalizePath(start, winslash = "/", mustWork = FALSE)
  repeat {
    if (file.exists(file.path(d, "data/emotions.csv"))) return(d)
    if (dir.exists(file.path(d, ".git")))               return(d)
    parent <- dirname(d)
    if (parent == d) return(NA_character_)
    d <- parent
  }
}

.default_csv_path <- function() {
  root <- .find_repo_root()
  if (!is.na(root)) return(file.path(root, "data/emotions.csv"))
  "../data/emotions.csv"
}

CSV_PATH <- Sys.getenv("CSV_PATH", unset = .default_csv_path())

# Source vendored Firestore helpers from r-analysis/shiny/shared/firestore.R.
.source_firestore <- function() {
  root <- .find_repo_root()
  if (is.na(root)) stop("repo root not found")
  fs <- file.path(root, "r-analysis", "shiny", "shared", "firestore.R")
  if (!file.exists(fs)) stop(sprintf("firestore helpers missing: %s", fs))
  source(fs, local = FALSE)
  invisible(TRUE)
}

# Tiny dotfile-loader so Shiny picks up FIREBASE_PROJECT_ID + emulator host.
.load_local_renviron <- function() {
  candidates <- c(
    file.path(.find_repo_root() %||% ".", "r-analysis/shiny/.Renviron"),
    file.path(.find_repo_root() %||% ".", ".Renviron")
  )
  for (renv in candidates) {
    if (!file.exists(renv)) next
    for (line in readLines(renv, warn = FALSE)) {
      line <- trimws(line)
      if (!nzchar(line) || startsWith(line, "#")) next
      eq <- regexpr("=", line, fixed = TRUE)
      if (eq < 1) next
      key <- trimws(substr(line, 1, eq - 1))
      val <- trimws(substr(line, eq + 1, nchar(line)))
      if (!nzchar(Sys.getenv(key, unset = ""))) {
        args <- list(val); names(args) <- key
        do.call(Sys.setenv, args)
      }
    }
  }
}
.load_local_renviron()

.have_fs <- function() {
  nzchar(Sys.getenv("FIRESTORE_EMULATOR_HOST", unset = "")) ||
    nzchar(Sys.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", unset = ""))
}

# ---- Generic Firestore -> tibble loader ----
.fs_rows <- function(coll) {
  if (!.have_fs()) return(dplyr::tibble())
  tryCatch({
    .source_firestore()
    docs <- fs_list(coll)
    if (!length(docs)) return(dplyr::tibble())
    rows <- lapply(docs, function(d) {
      flat <- tryCatch(fs_unwrap_fields(d$fields), error = function(e) list())
      doc_id <- basename(as.character(d[["name"]] %||% ""))
      flat <- lapply(flat, function(x) {
        if (is.null(x) || length(x) == 0) return(NA)
        if (is.list(x)) {
          # Keep arrays/maps as list-columns instead of paste-collapsing
          return(list(x))
        }
        if (length(x) > 1) return(paste(x, collapse = ", "))
        x
      })
      if (!"id" %in% names(flat)) flat[["id"]] <- doc_id
      tryCatch(dplyr::as_tibble(flat), error = function(e) dplyr::tibble(id = doc_id))
    })
    dplyr::bind_rows(rows)
  }, error = function(e) {
    message(sprintf("[fs_rows] %s: %s", coll, conditionMessage(e)))
    dplyr::tibble()
  })
}

.normalise_emotions <- function(df) {
  if (nrow(df) == 0) return(df)
  if ("timestamp" %in% names(df))    df$timestamp <- lubridate::as_datetime(df$timestamp)
  if ("emotion" %in% names(df))      df$emotion <- as.character(df$emotion)
  if ("state" %in% names(df))        df$state <- dplyr::coalesce(as.character(df$state), "awake")
  if ("sleep_reason" %in% names(df)) df$sleep_reason <- dplyr::na_if(as.character(df$sleep_reason), "")
  if ("gesture" %in% names(df))      df$gesture <- dplyr::coalesce(dplyr::na_if(as.character(df$gesture), ""), "none")
  for (col in c("engagement_score", "confidence", "attention_score", "cheat_score")) {
    if (col %in% names(df)) df[[col]] <- as.numeric(df[[col]])
  }
  df
}

.empty_emotions_tibble <- function() {
  dplyr::tibble(
    timestamp = as.POSIXct(character(0)),
    student_id = character(0), lecture_id = character(0),
    emotion = character(0), state = character(0),
    sleep_reason = character(0), gesture = character(0),
    engagement_score = numeric(0), confidence = numeric(0),
    attention_score = numeric(0), yawning = logical(0)
  )
}

load_from_csv <- function(path = CSV_PATH) {
  if (!file.exists(path)) return(.empty_emotions_tibble())
  df <- readr::read_csv(path, show_col_types = FALSE)
  if (nrow(df) == 0) return(.empty_emotions_tibble())
  .normalise_emotions(df)
}

load_from_firestore <- function(max_docs = NULL) {
  .source_firestore()
  docs <- fs_list("emotions", max_docs = max_docs)
  if (length(docs) == 0) return(.empty_emotions_tibble())
  rows <- lapply(docs, function(d) {
    flat <- fs_unwrap_fields(d$fields)
    flat <- lapply(flat, function(x) if (is.null(x)) NA else if (is.list(x)) NA else x)
    dplyr::as_tibble(flat)
  })
  dplyr::bind_rows(rows) |> .normalise_emotions()
}

# Smart dispatcher.
# Set DATA_SOURCE=csv to force the much faster CSV path (good for demos when
# the seeded data is enough). Set EMOTIONS_MAX_DOCS=2000 to cap Firestore
# pagination — at ~300 docs/page that's ~7 round-trips instead of 24, cutting
# initial dashboard load time meaningfully without losing visualization variety.
load_emotions <- function() {
  src <- tolower(Sys.getenv("DATA_SOURCE", unset = "auto"))
  max_docs <- {
    v <- suppressWarnings(as.integer(Sys.getenv("EMOTIONS_MAX_DOCS", unset = "")))
    if (is.na(v) || v <= 0) NULL else v
  }
  if (src == "csv")       return(load_from_csv())
  if (src == "firestore") return(load_from_firestore(max_docs))
  if (!.have_fs()) return(load_from_csv())
  tryCatch(load_from_firestore(max_docs),
    error = function(e) {
      message(sprintf("load_emotions: Firestore unreachable (%s); CSV fallback.",
                      conditionMessage(e)))
      load_from_csv()
    })
}

# ---- Collection loaders ----
load_students   <- function() .fs_rows("students")
load_doctors    <- function() .fs_rows("doctors")
load_admins     <- function() .fs_rows("admins")
load_parents    <- function() .fs_rows("parents")
load_subjects   <- function() .fs_rows("subjects")
load_classes    <- function() .fs_rows("classes")
load_weeks      <- function() .fs_rows("weeks")
load_lectures   <- function() .fs_rows("lectures")
load_users      <- function() .fs_rows("users")
load_grades     <- function() .fs_rows("grades")
load_notifications <- function() .fs_rows("notifications")
load_transcripts   <- function() .fs_rows("transcripts")

# Transcript segments live under transcripts/{id}/segments — must list each.
load_transcript_segments <- function(transcript_ids = NULL) {
  if (!.have_fs()) return(dplyr::tibble())
  .source_firestore()
  tryCatch({
    if (is.null(transcript_ids)) {
      ts <- load_transcripts()
      if (nrow(ts) == 0) return(dplyr::tibble())
      transcript_ids <- ts$id
    }
    rows <- list()
    for (tid in transcript_ids) {
      docs <- tryCatch(fs_list(sprintf("transcripts/%s/segments", tid)),
                       error = function(e) list())
      if (!length(docs)) next
      for (d in docs) {
        flat <- fs_unwrap_fields(d$fields)
        flat <- lapply(flat, function(x) if (is.null(x)) NA else x)
        flat$transcript_id <- tid
        rows[[length(rows) + 1L]] <- dplyr::as_tibble(flat)
      }
    }
    if (!length(rows)) return(dplyr::tibble())
    dplyr::bind_rows(rows)
  }, error = function(e) {
    message(sprintf("load_transcript_segments: %s", conditionMessage(e)))
    dplyr::tibble()
  })
}

# Convenience used by Phase 4 lecturer clustering when emotions has no doctor_id.
attach_doctor_id <- function(df, lectures = NULL) {
  if (nrow(df) == 0 || !"lecture_id" %in% names(df)) {
    return(dplyr::mutate(df, doctor_id = character(0)))
  }
  if (is.null(lectures)) lectures <- load_lectures()
  if (!"id" %in% names(lectures)) lectures$id <- lectures$lecture_id %||% NA_character_
  if (nrow(lectures) == 0 || !"doctor_id" %in% names(lectures)) {
    return(dplyr::mutate(df, doctor_id = "doc_unknown"))
  }
  lk <- stats::setNames(lectures$doctor_id, lectures$id)
  df |> dplyr::mutate(doctor_id = unname(lk[lecture_id]),
                      doctor_id = dplyr::coalesce(doctor_id, "doc_unknown"))
}

plot_dir <- function() {
  d <- file.path(.find_repo_root() %||% ".", "r-analysis", "plots")
  if (!dir.exists(d)) dir.create(d, recursive = TRUE)
  d
}
