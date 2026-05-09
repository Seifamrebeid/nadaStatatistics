"""Heuristic attention / cheating scoring for live classroom analytics.

This module is intentionally lightweight: it turns the signals already
available in the capture loop (sleep state, phone usage, yawn, gesture,
emotion) into two interpretable scores:

- attention_score: how focused the student seems right now (0-100)
- cheat_score: how suspicious the behavior looks during an exam (0-100)

The heuristics are conservative and explainable. They are not a replacement
for policy review or human judgment.
"""

from __future__ import annotations

from typing import List, Tuple


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def attention_score(*, state: str, on_phone: bool, yawning: bool,
                    gesture: str, emotion: str, face_count: int = 1) -> float:
    """Return an interpretable focus score in the range 0..100.

    The score is built from the currently available signals. If a student is
    asleep, on the phone, yawning, or has multiple competing face detections,
    the score drops quickly.
    """
    score = 78.0
    if state == "sleeping":
        score -= 48.0
    if on_phone:
        score -= 28.0
    if yawning:
        score -= 10.0
    if gesture in {"none", "writing"}:
        score += 2.0
    elif gesture == "hand_raised":
        score += 4.0
    if emotion in {"angry", "sad", "fearful", "disgusted"}:
        score -= 6.0
    elif emotion == "happy":
        score += 4.0
    if face_count > 1:
        score -= 6.0 * (face_count - 1)
    return round(clamp(score), 1)


def attention_warning(score: float) -> bool:
    return score < 45.0


def cheat_score(*, exam_mode: bool, on_phone: bool, attention: float,
                face_count: int = 1, extra_faces: int = 0) -> float:
    """Return a rough exam-integrity suspicion score in the range 0..100."""
    if not exam_mode:
        return 0.0

    score = 10.0
    if on_phone:
        score += 55.0
    if attention < 50.0:
        score += 18.0
    if face_count > 1:
        score += 12.0 * (face_count - 1)
    if extra_faces > 0:
        score += 20.0 * extra_faces
    return round(clamp(score), 1)


def cheating_warning(score: float) -> bool:
    return score >= 60.0


def recommendation_text(*, attention: float, mark: float | None = None,
                        grade: str | None = None, attendance_rate: float | None = None) -> List[str]:
    """Return short action items for the student dashboard."""
    items: List[str] = []
    if mark is not None and mark < 70:
        items.append("Review the last lecture notes and retry the hardest exercises.")
    if attendance_rate is not None and attendance_rate < 0.8:
        items.append("Improve attendance to protect your grade trend.")
    if attention < 50:
        items.append("Reduce distractions and keep the camera view centered on you.")
    elif attention < 70:
        items.append("Stay active: ask questions or follow along with the lecturer.")
    if grade in {"D", "D-", "F"}:
        items.append("Schedule a quick revision plan with your doctor/teacher.")
    if not items:
        items.append("Maintain your current habits and keep the momentum going.")
    return items
