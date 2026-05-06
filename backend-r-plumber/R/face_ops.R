# Face encode / match — R shells out to the Python scripts in
# classroom-app-python/, which own the face_recognition + dlib stack.
#
# The venv's Python is the only one with those deps installed, so we always
# invoke $PYTHON_BIN rather than whatever `python` is on PATH.

library(jsonlite)

.scripts_dir <- function() {
  from_env <- Sys.getenv("FACE_SCRIPTS_DIR", unset = "")
  if (nzchar(from_env) && dir.exists(from_env)) {
    return(normalizePath(from_env, winslash = "/", mustWork = TRUE))
  }

  # Default to the sibling classroom-app-python folder in this repo.
  fallback <- normalizePath(file.path(getwd(), "..", "classroom-app-python"),
                            winslash = "/", mustWork = FALSE)
  if (dir.exists(fallback)) return(fallback)

  stop(
    "FACE_SCRIPTS_DIR is not set and fallback path ../classroom-app-python was not found",
    call. = FALSE
  )
}

.python_bin <- function() {
  from_env <- Sys.getenv("PYTHON_BIN", unset = "")
  if (nzchar(from_env) && file.exists(from_env)) {
    return(normalizePath(from_env, winslash = "/", mustWork = TRUE))
  }

  scripts <- .scripts_dir()
  candidates <- c(
    file.path(scripts, "venv", "Scripts", "python.exe"),
    file.path(scripts, ".venv-win", "Scripts", "python.exe"),
    file.path(scripts, ".venv", "Scripts", "python.exe")
  )

  hit <- candidates[file.exists(candidates)]
  if (length(hit) > 0) {
    return(normalizePath(hit[[1]], winslash = "/", mustWork = TRUE))
  }

  # Last resort for environments where python is available on PATH.
  py <- Sys.which("python")
  if (nzchar(py)) return(py)

  stop(
    paste(
      "required env var PYTHON_BIN is not set and no Python runtime was found.",
      "Set PYTHON_BIN to your venv python, e.g. ../classroom-app-python/venv/Scripts/python.exe"
    ),
    call. = FALSE
  )
}

#' Write raw image bytes to a temp file; returns the path.
#' Caller is responsible for cleanup (tempfile() is unlinked on session end too).
write_temp_image <- function(bytes, ext = ".jpg") {
  path <- tempfile(fileext = ext)
  writeBin(bytes, path)
  path
}

#' Run encode_face.py on `image_path` and return the 128-d encoding as a
#' numeric vector. Errors bubble up as api_error with the JSON reason.
encode_face <- function(image_path) {
  out <- suppressWarnings(system2(
    .python_bin(),
    args = c(shQuote(file.path(.scripts_dir(), "encode_face.py")),
             shQuote(image_path)),
    stdout = TRUE, stderr = TRUE
  ))
  text <- paste(out, collapse = "\n")
  parsed <- tryCatch(jsonlite::fromJSON(text), error = function(e) NULL)
  if (is.null(parsed)) stop(api_error(500, sprintf("encode_face failed: %s", text)))
  if (!is.null(parsed$error)) {
    msg <- switch(parsed$error,
                  no_face = "no face detected in the photo",
                  multiple_faces = "multiple faces detected — enrollment photos must have exactly one",
                  parsed$error)
    stop(api_error(400, msg))
  }
  as.numeric(parsed$encoding)
}

#' Run match_face.py with a list of candidate {user_id, encoding} entries.
#' Returns list(user_id, distance) on match, or list(error, best_distance) on no-match.
match_face <- function(image_path, candidates) {
  cand_path <- tempfile(fileext = ".json")
  writeLines(jsonlite::toJSON(candidates, auto_unbox = TRUE), cand_path)
  on.exit(unlink(cand_path), add = TRUE)

  out <- suppressWarnings(system2(
    .python_bin(),
    args = c(shQuote(file.path(.scripts_dir(), "match_face.py")),
             shQuote(image_path), shQuote(cand_path)),
    stdout = TRUE, stderr = TRUE
  ))
  text <- paste(out, collapse = "\n")
  parsed <- tryCatch(jsonlite::fromJSON(text), error = function(e) NULL)
  if (is.null(parsed)) stop(api_error(500, sprintf("match_face failed: %s", text)))
  parsed
}