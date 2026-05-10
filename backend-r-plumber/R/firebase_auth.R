# Firebase Auth admin operations — create user, mint custom token.
#
# Emulator mode: hit the local Identity Toolkit REST API at
#   http://<FIREBASE_AUTH_EMULATOR_HOST>/identitytoolkit.googleapis.com/v1/...
# Custom tokens in the emulator are accepted with alg="none" + a fake signature.
#
# Prod mode: not implemented yet (Chunk C / Phase 10 cutover).

library(httr)
library(jsonlite)
library(openssl)

.auth_base_url <- function() {
  if (is_emulator()) {
    sprintf("http://%s/identitytoolkit.googleapis.com/v1",
            Sys.getenv("FIREBASE_AUTH_EMULATOR_HOST"))
  } else {
    "https://identitytoolkit.googleapis.com/v1"
  }
}

# In emulator mode the key is ignored, but the endpoint still requires it.
.auth_key <- function() {
  if (is_emulator()) "fake-api-key" else require_env("FIREBASE_WEB_API_KEY")
}

#' Create a Firebase Auth user. Returns the new uid.
#' `email` is required; `password` optional (the emulator allows passwordless).
create_auth_user <- function(email, password = NULL, display_name = NULL) {
  url <- sprintf("%s/accounts:signUp?key=%s", .auth_base_url(), .auth_key())
  body <- list(email = email, returnSecureToken = TRUE)
  if (!is.null(password))     body$password    <- password
  if (!is.null(display_name)) body$displayName <- display_name
  resp <- POST(url, body = jsonlite::toJSON(body, auto_unbox = TRUE),
               content_type_json())
  if (http_error(resp)) {
    stop(sprintf("create_auth_user failed: %s",
                 content(resp, "text", encoding = "UTF-8")))
  }
  jsonlite::fromJSON(content(resp, "text", encoding = "UTF-8"))$localId
}

#' Soft-delete is handled on the Firestore doc side (active=false).
#' This hard-deletes the Auth user — only use when reversing a mistake.
delete_auth_user <- function(uid) {
  url <- sprintf("%s/accounts:delete?key=%s", .auth_base_url(), .auth_key())
  resp <- POST(url, body = jsonlite::toJSON(list(localId = uid), auto_unbox = TRUE),
               content_type_json())
  invisible(!http_error(resp))
}

# ---- Custom tokens ----

#' Base64url encode (no padding) — what JWT uses.
.b64url <- function(bytes) {
  if (is.character(bytes)) bytes <- charToRaw(bytes)
  s <- openssl::base64_encode(bytes)
  s <- gsub("=+$", "", s)
  s <- chartr("+/", "-_", s)
  s
}

#' Mint a Firebase custom token for a given uid.
#'
#' Emulator: alg="none" (empty signature), iss/sub use the emulator pseudo-account.
#' Prod:     RS256-signed with the service-account private key, iss/sub set to
#'           the service-account client_email. Firebase Auth accepts only this
#'           shape from `signInWithCustomToken`.
mint_custom_token <- function(uid, claims = list()) {
  now <- as.integer(Sys.time())

  if (is_emulator()) {
    header <- list(alg = "none", typ = "JWT")
    payload <- list(
      iss = "firebase-adminsdk-emulator@system.gserviceaccount.com",
      sub = "firebase-adminsdk-emulator@system.gserviceaccount.com",
      aud = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
      iat = now,
      exp = now + 3600,
      uid = uid,
      claims = claims
    )
    h <- .b64url(jsonlite::toJSON(header,  auto_unbox = TRUE))
    p <- .b64url(jsonlite::toJSON(payload, auto_unbox = TRUE))
    return(paste(h, p, "", sep = "."))
  }

  # Prod — RS256-signed custom token using the service account.
  sa <- .gcp_sa()
  header <- list(alg = "RS256", typ = "JWT", kid = sa$private_key_id)
  payload <- list(
    iss = sa$client_email,
    sub = sa$client_email,
    aud = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat = now,
    exp = now + 3600,
    uid = uid,
    claims = claims
  )
  h <- .b64url(jsonlite::toJSON(header,  auto_unbox = TRUE))
  p <- .b64url(jsonlite::toJSON(payload, auto_unbox = TRUE))
  signing_input <- paste0(h, ".", p)
  key <- openssl::read_key(sa$private_key)
  sig <- openssl::signature_create(charToRaw(signing_input), sha256, key = key)
  paste0(signing_input, ".", .b64url(sig))
}