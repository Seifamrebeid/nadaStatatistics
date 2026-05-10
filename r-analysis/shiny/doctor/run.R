setwd(dirname(normalizePath(sys.frame(0)$ofile, mustWork = FALSE)))
shiny::runApp(".", port = 3839, launch.browser = TRUE)
