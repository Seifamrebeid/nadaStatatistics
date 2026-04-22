# Entry point — `Rscript run_api.R`
#
# Reads env from .Renviron (which R loads automatically when started from the
# project root), boots Plumber on $PLUMBER_PORT (default 8000), streams logs
# to stdout so you can see requests land.

# Point R at the user library (first-time installs landed there on Windows).
user_lib <- file.path(Sys.getenv("LOCALAPPDATA"), "R", "win-library", "4.5")
if (dir.exists(user_lib)) .libPaths(c(user_lib, .libPaths()))

suppressPackageStartupMessages({
  library(plumber)
  library(logger)
})

log_threshold(INFO)
log_formatter(formatter_glue)

port <- as.integer(Sys.getenv("PLUMBER_PORT", unset = "8000"))
host <- "0.0.0.0"   # listen on all interfaces so mobile apps on the LAN can reach us

log_info("starting plumber on {host}:{port} (mode: {if (nzchar(Sys.getenv('FIRESTORE_EMULATOR_HOST'))) 'emulator' else 'prod'})")

pr <- pr("plumber.R")
pr_run(pr, host = host, port = port, docs = "swagger")
