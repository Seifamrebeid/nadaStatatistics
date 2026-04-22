# Engagement scoring — mirrors the Python logic in
# classroom-app-python/engagement.py so numbers in the dashboard match what
# the capture app wrote. Phase 9 adds a parity test; keep the two in sync.

EMOTION_TO_ENGAGEMENT <- c(
  happy = 0.9, surprise = 0.8, neutral = 0.6,
  sad = 0.3, angry = 0.2, fear = 0.2, disgust = 0.1
)
HAND_RAISED_BONUS <- 0.2

#' Compute the engagement score from emotion + state + gesture.
#' Sleeping overrides everything → 0. hand_raised adds HAND_RAISED_BONUS
#' (clamped at 1.0) to the emotion baseline.
engagement_score <- function(emotion, state = "awake", gesture = "none",
                             attention = 1) {
  if (!is.null(state) && tolower(as.character(state)) == "sleeping") return(0.0)
  base <- EMOTION_TO_ENGAGEMENT[tolower(as.character(emotion))]
  if (is.na(base)) base <- 0
  if (!is.null(gesture) && tolower(as.character(gesture)) == "hand_raised") {
    base <- min(1.0, base + HAND_RAISED_BONUS)
  }
  unname(base * attention)
}

#' Reduce FER's 7 emotion labels to the 4 project-specific classes.
#' sleeping is a separate dimension (state column), not collapsed in here.
REDUCED_EMOTION <- c(
  happy = "happy", neutral = "neutral",
  sad = "bored", angry = "bored", disgust = "bored",
  surprise = "confused", fear = "confused"
)

reduce_emotion <- function(emotion) {
  e <- tolower(as.character(emotion))
  out <- unname(REDUCED_EMOTION[e])
  ifelse(is.na(out), "neutral", out)
}
