# Launch the unified analytics dashboard.
#
# Usage (from repo root):
#   Rscript r-analysis/shiny/run_shiny.R
#
# Reads r-analysis/shiny/.Renviron for emulator config.

.this <- tryCatch(sys.frame(1)$ofile, error = function(e) NULL)
if (is.null(.this) || !nzchar(.this)) .this <- "r-analysis/shiny/run_shiny.R"
setwd(dirname(normalizePath(.this, mustWork = FALSE)))
shiny::runApp(".", port = 3838, launch.browser = TRUE)
