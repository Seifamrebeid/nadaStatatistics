# CORS filter — allows the six frontend dev origins + the LAN IP for mobile.
# Keep the list narrow in dev; when deploying to prod, append the deployed URLs.

CORS_ALLOWED_ORIGINS <- c(
  # Web apps — pinned Vite ports (see Phase 6.1)
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  # Expo-web preview ports (see Phase 7.1)
  "http://localhost:19006",
  "http://localhost:19007",
  "http://localhost:19008"
)

cors_filter <- function(req, res) {
  origin <- req$HTTP_ORIGIN %||% ""
  if (origin %in% CORS_ALLOWED_ORIGINS) {
    res$setHeader("Access-Control-Allow-Origin", origin)
    res$setHeader("Access-Control-Allow-Credentials", "true")
    res$setHeader("Access-Control-Allow-Headers",
                  "Authorization,Content-Type,X-Finalize-Secret")
    res$setHeader("Access-Control-Allow-Methods",
                  "GET,POST,PUT,PATCH,DELETE,OPTIONS")
  }
  if (identical(req$REQUEST_METHOD, "OPTIONS")) {
    res$status <- 204
    return(list())
  }
  plumber::forward()
}
