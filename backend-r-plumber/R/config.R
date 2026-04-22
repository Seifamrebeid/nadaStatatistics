# Config helpers — tiny wrappers around Sys.getenv so routes stay readable.

#' Return env var, erroring if unset (for required config).
require_env <- function(name) {
  v <- Sys.getenv(name, unset = "")
  if (nzchar(v)) return(v)
  stop(sprintf("required env var %s is not set", name), call. = FALSE)
}

#' Return env var, falling back to a default.
env_or <- function(name, default = "") {
  v <- Sys.getenv(name, unset = "")
  if (nzchar(v)) v else default
}

#' TRUE when the backend is talking to the local emulator suite.
is_emulator <- function() {
  nzchar(Sys.getenv("FIRESTORE_EMULATOR_HOST"))
}
