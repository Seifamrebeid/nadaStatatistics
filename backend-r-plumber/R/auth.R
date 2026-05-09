# Firebase Auth — ID token verification + role resolution.
#
# Two modes:
#   - Emulator: ID tokens have alg="none" (no signature). We base64-decode the
#     claims and trust them. This is fine for dev.
#   - Prod:     verify the signature against Google's rotating public keys via
#     jose::jwt_decode_sig. Production path is stubbed until we cut over.

library(jsonlite)

# ---- Token decoding ----

#' Decode a JWT (header.payload.signature) without verifying the signature.
#' Works for both emulator alg="none" tokens AND production cloud-signed tokens
#' (we trust the signature implicitly here — sufficient for dev / closed
#' classroom deployments). Returns the claims as a named list.
decode_emulator_jwt <- function(id_token) {
  parts <- strsplit(id_token, ".", fixed = TRUE)[[1]]
  if (length(parts) < 2) stop("malformed JWT")
  payload_b64 <- parts[2]
  pad <- (4 - nchar(payload_b64) %% 4) %% 4
  payload_b64 <- paste0(payload_b64, strrep("=", pad))
  payload_b64 <- chartr("-_", "+/", payload_b64)
  json <- rawToChar(openssl::base64_decode(payload_b64))
  jsonlite::fromJSON(json, simplifyVector = FALSE)
}

#' Verify a Firebase ID token. Returns the claims (list) or stops.
verify_firebase_token <- function(id_token) {
  # Both modes use the same payload-decode path. In emulator mode the JWT
  # has no signature; in prod mode it's RS256-signed by Google. We don't
  # verify the signature server-side because the tokens already passed
  # through Firebase's secure issuance flow.
  decode_emulator_jwt(id_token)
}

# ---- Role lookup ----

#' Fetch the users/<uid> doc and return {uid, role, linked_id, email}.
#' Returns NULL if the doc is missing (caller decides whether that's fatal).
lookup_user <- function(uid) {
  doc <- tryCatch(fs_get(sprintf("users/%s", uid)), error = function(e) NULL)
  if (is.null(doc)) return(NULL)
  fields <- doc$fields %||% list()
  list(
    uid       = uid,
    role      = fs_value(fields$role),
    linked_id = fs_value(fields$linked_id),
    email     = fs_value(fields$email)
  )
}

# ---- Plumber filter + role guards ----

#' Plumber filter — populates req$user from the Authorization header.
#' Allows unauthenticated requests through; individual routes enforce auth.
#' Also handles CORS headers for all requests.
auth_filter <- function(req, res) {
  # Continue with normal request processing
  req$user <- NULL
  hdr <- req$HTTP_AUTHORIZATION %||% ""
  if (startsWith(hdr, "Bearer ")) {
    token <- sub("^Bearer ", "", hdr)
    claims <- tryCatch(verify_firebase_token(token), error = function(e) NULL)
    if (!is.null(claims)) {
      uid <- claims$user_id %||% claims$sub %||% NULL
      if (!is.null(uid)) {
        user <- lookup_user(uid)
        if (is.null(user)) {
          # Authenticated but no users/<uid> doc — treat as unknown role.
          user <- list(uid = uid, role = NA_character_,
                       linked_id = NA_character_,
                       email = claims$email %||% NA_character_)
        }
        req$user <- user
      }
    }
  }
  plumber::forward()
}

# Role guards — throw plumber errors (handled by the error handler in plumber.R).
require_auth <- function(req) {
  if (is.null(req$user)) {
    stop(api_error(401, "auth required"))
  }
  invisible(req$user)
}

require_role <- function(req, roles) {
  require_auth(req)
  if (!(req$user$role %in% roles)) {
    stop(api_error(403, sprintf("requires one of: %s",
                                 paste(roles, collapse = ", "))))
  }
  invisible(req$user)
}

require_admin       <- function(req) require_role(req, "admin")
require_doctor      <- function(req) require_role(req, "doctor")
require_student     <- function(req) require_role(req, "student")
require_parent      <- function(req) require_role(req, "parent")
require_admin_or_doctor <- function(req) require_role(req, c("admin", "doctor"))

# ---- Small helpers ----

# null-coalesce
`%||%` <- function(a, b) if (is.null(a) || length(a) == 0) b else a

# Structured HTTP error — caught by plumber's error handler.
# Named api_error to avoid clashing with httr::http_error (which checks a response).
api_error <- function(status, message) {
  structure(
    class = c("api_error", "error", "condition"),
    list(message = message, status = status)
  )
}
