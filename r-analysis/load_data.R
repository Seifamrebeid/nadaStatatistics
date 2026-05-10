# Data loader — three paths, pick whichever fits the context.
#
#   load_from_csv()        — fastest, reads <repo>/data/emotions.csv
#   load_from_api()        — hits the R Plumber backend (CSV passthrough)
#   load_from_firestore()  — reuses the backend's Firestore helpers
#
# All three return the same tibble: one row per observation.

user_lib <- file.path(Sys.getenv("LOCALAPPDATA"), "R", "win-library", "4.5")
if (dir.exists(user_lib) && !(user_lib %in% .libPaths())) .libPaths(c(user_lib, .libPaths()))

suppressPackageStartupMessages({
  library(readr)
  library(dplyr)
  library(lubridate)
  library(httr)
  library(jsonlite)
})

# Walk up from the current working directory looking for the repo root so the
# loader works whether invoked from r-analysis/, r-analysis/shiny/, or the repo
# root. Marker = the `data/emotions.csv` file itself, with `.git` as fallback.
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
  "../data/emotions.csv"  # last-resort legacy default
}

CSV_PATH <- Sys.getenv("CSV_PATH", unset = .default_csv_path())
API_URL  <- Sys.getenv("API_URL",  unset = "http://localhost:8000")

# The backend's .Renviron holds FIREBASE_PROJECT_ID + FIRESTORE_EMULATOR_HOST.
# Shiny never reads that file on its own, so Firestore loads fail with
# "FIREBASE_PROJECT_ID not set" unless we pull it in here. Only sets vars that
# are missing — an explicit Shiny-session env var always wins.
.load_backend_renviron <- function() {
  root <- .find_repo_root()
  if (is.na(root)) return(invisible(NULL))
  renv <- file.path(root, "backend-r-plumber", ".Renviron")
  if (!file.exists(renv)) return(invisible(NULL))
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
  invisible(NULL)
}
.load_backend_renviron()

# Sleep reason + gesture often ship as blank strings; normalise to NA for tidy analysis.
.normalise_emotions <- function(df) {
  df |>
    mutate(
      timestamp    = lubridate::as_datetime(timestamp),
      emotion      = as.character(emotion),
      state        = dplyr::coalesce(as.character(state), "awake"),
      sleep_reason = dplyr::na_if(as.character(sleep_reason), ""),
      gesture      = dplyr::coalesce(dplyr::na_if(as.character(gesture), ""), "none"),
      engagement_score = as.numeric(engagement_score),
      confidence   = as.numeric(confidence)
    )
}

.empty_emotions_tibble <- function() {
  dplyr::tibble(
    timestamp        = as.POSIXct(character(0)),
    student_id       = character(0),
    lecture_id       = character(0),
    emotion          = character(0),
    state            = character(0),
    sleep_reason     = character(0),
    gesture          = character(0),
    engagement_score = numeric(0),
    confidence       = numeric(0),
    attention_score  = numeric(0),
    cheat_warning    = logical(0),
    cheat_score      = numeric(0)
  )
}

load_from_csv <- function(path = CSV_PATH) {
  if (!file.exists(path)) return(.empty_emotions_tibble())
  df <- readr::read_csv(path, show_col_types = FALSE)
  if (nrow(df) == 0) return(.empty_emotions_tibble())
  df |> .normalise_emotions()
}

load_from_api <- function(base = API_URL, token = NULL) {
  headers <- c()
  if (!is.null(token)) headers <- add_headers(Authorization = paste("Bearer", token))
  resp <- GET(paste0(base, "/api/emotions/csv"), headers)
  if (httr::http_error(resp)) stop(sprintf("API load failed: %s", content(resp, "text")))
  readr::read_csv(content(resp, as = "text", encoding = "UTF-8"),
                  show_col_types = FALSE) |> .normalise_emotions()
}

load_from_firestore <- function() {
  root <- .find_repo_root()
  if (is.na(root)) stop("could not locate repo root — cannot source Firestore helpers")
  source(file.path(root, "backend-r-plumber", "R", "config.R"))
  source(file.path(root, "backend-r-plumber", "R", "firestore.R"))
  docs <- fs_list("emotions")
  if (length(docs) == 0) return(.empty_emotions_tibble())
  # fs_unwrap_fields returns a named list; some fields may be NULL (null in
  # Firestore). Coerce each to a 1-row tibble so bind_rows aligns columns.
  rows <- lapply(docs, function(d) {
    flat <- fs_unwrap_fields(d$fields)
    flat <- lapply(flat, function(x) if (is.null(x)) NA else x)
    dplyr::as_tibble(flat)
  })
  dplyr::bind_rows(rows) |> .normalise_emotions()
}

# ---- Smart loader — Firestore first, CSV fallback ----
#
# Set DATA_SOURCE to force one path:
#   DATA_SOURCE=firestore  -> always hit Firestore (error if unreachable)
#   DATA_SOURCE=csv        -> always read the CSV
#   DATA_SOURCE=auto (default) -> try Firestore when FIRESTORE_EMULATOR_HOST or
#                                 a prod service-account key is set; otherwise CSV.
load_emotions <- function() {
  src <- tolower(Sys.getenv("DATA_SOURCE", unset = "auto"))
  if (src == "csv")       return(load_from_csv())
  if (src == "firestore") return(load_from_firestore())
  # auto
  have_firestore <- nzchar(Sys.getenv("FIRESTORE_EMULATOR_HOST", unset = "")) ||
                    nzchar(Sys.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", unset = ""))
  if (!have_firestore) return(load_from_csv())
  tryCatch(
    load_from_firestore(),
    error = function(e) {
      message(sprintf("load_emotions: Firestore unreachable (%s); falling back to CSV.",
                      conditionMessage(e)))
      load_from_csv()
    }
  )
}

# ---- Attach a doctor_id so Phase 4 lecturer clustering has something to cluster ----
#
# `emotions` rows don't carry doctor_id directly; it lives on the `lectures`
# doc. In CSV-only mode we don't have that lookup, so we derive doctor_id from
# a synthetic mapping the Shiny app can override. Default: everything belongs
# to `doc_test` (matches the seeded lecture).
attach_doctor_id <- function(df, mapping = c(lec_test_001 = "doc_test")) {
  if (nrow(df) == 0 || !"lecture_id" %in% names(df)) {
    return(dplyr::mutate(df, doctor_id = character(0)))
  }
  df |> dplyr::mutate(doctor_id = dplyr::coalesce(unname(mapping[lecture_id]), "doc_unknown"))
}

# ---- Lecture metadata for the Shiny picker ----
#
# Fetches lectures + weeks + classes from Firestore and returns a named char
# vector suitable for Shiny's selectInput choices: names() are display labels
# ("Computing Algorithms — Week 1 (CS-ALG SE1)"), values are the lecture ids.
# Returns NULL if Firestore is unavailable so the caller falls back to ids.
load_lecture_labels <- function() {
  have_firestore <- nzchar(Sys.getenv("FIRESTORE_EMULATOR_HOST", unset = "")) ||
                    nzchar(Sys.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", unset = ""))
  if (!have_firestore) return(NULL)
  tryCatch({
    root <- .find_repo_root()
    if (is.na(root)) stop("repo root not found")
    source(file.path(root, "backend-r-plumber", "R", "config.R"))
    source(file.path(root, "backend-r-plumber", "R", "firestore.R"))

    .rows <- function(coll) {
      docs <- fs_list(coll)
      if (length(docs) == 0) return(dplyr::tibble())
      rows <- lapply(docs, function(d) {
        flat <- fs_unwrap_fields(d$fields)
        flat <- lapply(flat, function(x) if (is.null(x)) NA else x)
        dplyr::as_tibble(flat)
      })
      dplyr::bind_rows(rows)
    }

    lectures <- .rows("lectures")
    weeks    <- .rows("weeks")
    classes  <- .rows("classes")
    if (nrow(lectures) == 0) return(NULL)

    # Build label per lecture: "<title> · Week N · <class name>"
    weeks_lk <- if (nrow(weeks) > 0) {
      stats::setNames(
        paste0("Week ", ifelse(is.na(weeks$week_number), "?", as.character(weeks$week_number))),
        weeks$week_id %||% weeks$id
      )
    } else character(0)
    week_class_lk <- if (nrow(weeks) > 0) {
      stats::setNames(weeks$class_id %||% rep(NA, nrow(weeks)),
                      weeks$week_id %||% weeks$id)
    } else character(0)
    classes_lk <- if (nrow(classes) > 0) {
      stats::setNames(classes$name %||% rep(NA, nrow(classes)),
                      classes$class_id %||% classes$id)
    } else character(0)

    ids   <- lectures$lecture_id %||% lectures$id
    title <- ifelse(is.na(lectures$title), ids, lectures$title)
    wk_id <- lectures$week_id %||% rep(NA, nrow(lectures))
    cl_id <- unname(week_class_lk[wk_id])
    wk_lbl <- unname(weeks_lk[wk_id])
    cl_nm  <- unname(classes_lk[cl_id])

    fmt_one <- function(t, w, c) {
      parts <- c(t,
                 if (!is.na(w) && nzchar(w)) w else NULL,
                 if (!is.na(c) && nzchar(c)) c else NULL)
      paste(parts, collapse = "  ·  ")
    }
    labels <- mapply(fmt_one, title, wk_lbl, cl_nm, USE.NAMES = FALSE)

    # Sort alphabetically by label for a stable picker order.
    o <- order(tolower(labels))
    stats::setNames(ids[o], labels[o])
  }, error = function(e) {
    message(sprintf("load_lecture_labels: %s", conditionMessage(e)))
    NULL
  })
}

# ---- Full students directory for Shiny search ----
#
# Returns all students from Firestore when available (including inactive).
# Fallback: unique student ids derived from emotions data.
load_students_directory <- function() {
  have_firestore <- nzchar(Sys.getenv("FIRESTORE_EMULATOR_HOST", unset = "")) ||
                    nzchar(Sys.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", unset = ""))

  if (have_firestore) {
    out <- tryCatch({
      root <- .find_repo_root()
      if (is.na(root)) stop("repo root not found")
      source(file.path(root, "backend-r-plumber", "R", "config.R"))
      source(file.path(root, "backend-r-plumber", "R", "firestore.R"))

      docs <- fs_list("students")
      if (length(docs) == 0) return(dplyr::tibble())
      rows <- lapply(docs, function(d) {
        flat <- fs_unwrap_fields(d$fields)
        flat <- lapply(flat, function(x) if (is.null(x)) NA else x)
        dplyr::as_tibble(flat)
      })
      dplyr::bind_rows(rows)
    }, error = function(e) {
      message(sprintf("load_students_directory: %s", conditionMessage(e)))
      NULL
    })

    if (!is.null(out)) {
      if (!"student_id" %in% names(out) && "id" %in% names(out)) {
        out$student_id <- out$id
      }
      if (!"active" %in% names(out)) out$active <- TRUE
      if (!"name" %in% names(out)) out$name <- NA_character_
      if (!"email" %in% names(out)) out$email <- NA_character_
      return(out)
    }
  }

  # Fallback to whatever we can infer from the observations file.
  emo <- load_emotions()
  if (nrow(emo) == 0 || !"student_id" %in% names(emo)) return(dplyr::tibble())
  emo |>
    dplyr::distinct(student_id) |>
    dplyr::mutate(name = NA_character_, email = NA_character_, active = TRUE)
}

# ---- Full doctors directory for Shiny search ----
#
# Returns all doctors from Firestore when available (including inactive).
# Fallback: unique doctor ids derived from observed lectures/emotions mapping.
load_doctors_directory <- function() {
  have_firestore <- nzchar(Sys.getenv("FIRESTORE_EMULATOR_HOST", unset = "")) ||
                    nzchar(Sys.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", unset = ""))

  if (have_firestore) {
    out <- tryCatch({
      root <- .find_repo_root()
      if (is.na(root)) stop("repo root not found")
      source(file.path(root, "backend-r-plumber", "R", "config.R"))
      source(file.path(root, "backend-r-plumber", "R", "firestore.R"))

      docs <- fs_list("doctors")
      if (length(docs) == 0) return(dplyr::tibble())
      rows <- lapply(docs, function(d) {
        flat <- fs_unwrap_fields(d$fields)
        flat <- lapply(flat, function(x) if (is.null(x)) NA else x)
        dplyr::as_tibble(flat)
      })
      dplyr::bind_rows(rows)
    }, error = function(e) {
      message(sprintf("load_doctors_directory: %s", conditionMessage(e)))
      NULL
    })

    if (!is.null(out)) {
      if (!"doctor_id" %in% names(out) && "id" %in% names(out)) {
        out$doctor_id <- out$id
      }
      if (!"active" %in% names(out)) out$active <- TRUE
      if (!"name" %in% names(out)) out$name <- NA_character_
      if (!"department" %in% names(out)) out$department <- NA_character_
      return(out)
    }
  }

  emo <- load_emotions() |> attach_doctor_id()
  if (nrow(emo) == 0 || !"doctor_id" %in% names(emo)) return(dplyr::tibble())
  emo |>
    dplyr::distinct(doctor_id) |>
    dplyr::mutate(name = NA_character_, department = NA_character_, active = TRUE)
}

# Tiny null-coalesce so the .rows() helper above stays readable.
`%||%` <- function(a, b) if (is.null(a)) b else a

# Convenience for scripts.
plot_dir <- function() {
  d <- "plots"
  if (!dir.exists(d)) dir.create(d, recursive = TRUE)
  d
}

# ---- Grades loader -------------------------------------------------------
.mark_to_grade <- function(mark) {
  if (is.na(mark)) return(NA_character_)
  if (mark >= 97) return("A*")
  if (mark >= 93) return("A")
  if (mark >= 90) return("A-")
  if (mark >= 87) return("B+")
  if (mark >= 83) return("B")
  if (mark >= 80) return("B-")
  if (mark >= 77) return("C+")
  if (mark >= 73) return("C")
  if (mark >= 70) return("C-")
  if (mark >= 67) return("D+")
  if (mark >= 63) return("D")
  if (mark >= 60) return("D-")
  "F"
}

# Read directly from the `grades` Firestore collection (written by web portals).
# Returns a tidy tibble with student_name, subject_name, doctor_name enriched.
load_grades <- function(student_id = NULL, q = NULL) {
  have_firestore <- nzchar(Sys.getenv("FIRESTORE_EMULATOR_HOST", unset = "")) ||
                    nzchar(Sys.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", unset = ""))

  if (have_firestore) {
    out <- tryCatch({
      root <- .find_repo_root()
      if (is.na(root)) stop("repo root not found")
      source(file.path(root, "backend-r-plumber", "R", "config.R"))
      source(file.path(root, "backend-r-plumber", "R", "firestore.R"))

      .rows <- function(coll) {
        docs <- fs_list(coll)
        if (length(docs) == 0) return(dplyr::tibble())
        rows <- lapply(docs, function(d) {
          flat <- fs_unwrap_fields(d$fields)
          flat <- lapply(flat, function(x) if (is.null(x) || length(x) == 0) NA else x[[1]])
          dplyr::as_tibble(flat)
        })
        dplyr::bind_rows(rows)
      }

      grades   <- .rows("grades")
      if (nrow(grades) == 0) return(dplyr::tibble())

      students <- .rows("students")
      subjects <- .rows("subjects")
      doctors  <- .rows("doctors")

      # Filter by student if requested
      if (!is.null(student_id) && nzchar(student_id)) {
        grades <- grades |> dplyr::filter(student_id == !!student_id)
      }
      if (nrow(grades) == 0) return(dplyr::tibble())

      # Enrich with names
      stud_ids <- if ("id" %in% names(students)) students$id else students$student_id %||% character(0)
      subj_ids <- if ("id" %in% names(subjects)) subjects$id else subjects$subject_id %||% character(0)
      doc_ids  <- if ("id" %in% names(doctors))  doctors$id  else doctors$doctor_id  %||% character(0)

      grades$student_name <- if (length(stud_ids) > 0) students$name[match(grades$student_id, stud_ids)] else NA_character_
      grades$subject_name <- if (length(subj_ids) > 0) subjects$name[match(grades$subject_id, subj_ids)] else NA_character_
      grades$subject_code <- if (length(subj_ids) > 0 && "code" %in% names(subjects)) subjects$code[match(grades$subject_id, subj_ids)] else NA_character_
      grades$doctor_name  <- if (length(doc_ids)  > 0) doctors$name[match(grades$doctor_id,   doc_ids)]  else NA_character_

      # Normalise column names for the Shiny gradebook table
      # web app stores: week7, week12, classwork, final, total, letter
      if ("total" %in% names(grades) && !"mark" %in% names(grades))  grades$mark  <- as.numeric(grades$total)
      if ("letter" %in% names(grades) && !"grade" %in% names(grades)) grades$grade <- grades$letter
      if (!"observations" %in% names(grades)) grades$observations <- NA_integer_

      # Optional text search
      if (!is.null(q) && nzchar(trimws(q))) {
        hay <- paste(
          as.character(grades$student_id   %||% ""),
          as.character(grades$student_name %||% ""),
          as.character(grades$subject_id   %||% ""),
          as.character(grades$subject_name %||% ""),
          as.character(grades$doctor_name  %||% ""),
          as.character(grades$grade        %||% "")
        )
        grades <- grades[grepl(q, hay, ignore.case = TRUE, perl = TRUE), , drop = FALSE]
      }

      grades
    }, error = function(e) {
      message(sprintf("load_grades (grades collection): %s", conditionMessage(e)))
      NULL
    })
    if (!is.null(out) && nrow(out) > 0) return(out)
  }

  # Fallback: compute from emotions (when grades collection is empty)
  emo <- tryCatch(load_emotions(), error = function(e) dplyr::tibble())
  if (!is.null(student_id)) emo <- emo |> dplyr::filter(student_id == !!student_id)
  if (nrow(emo) == 0) return(dplyr::tibble())

  emo <- attach_doctor_id(emo)
  agg <- emo |> dplyr::filter(!is.na(engagement_score)) |>
    dplyr::group_by(student_id, doctor_id) |>
    dplyr::summarise(mark = round(mean(engagement_score, na.rm = TRUE) * 100, 1),
                     observations = dplyr::n(), .groups = "drop")
  agg$grade        <- vapply(agg$mark, .mark_to_grade, character(1))
  agg$subject_id   <- NA_character_
  agg$subject_name <- NA_character_
  agg$student_name <- NA_character_
  agg$doctor_name  <- agg$doctor_id
  agg
}

# Call backend API /api/grades and return a tibble. If `token` is provided it
# will be sent as `Authorization: Bearer <token>` which is useful for emulator
# flows (the emulator accepts `Bearer owner`). Returns an empty tibble on
# 404/no-data.
load_grades_api <- function(base = API_URL, token = NULL, student_id = NULL, q = NULL) {
  url <- paste0(rtrim_slash(base), "/api/grades")
  params <- list()
  if (!is.null(student_id)) params$student_id <- student_id
  if (!is.null(q)) params$q <- q

  headers <- c()
  if (!is.null(token) && nzchar(token)) headers <- add_headers(Authorization = paste("Bearer", token))

  resp <- tryCatch({
    GET(url, headers, query = params)
  }, error = function(e) NULL)

  if (is.null(resp) || httr::http_error(resp)) return(dplyr::tibble())

  txt <- content(resp, as = "text", encoding = "UTF-8")
  if (!nzchar(trimws(txt))) return(dplyr::tibble())
  dat <- tryCatch(fromJSON(txt, simplifyVector = TRUE), error = function(e) NULL)
  if (is.null(dat) || length(dat) == 0) return(dplyr::tibble())

  # Ensure a tibble and proper columns
  df <- as_tibble(dat)
  # Normalize numeric-like columns if present
  if ("mark" %in% names(df)) df$mark <- as.numeric(df$mark)
  df
}

# Helper to trim trailing slash from API base
rtrim_slash <- function(x) sub("/*$", "", x)
