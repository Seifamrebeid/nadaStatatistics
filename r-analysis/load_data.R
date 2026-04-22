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

load_from_csv <- function(path = CSV_PATH) {
  if (!file.exists(path)) stop(sprintf("CSV not found at %s", path))
  readr::read_csv(path, show_col_types = FALSE) |> .normalise_emotions()
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
  if (length(docs) == 0) return(dplyr::tibble())
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
  df |> mutate(doctor_id = unname(mapping[lecture_id]) |>
                 dplyr::coalesce("doc_unknown"))
}

# Convenience for scripts.
plot_dir <- function() {
  d <- "plots"
  if (!dir.exists(d)) dir.create(d, recursive = TRUE)
  d
}
