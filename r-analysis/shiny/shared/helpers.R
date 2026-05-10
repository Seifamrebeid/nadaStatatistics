# ── Shared helpers (sourced by each role app) ─────────────────────────────

`%||%` <- function(x, y) {
  if (is.null(x)) y else x
}

recommendation_text_r <- function(attention, mark = NA_real_, grade = NA_character_, attendance_rate = NA_real_) {
  recs <- character(0)
  if (!is.na(mark) && mark < 70) {
    recs <- c(recs, "Review the last lecture notes and retry the hardest exercises.")
  }
  if (!is.na(attendance_rate) && attendance_rate < 0.8) {
    recs <- c(recs, "Improve attendance to protect your grade trend.")
  }
  if (!is.na(attention) && attention < 50) {
    recs <- c(recs, "Reduce distractions and keep the camera view centered on you.")
  } else if (!is.na(attention) && attention < 70) {
    recs <- c(recs, "Stay active: ask questions or follow along with the lecturer.")
  }
  if (!is.na(grade) && grade %in% c("D", "D-", "F")) {
    recs <- c(recs, "Schedule a quick revision plan with your doctor/teacher.")
  }
  if (length(recs) == 0) {
    recs <- c(recs, "Maintain your current habits and keep the momentum going.")
  }
  recs
}


.have_fs <- function() {
  nzchar(Sys.getenv("FIRESTORE_EMULATOR_HOST", unset = "")) ||
    nzchar(Sys.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", unset = ""))
}

.fs_rows <- function(coll) {
  if (!.have_fs()) return(dplyr::tibble())
  tryCatch({
    root <- .find_repo_root()
    if (is.na(root) || is.null(root)) return(dplyr::tibble())
    source(file.path(root, "backend-r-plumber", "R", "config.R"), local = FALSE)
    source(file.path(root, "backend-r-plumber", "R", "firestore.R"), local = FALSE)
    docs <- fs_list(coll)
    if (!length(docs)) return(dplyr::tibble())
    rows <- lapply(docs, function(d) {
      flat <- tryCatch(fs_unwrap_fields(d$fields), error = function(e) list())
      doc_id <- basename(as.character(d[["name"]] %||% ""))
      flat <- lapply(flat, function(x) {
        if (is.null(x) || length(x) == 0) return(NA)
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

# ============================================================ Theme =========

# Donut / pie helper (requires plotly)
.pie <- function(df, label_col, value_col, palette = CHART_PALETTE) {
  plot_ly(df,
          labels = stats::as.formula(paste0('~', label_col)),
          values = stats::as.formula(paste0('~', value_col)),
          type   = 'pie', hole = 0.55, sort = FALSE,
          textinfo = 'label+percent',
          marker = list(colors = palette, line = list(color = '#ffffff', width = 1))) |>
    plotly::layout(showlegend = TRUE) |>
    style_plotly()
}
