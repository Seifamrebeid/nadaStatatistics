# Small utilities shared across routes.

library(uuid)

# null-coalesce — used everywhere; defined here so all source files can rely on it.
`%||%` <- function(a, b) if (is.null(a) || length(a) == 0) b else a

#' Generate a short ID with a type prefix, e.g. new_id("stu") -> "stu_a3f4b1".
new_id <- function(prefix) {
  paste0(prefix, "_", substr(gsub("-", "", uuid::UUIDgenerate()), 1, 10))
}

#' Current UTC timestamp in ISO-8601.
now_iso <- function() format(Sys.time(), "%Y-%m-%dT%H:%M:%OSZ", tz = "UTC")

#' Read a full Firestore collection and return a data.frame keyed by doc id.
#' Each row has one column per field. List-valued fields (e.g. face_encoding
#' with 128 doubles) stay as list columns so they don't explode into many rows.
fs_collection_df <- function(collection) {
  docs <- fs_list(collection)
  if (length(docs) == 0) return(data.frame())
  rows <- lapply(docs, function(d) {
    id <- sub(".*/", "", d$name)
    fields <- fs_unwrap_fields(d$fields)
    c(list(id = id), fields)
  })
  all_cols <- unique(unlist(lapply(rows, names)))
  # Build the data.frame column-by-column so list columns survive.
  cols <- lapply(all_cols, function(col) {
    vals <- lapply(rows, function(r) r[[col]])
    # If every present value is length-1 atomic, collapse to a vector.
    is_scalar <- vapply(vals, function(v) {
      is.null(v) || (is.atomic(v) && length(v) == 1)
    }, logical(1))
    if (all(is_scalar)) {
      out <- rep(NA, length(vals))
      non_null <- which(!vapply(vals, is.null, logical(1)))
      for (i in non_null) out[[i]] <- vals[[i]]
      return(out)
    }
    I(vals)   # preserve as list column
  })
  names(cols) <- all_cols
  as.data.frame(cols, stringsAsFactors = FALSE, check.names = FALSE)
}

#' Extract a raw uploaded file from a plumber multipart request.
#' Plumber parses multipart/form-data via webutils and puts file uploads in
#' `req$body` keyed by field name. Each entry has `$value` (raw bytes) and
#' `$filename`. Returns `list(bytes = raw, filename = chr)` or NULL.
get_uploaded_file <- function(req, field = "file") {
  body <- req$body %||% list()
  entry <- body[[field]]
  if (is.null(entry)) return(NULL)
  # webutils returns either raw bytes directly, or a list with $value for uploads
  if (is.raw(entry)) return(list(bytes = entry, filename = NA_character_))
  if (is.list(entry) && !is.null(entry$value)) {
    return(list(bytes = entry$value,
                filename = entry$filename %||% NA_character_))
  }
  NULL
}

#' Shallow-merge two named lists; `b` wins on conflict.
merge_lists <- function(a, b) {
  for (n in names(b)) a[[n]] <- b[[n]]
  a
}

#' Drop list entries whose value is NULL or NA.
drop_empty <- function(x) x[!vapply(x, function(v) is.null(v) || (length(v) == 1 && is.na(v)), logical(1))]
