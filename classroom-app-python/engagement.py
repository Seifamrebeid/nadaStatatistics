"""Engagement scoring from emotion + sleep state + gesture.

Mirrors `backend-r-plumber/R/engagement.R`. The Phase 9 parity test asserts
both sides return the same value for every (emotion, state, gesture) combo —
if you change anything here, change it there too.
"""

EMOTION_TO_ENGAGEMENT = {
    "happy": 0.9,
    "surprise": 0.8,
    "neutral": 0.6,
    "sad": 0.3,
    "angry": 0.2,
    "fear": 0.2,
    "disgust": 0.1,
}

HAND_RAISED_BONUS = 0.2

# FER's 7 labels -> the project's 4 target classes. Surprise maps to `confused`
# rather than `happy` because in a classroom context it more often signals
# "I wasn't expecting that" than delight. Anger / fear map to `confused`
# (frustration with material), disgust to `bored` (disengagement).
_FOUR_CLASS = {
    "happy": "happy",
    "neutral": "neutral",
    "sad": "bored",
    "disgust": "bored",
    "surprise": "confused",
    "angry": "confused",
    "fear": "confused",
}


def engagement_score(emotion: str, state: str = "awake", gesture: str = "none",
                     attention: float = 1.0) -> float:
    if state and state.lower() == "sleeping":
        return 0.0
    base = EMOTION_TO_ENGAGEMENT.get((emotion or "").lower(), 0.0)
    if gesture and gesture.lower() == "hand_raised":
        base = min(1.0, base + HAND_RAISED_BONUS)
    return base * attention


def reduce_emotion_to_four(emotion: str) -> str:
    return _FOUR_CLASS.get((emotion or "").lower(), "neutral")
