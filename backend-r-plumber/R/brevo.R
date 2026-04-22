# Brevo transactional email — doctor → student notifications.
#
# When BREVO_API_KEY is empty, run in stub mode: return success but don't
# actually send. Lets the frontend flow work end-to-end without a signup.

library(httr)
library(jsonlite)

#' Send one email via Brevo.
#' `to` is a list of lists: list(list(email=..., name=...), ...).
#' Returns list(status = "sent" | "stubbed" | "failed", message_id, error).
send_email <- function(to, subject, html_body,
                       sender_email = env_or("BREVO_SENDER_EMAIL", "noreply@localhost"),
                       sender_name  = env_or("BREVO_SENDER_NAME",  "Classroom")) {
  api_key <- env_or("BREVO_API_KEY", "")
  if (!nzchar(api_key)) {
    return(list(status = "stubbed",
                message_id = paste0("stub-", new_id("")),
                recipients = length(to),
                note = "BREVO_API_KEY not set — email not actually sent"))
  }
  body <- list(
    sender      = list(email = sender_email, name = sender_name),
    to          = to,
    subject     = subject,
    htmlContent = html_body
  )
  resp <- POST("https://api.brevo.com/v3/smtp/email",
               add_headers(`api-key` = api_key, `content-type` = "application/json"),
               body = jsonlite::toJSON(body, auto_unbox = TRUE))
  if (httr::http_error(resp)) {
    return(list(status = "failed",
                error = content(resp, "text", encoding = "UTF-8")))
  }
  parsed <- jsonlite::fromJSON(content(resp, "text", encoding = "UTF-8"))
  list(status = "sent", message_id = parsed$messageId %||% NA_character_)
}
