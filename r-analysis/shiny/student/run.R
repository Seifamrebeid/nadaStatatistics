setwd(dirname(normalizePath(sys.frame(0)$ofile, mustWork = FALSE)))
shiny::runApp(".", port = 3840, launch.browser = TRUE)
