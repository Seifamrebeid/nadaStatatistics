# GCP OAuth2 token minting from a service-account JSON.
#
# Used by firestore.R when running in prod mode. We sign a JWT with the
# service-account private key and exchange it at oauth2.googleapis.com/token
# for a short-lived (1h) access token, scoped to Firestore + Cloud Platform.

library(openssl)
library(httr)
library(jsonlite)

.gcp_token_cache <- new.env(parent = emptyenv())

#' Path to the service-account JSON.
.gcp_sa_path <- function() {
  p <- Sys.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", unset = "")
  if (!nzchar(p)) p <- Sys.getenv("GOOGLE_APPLICATION_CREDENTIALS", unset = "")
  if (!nzchar(p)) stop("FIREBASE_SERVICE_ACCOUNT_JSON not set in .Renviron")
  if (!file.exists(p)) stop(sprintf("service-account JSON not found at: %s", p))
  p
}

#' Read + cache the service-account JSON contents.
.gcp_sa <- function() {
  if (is.null(.gcp_token_cache$sa)) {
    .gcp_token_cache$sa <- jsonlite::fromJSON(.gcp_sa_path())
  }
  .gcp_token_cache$sa
}

#' base64url (no padding, +/ -> -_) — required by JWT spec.
.b64url <- function(x) {
  s <- openssl::base64_encode(x)
  s <- gsub("=+$", "", s)
  s <- chartr("+/", "-_", s)
  s
}

#' Build + sign a JWT bearer assertion for the OAuth2 token endpoint.
.gcp_signed_assertion <- function() {
  sa <- .gcp_sa()
  now <- as.integer(Sys.time())

  header <- list(alg = "RS256", typ = "JWT", kid = sa$private_key_id)
  claims <- list(
    iss   = sa$client_email,
    scope = "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform",
    aud   = "https://oauth2.googleapis.com/token",
    iat   = now,
    exp   = now + 3600
  )

  h_b64 <- .b64url(charToRaw(jsonlite::toJSON(header, auto_unbox = TRUE)))
  c_b64 <- .b64url(charToRaw(jsonlite::toJSON(claims, auto_unbox = TRUE)))
  signing_input <- paste0(h_b64, ".", c_b64)

  # read_key on a raw vector defaults to DER; force PEM by passing the
  # character string so it goes down the file-or-text branch (which sniffs
  # the "-----BEGIN" marker).
  key <- openssl::read_key(sa$private_key)
  sig <- openssl::signature_create(charToRaw(signing_input), sha256, key = key)
  paste0(signing_input, ".", .b64url(sig))
}

#' Return a valid OAuth2 access token, refreshing if expired (60s safety margin).
gcp_access_token <- function() {
  cached <- .gcp_token_cache$token
  cached_exp <- .gcp_token_cache$expires_at %||% 0
  if (!is.null(cached) && Sys.time() < cached_exp - 60) {
    return(cached)
  }

  assertion <- .gcp_signed_assertion()
  resp <- httr::POST(
    "https://oauth2.googleapis.com/token",
    body = list(
      grant_type = "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion  = assertion
    ),
    encode  = "form",
    httr::timeout(30)
  )
  if (httr::http_error(resp)) {
    stop(sprintf("OAuth2 token exchange failed: %s",
                 httr::content(resp, as = "text", encoding = "UTF-8")))
  }
  data <- jsonlite::fromJSON(httr::content(resp, as = "text", encoding = "UTF-8"))
  .gcp_token_cache$token <- data$access_token
  .gcp_token_cache$expires_at <- Sys.time() + as.numeric(data$expires_in %||% 3600)
  data$access_token
}
