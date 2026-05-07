"""Classroom capture — modern desktop UI (wizard + live screen).

5-step wizard: Doctor -> Subject -> Class -> Week -> Lecture, then the live
screen (camera left, lecture details + scrolling event log right). Detection
runs in a worker thread; the UI thread drains a frame queue at ~30 fps.

Run:
    python capture_app_ui.py
"""

from __future__ import annotations

import os
import queue
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, List, Optional

import customtkinter as ctk
from dotenv import load_dotenv
from PIL import Image

import firebase_writer

# capture_app pulls in TF/MediaPipe/face_recognition — heavy. Lazy-load it
# the first time we actually start a recording so the wizard opens fast.

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

WINDOW_TITLE = "Classroom Emotions — Capture"
SIDE_W = 360
APP_W, APP_H = 1024, 720

# ----------------------------------------------------------------------
# Shared button styles — keep one source of truth so the wizard, confirm,
# and live screens all feel like one product.
# ----------------------------------------------------------------------
_BTN_FONT = {"size": 13, "weight": "bold"}
_BTN_BASE = {
    "corner_radius": 10,
    "height": 44,
    "border_width": 0,
}
PRIMARY_BTN = {
    **_BTN_BASE,
    "fg_color": "#10b981",
    "hover_color": "#059669",
    "text_color": "#ffffff",
}
SECONDARY_BTN = {
    **_BTN_BASE,
    "fg_color": "#1e293b",
    "hover_color": "#334155",
    "text_color": "#e2e8f0",
    "border_width": 1,
    "border_color": "#334155",
}
GHOST_BTN = {
    **_BTN_BASE,
    "fg_color": "transparent",
    "hover_color": "#1e293b",
    "text_color": "#94a3b8",
}
DANGER_BTN = {
    **_BTN_BASE,
    "fg_color": "#dc2626",
    "hover_color": "#b91c1c",
    "text_color": "#ffffff",
}


# ----------------------------------------------------------------------
# Firestore helpers — tiny wrappers around the SDK so the UI stays clean.
# ----------------------------------------------------------------------
def _coll(db, name: str) -> List[dict]:
    out = []
    for snap in db.collection(name).stream():
        d = snap.to_dict() or {}
        d.setdefault("id", snap.id)
        out.append(d)
    return out


def fetch_doctors(db) -> List[dict]:
    docs = _coll(db, "doctors")
    return [d for d in docs if d.get("active", True)]


def fetch_subjects(db, doctor_id: str) -> List[dict]:
    docs = _coll(db, "subjects")
    return [d for d in docs if d.get("doctor_id") == doctor_id and d.get("active", True)]


def fetch_classes(db, subject_id: str) -> List[dict]:
    docs = _coll(db, "classes")
    return [d for d in docs if d.get("subject_id") == subject_id and d.get("active", True)]


def fetch_weeks(db, class_id: str) -> List[dict]:
    docs = _coll(db, "weeks")
    weeks = [d for d in docs if d.get("class_id") == class_id and d.get("active", True)]
    weeks.sort(key=lambda w: w.get("week_number") or 0)
    return weeks


def fetch_lectures(db, week_id: str) -> List[dict]:
    docs = _coll(db, "lectures")
    lectures = [
        d for d in docs
        if d.get("week_id") == week_id
        and d.get("status") in ("scheduled", "recording")
    ]
    lectures.sort(key=lambda l: l.get("scheduled_at") or "")
    return lectures


def fetch_enrolled_students(db, lecture_doc: dict) -> List[dict]:
    """Resolve a lecture's enrolled_student_ids into student dicts."""
    ids = lecture_doc.get("enrolled_student_ids") or []
    if not ids:
        return []
    out: List[dict] = []
    for sid in ids:
        try:
            snap = db.collection("students").document(sid).get()
        except Exception:
            snap = None
        if snap is None or not snap.exists:
            out.append({
                "id": sid, "name": "(missing student)",
                "email": "", "has_encoding": False,
            })
            continue
        data = snap.to_dict() or {}
        out.append({
            "id": sid,
            "name": data.get("name") or sid,
            "email": data.get("email") or "",
            "has_encoding": bool(data.get("face_encoding")),
        })
    out.sort(key=lambda s: s.get("name") or "")
    return out


# ----------------------------------------------------------------------
# Selection state — accumulated as the user advances through the wizard.
# ----------------------------------------------------------------------
@dataclass
class Selection:
    doctor: Optional[dict] = None
    subject: Optional[dict] = None
    class_: Optional[dict] = None
    week: Optional[dict] = None
    lecture: Optional[dict] = None


# ----------------------------------------------------------------------
# Reusable list-step frame — title, search box, scrollable list of cards,
# Back/Next buttons. Each step instantiates this with a different data
# loader and a per-row label/subtitle formatter.
# ----------------------------------------------------------------------
class ListStep(ctk.CTkFrame):
    def __init__(
        self,
        master,
        title: str,
        subtitle: str,
        step_index: int,
        total_steps: int,
        load_items: Callable[[], List[dict]],
        item_label: Callable[[dict], str],
        item_sub: Callable[[dict], str],
        on_pick: Callable[[dict], None],
        on_back: Optional[Callable[[], None]] = None,
        empty_msg: str = "Nothing to show.",
    ):
        super().__init__(master, fg_color="transparent")
        self.load_items = load_items
        self.item_label = item_label
        self.item_sub = item_sub
        self.on_pick = on_pick
        self.empty_msg = empty_msg
        self._all: List[dict] = []
        self._selected: Optional[dict] = None
        self._row_widgets: List[ctk.CTkButton] = []

        # Header — step counter, title, subtitle
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=40, pady=(36, 8))
        ctk.CTkLabel(
            header,
            text=f"STEP {step_index} OF {total_steps}",
            text_color="#10b981",
            font=ctk.CTkFont(size=11, weight="bold"),
        ).pack(anchor="w")
        ctk.CTkLabel(
            header,
            text=title,
            font=ctk.CTkFont(size=26, weight="bold"),
        ).pack(anchor="w", pady=(4, 0))
        ctk.CTkLabel(
            header,
            text=subtitle,
            text_color="#94a3b8",
            font=ctk.CTkFont(size=13),
        ).pack(anchor="w", pady=(4, 0))

        # Step progress dots
        dots = ctk.CTkFrame(self, fg_color="transparent")
        dots.pack(anchor="w", padx=40, pady=(12, 0))
        for i in range(1, total_steps + 1):
            color = "#10b981" if i <= step_index else "#334155"
            d = ctk.CTkFrame(dots, width=28, height=4, fg_color=color, corner_radius=2)
            d.pack(side="left", padx=(0, 6))
            d.pack_propagate(False)

        # Search
        search_row = ctk.CTkFrame(self, fg_color="transparent")
        search_row.pack(fill="x", padx=40, pady=(20, 8))
        self.search_var = ctk.StringVar()
        self.search_var.trace_add("write", lambda *_: self._render())
        self.search_entry = ctk.CTkEntry(
            search_row,
            placeholder_text="Search…",
            textvariable=self.search_var,
            height=40,
            font=ctk.CTkFont(size=13),
        )
        self.search_entry.pack(fill="x")

        # List container (scrollable)
        self.list_frame = ctk.CTkScrollableFrame(self, fg_color="#0f172a", corner_radius=12)
        self.list_frame.pack(fill="both", expand=True, padx=40, pady=8)

        # Footer (Back / Next)
        footer = ctk.CTkFrame(self, fg_color="transparent")
        footer.pack(fill="x", padx=40, pady=(8, 28))
        if on_back:
            ctk.CTkButton(
                footer, text="←  Back", command=on_back,
                width=130,
                font=ctk.CTkFont(**_BTN_FONT),
                **GHOST_BTN,
            ).pack(side="left")
        self.next_btn = ctk.CTkButton(
            footer, text="Continue  →", command=self._confirm,
            width=160,
            font=ctk.CTkFont(**_BTN_FONT),
            state="disabled",
            **PRIMARY_BTN,
        )
        self.next_btn.pack(side="right")

    def refresh(self):
        """Reload data — called when this step becomes visible."""
        try:
            self._all = self.load_items()
        except Exception as e:
            self._all = []
            print(f"[wizard] load failed: {e}", file=sys.stderr)
        self._selected = None
        self.next_btn.configure(state="disabled")
        self.search_var.set("")
        self._render()
        self.search_entry.focus_set()

    def _render(self):
        for w in self._row_widgets:
            w.destroy()
        self._row_widgets.clear()

        q = self.search_var.get().strip().lower()
        items = self._all
        if q:
            def hit(d):
                hay = f"{self.item_label(d)} {self.item_sub(d)}".lower()
                return q in hay
            items = [d for d in items if hit(d)]

        if not items:
            empty = ctk.CTkLabel(
                self.list_frame,
                text=self.empty_msg if not q else "No matches.",
                text_color="#64748b",
                font=ctk.CTkFont(size=13),
            )
            empty.pack(pady=40)
            self._row_widgets.append(empty)
            return

        for d in items:
            self._row_widgets.append(self._row(d))

    def _row(self, d: dict):
        is_picked = self._selected is d
        fg = "#10b981" if is_picked else "#1e293b"
        hover = "#059669" if is_picked else "#334155"
        text_color = "#ffffff" if is_picked else "#e2e8f0"
        sub_color = "#d1fae5" if is_picked else "#94a3b8"

        row = ctk.CTkFrame(
            self.list_frame, fg_color=fg, corner_radius=10,
            border_width=1,
            border_color=("#10b981" if is_picked else "#1e293b"),
        )
        row.pack(fill="x", padx=4, pady=4)

        title = ctk.CTkLabel(
            row,
            text=self.item_label(d),
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=text_color,
            fg_color="transparent",
            anchor="w",
            justify="left",
        )
        title.pack(anchor="w", fill="x", padx=16, pady=(12, 2))

        sub = ctk.CTkLabel(
            row,
            text=self.item_sub(d) or " ",
            font=ctk.CTkFont(size=12),
            text_color=sub_color,
            fg_color="transparent",
            anchor="w",
            justify="left",
        )
        sub.pack(anchor="w", fill="x", padx=16, pady=(0, 12))

        # Make the whole row + every child clickable + show hover state.
        def on_click(_=None, d=d):
            self._select(d)

        def on_enter(_=None):
            if not is_picked:
                row.configure(fg_color=hover, border_color=hover)

        def on_leave(_=None):
            if not is_picked:
                row.configure(fg_color=fg, border_color=fg)

        for w in (row, title, sub):
            w.bind("<Button-1>", on_click)
            w.bind("<Enter>", on_enter)
            w.bind("<Leave>", on_leave)
            try:
                w.configure(cursor="hand2")
            except Exception:
                pass

        return row

    def _select(self, d: dict):
        self._selected = d
        self.next_btn.configure(state="normal")
        self._render()

    def _confirm(self):
        if self._selected is not None:
            self.on_pick(self._selected)


# ----------------------------------------------------------------------
# Wizard root — owns the Selection and swaps between ListStep frames.
# ----------------------------------------------------------------------
class CaptureWizard(ctk.CTk):
    def __init__(self, db):
        super().__init__()
        self.db = db
        self.sel = Selection()

        self.title(WINDOW_TITLE)
        self.geometry(f"{APP_W}x{APP_H}")
        self.minsize(900, 640)
        self.configure(fg_color="#020617")

        # Brand header (sticky)
        bar = ctk.CTkFrame(self, fg_color="#0f172a", height=64, corner_radius=0)
        bar.pack(fill="x")
        bar.pack_propagate(False)
        inner = ctk.CTkFrame(bar, fg_color="transparent")
        inner.pack(fill="both", expand=True, padx=24)
        logo = ctk.CTkLabel(
            inner, text="●  Classroom Emotions",
            text_color="#10b981",
            font=ctk.CTkFont(size=15, weight="bold"),
        )
        logo.pack(side="left", pady=18)
        ctk.CTkLabel(
            inner, text="Capture Console",
            text_color="#64748b",
            font=ctk.CTkFont(size=13),
        ).pack(side="left", padx=(12, 0), pady=18)

        # Body container — frames stacked, only one visible at a time
        self.body = ctk.CTkFrame(self, fg_color="transparent")
        self.body.pack(fill="both", expand=True)

        # Build all five steps up-front; data is loaded lazily on show()
        self.steps = {}
        self.steps["doctor"] = ListStep(
            self.body,
            title="Who is teaching?",
            subtitle="Pick the doctor running this lecture.",
            step_index=1, total_steps=5,
            load_items=lambda: fetch_doctors(self.db),
            item_label=lambda d: d.get("name") or d.get("doctor_id") or "—",
            item_sub=lambda d: d.get("email") or "",
            on_pick=self._pick_doctor,
            empty_msg="No active doctors found. Create one in the admin app first.",
        )
        self.steps["subject"] = ListStep(
            self.body,
            title="Which subject?",
            subtitle="Subjects assigned to this doctor.",
            step_index=2, total_steps=5,
            load_items=lambda: fetch_subjects(self.db, self.sel.doctor["doctor_id"]),
            item_label=lambda d: d.get("name") or "—",
            item_sub=lambda d: d.get("code") or d.get("description") or "",
            on_pick=self._pick_subject,
            on_back=lambda: self._show("doctor"),
            empty_msg="No subjects assigned to this doctor yet.",
        )
        self.steps["class"] = ListStep(
            self.body,
            title="Which class?",
            subtitle="Classes within the chosen subject.",
            step_index=3, total_steps=5,
            load_items=lambda: fetch_classes(self.db, self.sel.subject["subject_id"]),
            item_label=lambda d: d.get("name") or "—",
            item_sub=lambda d: d.get("description") or "",
            on_pick=self._pick_class,
            on_back=lambda: self._show("subject"),
            empty_msg="No classes under this subject yet.",
        )
        self.steps["week"] = ListStep(
            self.body,
            title="Which week?",
            subtitle="Weeks defined for the chosen class.",
            step_index=4, total_steps=5,
            load_items=lambda: fetch_weeks(self.db, self.sel.class_["class_id"]), # type: ignore
            item_label=lambda d: f"Week {d.get('week_number') or '?'} — {d.get('title') or ''}".strip(" —"),
            item_sub=lambda d: f"{d.get('date') or ''} · status: {d.get('status') or 'planned'}",
            on_pick=self._pick_week,
            on_back=lambda: self._show("class"),
            empty_msg="No weeks set up for this class yet.",
        )
        self.steps["lecture"] = ListStep(
            self.body,
            title="Pick the lecture",
            subtitle="Only scheduled or already-recording lectures appear here.",
            step_index=5, total_steps=5,
            load_items=lambda: fetch_lectures(self.db, self.sel.week["week_id"]),
            item_label=lambda d: d.get("title") or d.get("id") or "—",
            item_sub=lambda d: f"{d.get('scheduled_at') or ''} · status: {d.get('status') or 'scheduled'}",
            on_pick=self._pick_lecture,
            on_back=lambda: self._show("week"),
            empty_msg="No scheduled lectures for this week.",
        )
        for f in self.steps.values():
            f.place(relx=0, rely=0, relwidth=1, relheight=1)

        self._show("doctor")

    # ----- step transitions -----
    def _show(self, key: str):
        f = self.steps[key]
        f.refresh()
        f.tkraise()

    def _pick_doctor(self, d):
        self.sel.doctor = d
        self._show("subject")

    def _pick_subject(self, d):
        self.sel.subject = d
        self._show("class")

    def _pick_class(self, d):
        self.sel.class_ = d
        self._show("week")

    def _pick_week(self, d):
        self.sel.week = d
        self._show("lecture")

    def _pick_lecture(self, d):
        self.sel.lecture = d
        self._show_confirm()

    def _show_confirm(self):
        for f in self.steps.values():
            f.place_forget()
        if getattr(self, "_confirm", None) is not None:
            self._confirm.destroy()
        self._confirm = ConfirmStep(
            self.body,
            self.sel,
            db=self.db,
            on_back=self._back_to_lecture,
            on_start=self._launch_live,
        )
        self._confirm.place(relx=0, rely=0, relwidth=1, relheight=1)

    def _back_to_lecture(self):
        if getattr(self, "_confirm", None) is not None:
            self._confirm.destroy()
            self._confirm = None
        self._show("lecture")

    def _launch_live(self):
        """Tear down the wizard / confirm frames and hand off to LiveScreen."""
        for f in self.steps.values():
            f.place_forget()
        if getattr(self, "_confirm", None) is not None:
            self._confirm.destroy()
            self._confirm = None

        live = LiveScreen(self.body, self.sel, on_close=self.destroy)
        live.place(relx=0, rely=0, relwidth=1, relheight=1)

        # Go full-screen for the recording session.
        try:
            self.attributes("-fullscreen", True)
        except Exception:
            self.state("zoomed")

        live.start_capture()


# ----------------------------------------------------------------------
# Confirm step — one last review of the chain before we burn camera frames.
# ----------------------------------------------------------------------
class ConfirmStep(ctk.CTkFrame):
    def __init__(
        self,
        master,
        sel: Selection,
        db,
        on_back: Callable[[], None],
        on_start: Callable[[], None],
    ):
        super().__init__(master, fg_color="transparent")
        self.sel = sel
        self.db = db
        self._on_start = on_start

        # Header
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=40, pady=(36, 8))
        ctk.CTkLabel(
            header, text="REVIEW",
            text_color="#10b981",
            font=ctk.CTkFont(size=11, weight="bold"),
        ).pack(anchor="w")
        ctk.CTkLabel(
            header, text="Confirm the lecture before recording",
            font=ctk.CTkFont(size=26, weight="bold"),
        ).pack(anchor="w", pady=(4, 0))
        ctk.CTkLabel(
            header,
            text="Once you start, the camera, mic and detection pipeline will all begin.",
            text_color="#94a3b8",
            font=ctk.CTkFont(size=13),
        ).pack(anchor="w", pady=(4, 0))

        # Step dots — 5/5 done + a "review" pill
        dots = ctk.CTkFrame(self, fg_color="transparent")
        dots.pack(anchor="w", padx=40, pady=(12, 0))
        for _ in range(5):
            d = ctk.CTkFrame(dots, width=28, height=4, fg_color="#10b981", corner_radius=2)
            d.pack(side="left", padx=(0, 6))
            d.pack_propagate(False)
        ctk.CTkLabel(
            dots, text="• REVIEW",
            text_color="#10b981",
            font=ctk.CTkFont(size=10, weight="bold"),
        ).pack(side="left", padx=(8, 0))

        # Footer is packed FIRST (side="bottom") so Tk reserves space for the
        # action buttons before the scrollable card claims everything else
        # with expand=True. Contents are filled in below once we know the
        # encoded-student count.
        footer = ctk.CTkFrame(self, fg_color="transparent")
        footer.pack(fill="x", side="bottom", padx=40, pady=(12, 28))

        # Summary card
        card = ctk.CTkFrame(self, fg_color="#0f172a", corner_radius=16)
        card.pack(fill="both", expand=True, padx=40, pady=(20, 12))

        # Lecture title (hero)
        title_box = ctk.CTkFrame(card, fg_color="transparent")
        title_box.pack(fill="x", padx=32, pady=(28, 12))
        ctk.CTkLabel(
            title_box, text="LECTURE",
            text_color="#10b981",
            font=ctk.CTkFont(size=10, weight="bold"),
        ).pack(anchor="w")
        ctk.CTkLabel(
            title_box,
            text=(sel.lecture or {}).get("title") or "—",
            font=ctk.CTkFont(size=22, weight="bold"),
            anchor="w", justify="left",
        ).pack(anchor="w", pady=(4, 0), fill="x")
        ctk.CTkLabel(
            title_box,
            text=(
                f"{(sel.lecture or {}).get('scheduled_at') or 'no scheduled time'}"
                f"   ·   status: {(sel.lecture or {}).get('status') or 'scheduled'}"
            ),
            text_color="#64748b",
            font=ctk.CTkFont(size=12),
            anchor="w",
        ).pack(anchor="w", pady=(4, 0))

        # Divider
        ctk.CTkFrame(card, fg_color="#1e293b", height=1).pack(fill="x", padx=32, pady=12)

        # Two-column key/value grid
        grid = ctk.CTkFrame(card, fg_color="transparent")
        grid.pack(fill="x", padx=32, pady=(4, 28))
        grid.grid_columnconfigure(0, weight=1, uniform="kv")
        grid.grid_columnconfigure(1, weight=1, uniform="kv")

        rows = [
            ("Doctor",  (sel.doctor  or {}).get("name"),  (sel.doctor  or {}).get("email")),
            ("Subject", (sel.subject or {}).get("name"),  (sel.subject or {}).get("code") or ""),
            ("Class",   (sel.class_  or {}).get("name"),  (sel.class_  or {}).get("description") or ""),
            (
                "Week",
                f"#{(sel.week or {}).get('week_number') or '?'}  "
                f"{(sel.week or {}).get('title') or ''}".strip(),
                (sel.week or {}).get("date") or "",
            ),
        ]
        for i, (k, v, sub) in enumerate(rows):
            cell = ctk.CTkFrame(grid, fg_color="transparent")
            cell.grid(row=i // 2, column=i % 2, sticky="nsew", padx=8, pady=10)
            ctk.CTkLabel(
                cell, text=k.upper(),
                text_color="#64748b",
                font=ctk.CTkFont(size=10, weight="bold"),
            ).pack(anchor="w")
            ctk.CTkLabel(
                cell, text=v or "—",
                text_color="#e2e8f0",
                font=ctk.CTkFont(size=15, weight="bold"),
                anchor="w", justify="left", wraplength=400,
            ).pack(anchor="w", pady=(4, 0), fill="x")
            if sub:
                ctk.CTkLabel(
                    cell, text=sub,
                    text_color="#64748b",
                    font=ctk.CTkFont(size=11),
                    anchor="w", justify="left", wraplength=400,
                ).pack(anchor="w", pady=(2, 0), fill="x")

        # ---- Enrolled students roster ----
        ctk.CTkFrame(card, fg_color="#1e293b", height=1).pack(fill="x", padx=32, pady=(0, 12))

        roster_head = ctk.CTkFrame(card, fg_color="transparent")
        roster_head.pack(fill="x", padx=32, pady=(0, 6))
        ctk.CTkLabel(
            roster_head, text="ENROLLED STUDENTS",
            text_color="#10b981",
            font=ctk.CTkFont(size=10, weight="bold"),
        ).pack(side="left")
        self.roster_count_lbl = ctk.CTkLabel(
            roster_head, text="loading…",
            text_color="#64748b",
            font=ctk.CTkFont(size=11),
        )
        self.roster_count_lbl.pack(side="right")

        # Resolve roster (synchronous — typical class is < 100 students).
        students = []
        try:
            students = fetch_enrolled_students(self.db, sel.lecture or {})
        except Exception as e:
            ctk.CTkLabel(
                card, text=f"Could not load roster: {e}",
                text_color="#f87171",
                font=ctk.CTkFont(size=12),
                anchor="w",
            ).pack(anchor="w", padx=32, pady=4)

        encoded = sum(1 for s in students if s.get("has_encoding"))
        missing = len(students) - encoded
        self._encoded_count = encoded

        if students:
            self.roster_count_lbl.configure(
                text=f"{len(students)} total · {encoded} ready · {missing} missing face",
                text_color=("#10b981" if missing == 0 else "#f59e0b"),
            )
        else:
            self.roster_count_lbl.configure(
                text="0 enrolled — face recognition will skip everyone",
                text_color="#f87171",
            )

        roster = ctk.CTkScrollableFrame(
            card, fg_color="#020617", corner_radius=10, height=180,
        )
        roster.pack(fill="x", padx=32, pady=(0, 22))

        if not students:
            ctk.CTkLabel(
                roster,
                text="No students are enrolled in this lecture.\nAdd them in the admin app, then reopen the wizard.",
                text_color="#64748b",
                font=ctk.CTkFont(size=12),
                justify="center",
            ).pack(pady=24)
        else:
            for s in students:
                row = ctk.CTkFrame(roster, fg_color="transparent")
                row.pack(fill="x", padx=10, pady=4)

                if s["has_encoding"]:
                    badge_bg = "#064e3b"; badge_fg = "#34d399"; icon = "✓"
                else:
                    badge_bg = "#7c2d12"; badge_fg = "#fb923c"; icon = "!"

                badge = ctk.CTkLabel(
                    row, text=icon,
                    width=24, height=24,
                    fg_color=badge_bg,
                    text_color=badge_fg,
                    corner_radius=6,
                    font=ctk.CTkFont(size=12, weight="bold"),
                )
                badge.pack(side="left", padx=(4, 10), pady=2)

                name = ctk.CTkLabel(
                    row, text=s["name"],
                    text_color="#e2e8f0",
                    font=ctk.CTkFont(size=13, weight="bold"),
                    anchor="w",
                )
                name.pack(side="left")

                tag = "ready" if s["has_encoding"] else "no face encoding"
                tag_lbl = ctk.CTkLabel(
                    row, text=tag,
                    text_color=badge_fg,
                    font=ctk.CTkFont(size=10, weight="bold"),
                )
                tag_lbl.pack(side="right", padx=4)

                if s.get("email"):
                    sub = ctk.CTkLabel(
                        row, text=s["email"],
                        text_color="#64748b",
                        font=ctk.CTkFont(size=11),
                    )
                    sub.pack(side="right", padx=10)

        # Footer contents — `footer` was already packed at the bottom above,
        # so the buttons stay visible regardless of how big the roster is.
        ctk.CTkButton(
            footer, text="←  Edit selection", command=on_back,
            width=170,
            font=ctk.CTkFont(**_BTN_FONT),
            **GHOST_BTN,
        ).pack(side="left")

        if self._encoded_count == 0:
            warn = ctk.CTkLabel(
                footer,
                text="No face encodings — recording will run but no one\nwill be identified.",
                text_color="#f59e0b",
                font=ctk.CTkFont(size=11),
                justify="right",
            )
            warn.pack(side="right", padx=12)

        start_text = (
            "●  Start recording"
            if self._encoded_count > 0
            else "●  Record anyway"
        )
        ctk.CTkButton(
            footer, text=start_text, command=on_start,
            width=210,
            font=ctk.CTkFont(**_BTN_FONT),
            **PRIMARY_BTN,
        ).pack(side="right")


# ----------------------------------------------------------------------
# Live screen — full-screen layout with camera left, details + log right.
# Detection runs in a worker thread; UI thread polls queues at ~30 fps.
# ----------------------------------------------------------------------
class LiveScreen(ctk.CTkFrame):
    POLL_MS = 33  # ~30 fps frame draw

    def __init__(self, master, sel: Selection, on_close: Callable[[], None]):
        super().__init__(master, fg_color="#020617")
        self.sel = sel
        self.on_close = on_close

        self.frame_q: queue.Queue = queue.Queue(maxsize=1)
        self.log_q: queue.Queue = queue.Queue()
        self.stop_event = threading.Event()
        self._worker: Optional[threading.Thread] = None
        self._photo = None  # CTkImage handle (must outlive label.configure)
        self._started_at: Optional[float] = None
        self._frame_count = 0
        self._fps_ema = 0.0
        self._last_frame_t = 0.0

        # ---- top status bar ----
        bar = ctk.CTkFrame(self, fg_color="#0f172a", height=56, corner_radius=0)
        bar.pack(fill="x", side="top")
        bar.pack_propagate(False)

        left = ctk.CTkFrame(bar, fg_color="transparent")
        left.pack(side="left", fill="y", padx=18)
        self.rec_dot = ctk.CTkFrame(left, width=10, height=10, corner_radius=5,
                                    fg_color="#ef4444")
        self.rec_dot.pack(side="left", pady=22)
        self.rec_dot.pack_propagate(False)
        ctk.CTkLabel(
            left, text="REC",
            text_color="#ef4444",
            font=ctk.CTkFont(size=12, weight="bold"),
        ).pack(side="left", padx=(8, 18), pady=18)

        title_text = (
            f"{(self.sel.lecture or {}).get('title') or 'Lecture'}"
        )
        ctk.CTkLabel(
            left, text=title_text,
            font=ctk.CTkFont(size=14, weight="bold"),
        ).pack(side="left", pady=18)

        right = ctk.CTkFrame(bar, fg_color="transparent")
        right.pack(side="right", fill="y", padx=18)

        self.timer_lbl = ctk.CTkLabel(
            right, text="00:00:00",
            text_color="#cbd5e1",
            font=ctk.CTkFont(size=14, weight="bold", family="Consolas"),
        )
        self.timer_lbl.pack(side="left", padx=(0, 20), pady=18)

        self.stop_btn = ctk.CTkButton(
            right, text="■  Stop & Finish",
            command=self._stop,
            width=180,
            font=ctk.CTkFont(**_BTN_FONT),
            **DANGER_BTN,
        )
        self.stop_btn.pack(side="left", pady=8)

        # ---- body: camera (left) + side panel (right) ----
        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True)
        body.grid_columnconfigure(0, weight=4)  # video gets ~70%
        body.grid_columnconfigure(1, weight=0, minsize=SIDE_W)
        body.grid_rowconfigure(0, weight=1)

        cam_wrap = ctk.CTkFrame(body, fg_color="#000000", corner_radius=0)
        cam_wrap.grid(row=0, column=0, sticky="nsew", padx=(12, 6), pady=12)
        self.cam_label = ctk.CTkLabel(cam_wrap, text="Starting camera…",
                                      text_color="#64748b",
                                      font=ctk.CTkFont(size=14))
        self.cam_label.pack(fill="both", expand=True)

        side = ctk.CTkFrame(body, fg_color="#0f172a", corner_radius=12)
        side.grid(row=0, column=1, sticky="nsew", padx=(6, 12), pady=12)

        # Lecture-details card
        det_pad = ctk.CTkFrame(side, fg_color="transparent")
        det_pad.pack(fill="x", padx=18, pady=(18, 8))
        ctk.CTkLabel(
            det_pad, text="LECTURE DETAILS",
            text_color="#10b981",
            font=ctk.CTkFont(size=10, weight="bold"),
        ).pack(anchor="w")
        ctk.CTkLabel(
            det_pad, text=(self.sel.lecture or {}).get("title") or "—",
            font=ctk.CTkFont(size=15, weight="bold"),
            wraplength=SIDE_W - 36, justify="left",
        ).pack(anchor="w", pady=(4, 8))

        def kv(k, v):
            row = ctk.CTkFrame(det_pad, fg_color="transparent")
            row.pack(fill="x", pady=2)
            ctk.CTkLabel(
                row, text=k, text_color="#64748b",
                font=ctk.CTkFont(size=11), width=70, anchor="w",
            ).pack(side="left")
            ctk.CTkLabel(
                row, text=v or "—", text_color="#cbd5e1",
                font=ctk.CTkFont(size=12), anchor="w",
                wraplength=SIDE_W - 110, justify="left",
            ).pack(side="left", fill="x", expand=True)

        kv("Doctor",  (self.sel.doctor  or {}).get("name"))
        kv("Subject", (self.sel.subject or {}).get("name"))
        kv("Class",   (self.sel.class_  or {}).get("name"))
        wk = self.sel.week or {}
        kv("Week", f"#{wk.get('week_number') or '?'}  {wk.get('title') or ''}".strip())
        kv("Lecture id", (self.sel.lecture or {}).get("id"))

        # Stats card
        stats_card = ctk.CTkFrame(side, fg_color="#020617", corner_radius=10)
        stats_card.pack(fill="x", padx=14, pady=(8, 8))
        stats_inner = ctk.CTkFrame(stats_card, fg_color="transparent")
        stats_inner.pack(fill="x", padx=14, pady=12)
        stats_inner.grid_columnconfigure((0, 1), weight=1)

        self.fps_lbl   = self._mk_stat(stats_inner, 0, 0, "FPS",     "—")
        self.frames_lbl = self._mk_stat(stats_inner, 0, 1, "Frames", "0")

        # Log header
        log_header = ctk.CTkFrame(side, fg_color="transparent")
        log_header.pack(fill="x", padx=18, pady=(8, 4))
        ctk.CTkLabel(
            log_header, text="EVENT LOG",
            text_color="#10b981",
            font=ctk.CTkFont(size=10, weight="bold"),
        ).pack(side="left")
        ctk.CTkLabel(
            log_header, text="(newest at the bottom)",
            text_color="#475569",
            font=ctk.CTkFont(size=10),
        ).pack(side="left", padx=8)

        self.log_box = ctk.CTkTextbox(
            side, fg_color="#020617",
            text_color="#cbd5e1",
            font=ctk.CTkFont(size=11, family="Consolas"),
            corner_radius=8, border_width=0,
            wrap="word",
        )
        self.log_box.pack(fill="both", expand=True, padx=14, pady=(0, 14))
        self.log_box.configure(state="disabled")

        # Esc as a bail-out (in case the Stop button is offscreen)
        self.winfo_toplevel().bind("<Escape>", lambda e: self._stop())

    @staticmethod
    def _mk_stat(parent, r, c, label, init):
        cell = ctk.CTkFrame(parent, fg_color="transparent")
        cell.grid(row=r, column=c, sticky="ew", padx=4)
        ctk.CTkLabel(
            cell, text=label, text_color="#64748b",
            font=ctk.CTkFont(size=10, weight="bold"),
        ).pack(anchor="w")
        val = ctk.CTkLabel(
            cell, text=init, text_color="#10b981",
            font=ctk.CTkFont(size=20, weight="bold"),
        )
        val.pack(anchor="w")
        return val

    # ----- worker bootstrap -----
    def start_capture(self):
        self._started_at = time.time()
        self._append_log(f"[{self._now()}] preparing capture (loading models — first start can take ~30s)…")
        self._tick()  # start UI poll loop
        self._tick_clock()

        sel = self.sel
        push_frame = self._push_frame
        push_log = self._push_log
        stop_event = self.stop_event

        def _runner():
            try:
                # Heavy import inside the worker so the UI doesn't block while
                # TF / MediaPipe / face_recognition warm up.
                push_log("loading detection models…")
                from capture_app import run_capture  # type: ignore
                push_log("models loaded; opening camera…")
                run_capture(
                    sel.lecture["id"],
                    sel.lecture,
                    on_frame=push_frame,
                    on_log=push_log,
                    stop_event=stop_event,
                )
            except Exception as e:
                import traceback
                push_log(f"[capture crashed] {e}")
                push_log(traceback.format_exc())
            finally:
                push_log("__capture_finished__")

        self._worker = threading.Thread(target=_runner, daemon=True)
        self._worker.start()

    # ----- callbacks invoked from the worker thread -----
    def _push_frame(self, bgr):
        # Drop oldest if UI hasn't caught up — never block the worker.
        try:
            self.frame_q.get_nowait()
        except queue.Empty:
            pass
        try:
            self.frame_q.put_nowait(bgr)
        except queue.Full:
            pass

    def _push_log(self, msg: str):
        self.log_q.put_nowait(str(msg))

    # ----- UI poll loop -----
    def _tick(self):
        # Drain log queue (cheap).
        drained = 0
        finished = False
        while drained < 32:
            try:
                m = self.log_q.get_nowait()
            except queue.Empty:
                break
            if m == "__capture_finished__":
                finished = True
                break
            self._append_log(f"[{self._now()}] {m}")
            drained += 1

        # Pop latest frame (others were dropped).
        try:
            bgr = self.frame_q.get_nowait()
        except queue.Empty:
            bgr = None

        if bgr is not None:
            self._draw_frame(bgr)
            self._frame_count += 1
            now = time.time()
            if self._last_frame_t:
                inst = 1.0 / max(1e-6, now - self._last_frame_t)
                self._fps_ema = 0.85 * self._fps_ema + 0.15 * inst if self._fps_ema else inst
                self.fps_lbl.configure(text=f"{self._fps_ema:.1f}")
            self._last_frame_t = now
            self.frames_lbl.configure(text=str(self._frame_count))

        if finished:
            self._on_finished()
            return

        self.after(self.POLL_MS, self._tick)

    def _tick_clock(self):
        if self._started_at is not None and not self.stop_event.is_set():
            elapsed = int(time.time() - self._started_at)
            h = elapsed // 3600
            m = (elapsed % 3600) // 60
            s = elapsed % 60
            self.timer_lbl.configure(text=f"{h:02d}:{m:02d}:{s:02d}")
        self.after(500, self._tick_clock)

    def _draw_frame(self, bgr):
        # Resize while preserving aspect to fit the camera label.
        lbl_w = max(self.cam_label.winfo_width(), 320)
        lbl_h = max(self.cam_label.winfo_height(), 240)
        h, w = bgr.shape[:2]
        scale = min(lbl_w / w, lbl_h / h)
        new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))

        rgb = bgr[:, :, ::-1]  # BGR -> RGB without cv2 import here
        img = Image.fromarray(rgb).resize((new_w, new_h), Image.BILINEAR)
        self._photo = ctk.CTkImage(light_image=img, dark_image=img, size=(new_w, new_h))
        self.cam_label.configure(image=self._photo, text="")

    def _append_log(self, line: str):
        self.log_box.configure(state="normal")
        self.log_box.insert("end", line + "\n")
        # Trim to keep memory bounded.
        line_count = int(self.log_box.index("end-1c").split(".")[0])
        if line_count > 500:
            self.log_box.delete("1.0", f"{line_count - 400}.0")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    @staticmethod
    def _now() -> str:
        return datetime.now().strftime("%H:%M:%S")

    # ----- shutdown -----
    def _stop(self):
        if self.stop_event.is_set():
            return
        self.stop_btn.configure(state="disabled", text="Finishing…")
        self._append_log(f"[{self._now()}] stop requested — finalising lecture…")
        self.stop_event.set()
        # _on_finished() will run when the worker drains its finally block.

    def _on_finished(self):
        self._append_log(f"[{self._now()}] capture finished. Window will close.")
        # Give the user a beat to see the final log before the window closes.
        self.after(1500, self.on_close)


# ----------------------------------------------------------------------
def main() -> int:
    print("[ui] loading .env", flush=True)
    load_dotenv(Path(__file__).with_name(".env"))
    print(
        f"[ui] FIRESTORE_EMULATOR_HOST={os.getenv('FIRESTORE_EMULATOR_HOST') or '(unset)'} "
        f"FIREBASE_PROJECT_ID={os.getenv('FIREBASE_PROJECT_ID') or '(unset)'}",
        flush=True,
    )
    try:
        print("[ui] init firebase…", flush=True)
        db = firebase_writer.init_firebase()
        print("[ui] firebase ready", flush=True)
    except Exception as e:
        import traceback
        print(f"[ui] Firebase init failed: {e}", file=sys.stderr)
        traceback.print_exc()
        return 1
    try:
        print("[ui] building wizard…", flush=True)
        app = CaptureWizard(db)
        print("[ui] entering mainloop", flush=True)
        app.mainloop()
        print("[ui] mainloop returned", flush=True)
        return 0
    except Exception as e:
        import traceback
        print(f"[ui] wizard crashed: {e}", file=sys.stderr)
        traceback.print_exc()
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
