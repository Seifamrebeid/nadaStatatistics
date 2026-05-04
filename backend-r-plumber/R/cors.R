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
  cat("[CORS] Method:", req$REQUEST_METHOD, "Origin:", req$HTTP_ORIGIN, "\n")
  
  # Always allow all origins during dev (not for production!)
  # Get the origin from the request or use * as fallback
  origin <- req$HTTP_ORIGIN %||% "*"
  
  # Set CORS headers for all requests
  res$setHeader("Access-Control-Allow-Origin", origin)
  res$setHeader("Access-Control-Allow-Credentials", "true")
  res$setHeader("Access-Control-Allow-Headers",
                "Authorization,Content-Type,X-Finalize-Secret")
  res$setHeader("Access-Control-Allow-Methods",
                "GET,POST,PUT,PATCH,DELETE,OPTIONS")
  
  cat("[CORS] Headers set for origin:", origin, "\n")
  
  # Handle preflight OPTIONS requests
  if (identical(req$REQUEST_METHOD, "OPTIONS")) {
    res$status <- 204
    cat("[CORS] Returning 204 for OPTIONS request\n")
    return(list())
  }
  
  plumber::forward()
}
