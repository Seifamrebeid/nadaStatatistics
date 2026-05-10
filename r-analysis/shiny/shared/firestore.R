# Firestore REST client — emulator-first, prod-fallback.
# Vendored into r-analysis/shiny/ so the app does not depend on backend-r-plumber.
#
# Set in .Renviron (or the Shiny env):
#   FIREBASE_PROJECT_ID=fridgechef-jt50c
#   FIRESTORE_EMULATOR_HOST=localhost:8080      # emulator mode
# OR for prod:
#   FIREBASE_SERVICE_ACCOUNT_JSON=/abs/path/to/sa.json

suppressPackageStartupMessages({
  library(httr)
  library(jsonlite)
})

`%||%` <- function(a, b) if (is.null(a)) b else a

is_emulator <- function() nzchar(Sys.getenv("FIRESTORE_EMULATOR_HOST"))

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

# Cached service-account token for prod.
.token_cache <- new.env(parent = emptyenv())

gcp_access_token <- function() {
  if (!requireNamespace("openssl", quietly = TRUE) ||
      !requireNamespace("jose", quietly = TRUE)) {
    stop("openssl + jose packages required for production Firestore access")
  }
  now <- as.numeric(Sys.time())
  if (!is.null(.token_cache$token) && !is.null(.token_cache$expires_at) &&
      now < .token_cache$expires_at - 60) {
    return(.token_cache$token)
  }
  sa_path <- Sys.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", unset = "")
  if (!nzchar(sa_path) || !file.exists(sa_path)) {
    stop(sprintf("service account file not found: %s", sa_path))
  }
  sa <- jsonlite::fromJSON(sa_path, simplifyVector = FALSE)
  iat <- floor(now); exp <- iat + 3600L
  claims <- jose::jwt_claim(
    iss = sa$client_email,
    scope = "https://www.googleapis.com/auth/datastore",
    aud = "https://oauth2.googleapis.com/token",
    iat = iat, exp = exp
  )
  key <- openssl::read_key(gsub("\\\\n", "\n", sa$private_key))
  jwt <- jose::jwt_encode_sig(claims, key = key, size = 256)
  resp <- httr::POST(
    "https://oauth2.googleapis.com/token",
    body = list(grant_type = "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion = jwt),
    encode = "form"
  )
  if (httr::http_error(resp)) {
    stop(sprintf("token exchange failed: %s",
                 httr::content(resp, as = "text", encoding = "UTF-8")))
  }
  tok <- httr::content(resp, as = "parsed", encoding = "UTF-8")
  .token_cache$token <- tok$access_token
  .token_cache$expires_at <- now + as.numeric(tok$expires_in %||% 3600)
  .token_cache$token
}

# ---- Field unwrap ----

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

fs_unwrap_fields <- function(fields) {
  if (is.null(fields)) return(list())
  lapply(fields, fs_value)
}

# ---- Read-only HTTP ----

.fs_req <- function(method, path, query = list()) {
  url <- paste0(fs_base_url(), "/", path)
  resp <- httr::VERB(method, url, fs_auth_header(), query = query)
  if (httr::http_error(resp)) {
    stop(sprintf("Firestore %s %s failed: %s", method, path,
                 httr::content(resp, as = "text", encoding = "UTF-8")))
  }
  jsonlite::fromJSON(httr::content(resp, as = "text", encoding = "UTF-8"),
                     simplifyVector = FALSE)
}

fs_get <- function(path) .fs_req("GET", path)

fs_list <- function(collection, page_size = 300, max_docs = NULL) {
  out <- list(); token <- NULL
  repeat {
    q <- list(pageSize = page_size)
    if (!is.null(token)) q$pageToken <- token
    resp <- .fs_req("GET", collection, query = q)
    if (!is.null(resp$documents)) out <- c(out, resp$documents)
    if (!is.null(max_docs) && length(out) >= max_docs) {
      out <- out[seq_len(max_docs)]; break
    }
    token <- resp$nextPageToken
    if (is.null(token)) break
  }
  out
}
