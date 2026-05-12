# Firebase email/password sign-in for the Shiny dashboard.
#
# Talks to the local Auth emulator (FIREBASE_AUTH_EMULATOR_HOST, default
# localhost:9099) or to production Identity Toolkit if FIREBASE_WEB_API_KEY
# is set.

suppressPackageStartupMessages({
  library(httr); library(jsonlite)
})

`%||%` <- function(a, b) if (is.null(a)) b else a

# Detect emulator mode by EITHER the explicit auth host OR the firestore one
# (the two go together in our setup; default auth port is 9099).
.auth_emulator_host <- function() {
  h <- Sys.getenv("FIREBASE_AUTH_EMULATOR_HOST", unset = "")
  if (nzchar(h)) return(h)
  if (nzchar(Sys.getenv("FIRESTORE_EMULATOR_HOST", unset = ""))) {
    return("localhost:9099")
  }
  ""
}

.auth_base_url <- function() {
  host <- .auth_emulator_host()
  if (nzchar(host)) {
    sprintf("http://%s/identitytoolkit.googleapis.com/v1", host)
  } else {
    "https://identitytoolkit.googleapis.com/v1"
  }
}

.auth_api_key <- function() {
  # Emulator accepts any non-empty key; prod requires the real Web API Key.
  if (nzchar(.auth_emulator_host())) {
    Sys.getenv("FIREBASE_WEB_API_KEY", unset = "fake-api-key")
  } else {
    Sys.getenv("FIREBASE_WEB_API_KEY", unset = "")
  }
}

# Sign in. Returns a list with $ok and either ($uid, $email, $idToken)
# or ($error).
firebase_signin <- function(email, password) {
  key <- .auth_api_key()
  if (!nzchar(key)) {
    return(list(ok = FALSE,
                error = "FIREBASE_WEB_API_KEY is not set (production mode)"))
  }
  url <- sprintf("%s/accounts:signInWithPassword?key=%s", .auth_base_url(), key)
  resp <- tryCatch(
    httr::POST(
      url,
      body = list(email = email, password = password, returnSecureToken = TRUE),
      encode = "json",
      httr::timeout(10)
    ),
    error = function(e) NULL
  )
  if (is.null(resp)) {
    return(list(ok = FALSE, error = "Auth server unreachable. Is the emulator running?"))
  }
  body <- tryCatch(
    jsonlite::fromJSON(httr::content(resp, as = "text", encoding = "UTF-8"),
                       simplifyVector = FALSE),
    error = function(e) NULL
  )
  if (httr::http_error(resp) || !is.null(body$error)) {
    msg <- body$error$message %||% "Sign-in failed"
    # Emulator returns messages like "INVALID_PASSWORD", "EMAIL_NOT_FOUND".
    pretty <- switch(msg,
      INVALID_PASSWORD = "Wrong password.",
      EMAIL_NOT_FOUND  = "No account with that email.",
      INVALID_EMAIL    = "Invalid email format.",
      USER_DISABLED    = "Account disabled.",
      msg
    )
    return(list(ok = FALSE, error = pretty))
  }
  list(
    ok      = TRUE,
    uid     = body$localId,
    email   = body$email,
    idToken = body$idToken
  )
}

# After sign-in: look up users/{uid} -> role. Returns the role string or NULL.
# Walks up from CWD to find the repo root, then sources the vendored firestore.R.
.find_repo_root_auth <- function(start = getwd()) {
  d <- normalizePath(start, winslash = "/", mustWork = FALSE)
  repeat {
    if (file.exists(file.path(d, "r-analysis", "shiny", "shared", "firestore.R"))) return(d)
    if (dir.exists(file.path(d, ".git"))) return(d)
    parent <- dirname(d); if (parent == d) return(NA_character_); d <- parent
  }
}

firebase_role <- function(uid) {
  prof <- firebase_user_profile(uid)
  if (is.null(prof)) NULL else prof$role
}

# Full user profile (role + linked_id) from users/{uid}.
firebase_user_profile <- function(uid) {
  if (is.null(uid) || !nzchar(uid)) return(NULL)
  tryCatch({
    root <- .find_repo_root_auth()
    if (is.na(root)) stop("could not find repo root for firestore.R")
    fs_path <- file.path(root, "r-analysis", "shiny", "shared", "firestore.R")
    if (!file.exists(fs_path)) stop(sprintf("missing %s", fs_path))
    source(fs_path, local = FALSE)
    doc <- fs_get(sprintf("users/%s", uid))
    fields <- doc$fields
    if (is.null(fields)) return(NULL)
    list(
      uid       = uid,
      role      = fields$role$stringValue,
      linked_id = fields$linked_id$stringValue
    )
  }, error = function(e) {
    message(sprintf("firebase_user_profile: %s", conditionMessage(e)))
    NULL
  })
}
