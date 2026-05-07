user_lib <- file.path(Sys.getenv("LOCALAPPDATA"), "R", "win-library", "4.5")
if (dir.exists(user_lib)) .libPaths(c(user_lib, .libPaths()))
readRenviron(".Renviron")
source("R/config.R", local = FALSE)
source("R/gcp_oauth.R", local = FALSE)
source("R/firestore.R", local = FALSE)

cat("project: ", Sys.getenv("FIREBASE_PROJECT_ID"), "\n")
cat("emulator?", is_emulator(), "\n")
cat("base url: ", fs_base_url(), "\n")

tk <- tryCatch(gcp_access_token(),
               error = function(e) sprintf("TOKEN ERR: %s", conditionMessage(e)))
cat("token preview:", substr(tk, 1, 30), "len=", nchar(tk), "\n")

doc <- tryCatch(fs_get("users/hueb1bOwngczkGtdWx1GU3AJokEG"),
                error = function(e) sprintf("FS_GET ERR: %s", conditionMessage(e)))
cat("--- doc ---\n")
str(doc)
