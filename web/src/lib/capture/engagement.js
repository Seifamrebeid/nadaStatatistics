// Engagement scoring — mirrors classroom-app-python/engagement.py + R.
// Keep these in sync; the Shiny dashboard reads engagement_score directly.

export const EMOTION_TO_ENGAGEMENT = {
  happy:    0.9,
  surprise: 0.8,
  neutral:  0.6,
  sad:      0.3,
  angry:    0.2,
  fear:     0.2,
  disgust:  0.1,
};

const HAND_RAISED_BONUS = 0.2;

// Convert face-api.js FaceExpressionNet output (7 floats) into a single
// dominant emotion label.
export function dominantEmotion(expressions) {
  if (!expressions) return { emotion: "neutral", confidence: 0 };
  let top = "neutral", topVal = -Infinity;
  for (const [k, v] of Object.entries(expressions)) {
    if (typeof v === "number" && v > topVal) { top = k; topVal = v; }
  }
  // face-api uses "happy/sad/angry/fearful/disgusted/surprised/neutral".
  // Normalize to the Python schema.
  const norm = ({
    fearful:   "fear",
    disgusted: "disgust",
    surprised: "surprise",
  })[top] || top;
  return { emotion: norm, confidence: Math.round(topVal * 1000) / 1000 };
}

export function engagementScore({ emotion, state = "awake", gesture = "none", attention = 1 }) {
  if (state === "sleeping") return 0.0;
  let base = EMOTION_TO_ENGAGEMENT[emotion] ?? 0;
  if (gesture === "hand_raised") base = Math.min(1.0, base + HAND_RAISED_BONUS);
  return Math.round(base * attention * 1000) / 1000;
}
