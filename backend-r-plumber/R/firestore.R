# Firestore REST client — thin wrapper over httr.
#
# Emulator mode: base URL points at localhost, auth header is "Bearer owner".
# Prod mode:     base URL is googleapis.com, auth is an OAuth2 token minted
#                from the service account (not implemented in Chunk A).

library(httr)
library(jsonlite)

# ---- Base URL + auth ----

fs_project <- function() {
  p <- Sys.getenv("FIREBASE_PROJECT_ID", unset = "")
  if (!nzchar(p)) stop("FIREBASE_PROJECT_ID not set")
  p
}

fs_base_url <- function() {
  if (is_emulator()) {
    sprintf("http://%s/v1/projects/%s/databases/(default)/documents",
            Sys.getenv("FIRESTORE_EMULATOR_HOST"), fs_project())
  } else {
    sprintf("https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents",
            fs_project())
  }
}

fs_auth_header <- function() {
  if (is_emulator()) {
    add_headers(Authorization = "Bearer owner")
  } else {
    add_headers(Authorization = paste("Bearer", gcp_access_token()))
  }
}

# ---- Typed value <-> R value ----

# Firestore encodes fields as {stringValue, integerValue, doubleValue, booleanValue,
# timestampValue, nullValue, arrayValue: {values: [...]}, mapValue: {fields: {...}}}.

#' Unwrap a Firestore typed field to a plain R value.
#' Lists / maps recurse.
fs_value <- function(field) {
  if (is.null(field)) return(NULL)
  if (!is.null(field$nullValue))      return(NA)
  if (!is.null(field$stringValue))    return(field$stringValue)
  if (!is.null(field$booleanValue))   return(field$booleanValue)
  if (!is.null(field$integerValue))   return(as.numeric(field$integerValue))
  if (!is.null(field$doubleValue))    return(as.numeric(field$doubleValue))
  if (!is.null(field$timestampValue)) return(field$timestampValue)
  if (!is.null(field$arrayValue)) {
    vals <- field$arrayValue$values %||% list()
    return(lapply(vals, fs_value))
  }
  if (!is.null(field$mapValue)) {
    fl <- field$mapValue$fields %||% list()
    return(lapply(fl, fs_value))
  }
  NULL
}

#' Encode an R value as a typed Firestore field.
fs_encode <- function(v) {
  if (is.null(v) || (length(v) == 1 && is.na(v))) {
    return(list(nullValue = NULL))
  }
  if (is.logical(v) && length(v) == 1)   return(list(booleanValue = v))
  if (is.numeric(v) && length(v) == 1) {
    if (v == trunc(v) && abs(v) < 2^53) return(list(integerValue = as.character(as.integer(v))))
    return(list(doubleValue = v))
  }
  if (is.character(v) && length(v) == 1) return(list(stringValue = v))
  if (is.list(v)) {
    # Heuristic — a named list becomes a mapValue, an unnamed list becomes an arrayValue.
    if (!is.null(names(v)) && all(nzchar(names(v)))) {
      return(list(mapValue = list(fields = lapply(v, fs_encode))))
    }
    return(list(arrayValue = list(values = lapply(v, fs_encode))))
  }
  if (is.vector(v) && length(v) > 1) {
    return(list(arrayValue = list(values = lapply(v, fs_encode))))
  }
  stop(sprintf("fs_encode: unsupported value of class %s", class(v)[1]))
}

#' Convert a plain named list -> Firestore fields object.
fs_fields <- function(data) lapply(data, fs_encode)

#' Unwrap a whole Firestore doc's `fields` to a plain named list of R values.
fs_unwrap_fields <- function(fields) {
  if (is.null(fields)) return(list())
  lapply(fields, fs_value)
}

# ---- CRUD ----

.fs_req <- function(method, path, body = NULL, query = list()) {
  url <- paste0(fs_base_url(), "/", path)
  args <- list(url, fs_auth_header(), query = query)
  if (!is.null(body)) {
    args <- c(args, list(body = jsonlite::toJSON(body, auto_unbox = TRUE, null = "null"),
                         content_type_json()))
  }
  resp <- do.call(VERB, c(list(verb = method), args))
  if (httr::http_error(resp)) {
    stop(sprintf("Firestore %s %s failed: %s", method, path,
                 content(resp, as = "text", encoding = "UTF-8")))
  }
  jsonlite::fromJSON(content(resp, as = "text", encoding = "UTF-8"), simplifyVector = FALSE)
}

#' Fetch a document. Returns the raw Firestore doc (with $name, $fields, ...).
fs_get <- function(path) {
  .fs_req("GET", path)
}

#' List documents in a collection. Returns a list of raw Firestore docs.
fs_list <- function(collection, page_size = 300) {
  out <- list()
  token <- NULL
  repeat {
    q <- list(pageSize = page_size)
    if (!is.null(token)) q$pageToken <- token
    resp <- .fs_req("GET", collection, query = q)
    if (!is.null(resp$documents)) out <- c(out, resp$documents)
    token <- resp$nextPageToken
    if (is.null(token)) break
  }
  out
}

#' Create a document with a caller-provided id at collection/<id>.
fs_create_at <- function(collection, doc_id, data) {
  body <- list(fields = fs_fields(data))
  .fs_req("POST", collection, body = body, query = list(documentId = doc_id))
}

#' Create a document with a server-generated id.
fs_create <- function(collection, data) {
  body <- list(fields = fs_fields(data))
  .fs_req("POST", collection, body = body)
}

#' Patch (merge) fields into an existing document.
fs_update <- function(path, data) {
  body <- list(fields = fs_fields(data))
  mask <- paste0("updateMask.fieldPaths=", URLencode(names(data)), collapse = "&")
  url <- paste0(fs_base_url(), "/", path, "?", mask)
  resp <- PATCH(url, fs_auth_header(),
                body = jsonlite::toJSON(body, auto_unbox = TRUE, null = "null"),
                content_type_json())
  if (httr::http_error(resp)) {
    stop(sprintf("Firestore PATCH %s failed: %s", path,
                 content(resp, as = "text", encoding = "UTF-8")))
  }
  jsonlite::fromJSON(content(resp, as = "text", encoding = "UTF-8"), simplifyVector = FALSE)
}

#' Delete a document.
fs_delete <- function(path) {
  .fs_req("DELETE", path)
  invisible(NULL)
}

