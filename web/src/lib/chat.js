// Chat data layer.
//
// Firestore schema:
//   conversations/{id}
//     participants:       [uid, uid, ...]   ← used for "my conversations" query
//     participants_meta:  { uid: {name, role, email} }   for display
//     kind:               "direct" | "group"
//     title:              optional, used for group chats
//     created_by:         uid
//     created_at:         timestamp
//     last_message:       string
//     last_sender:        uid
//     last_at:            timestamp
//
//   conversations/{id}/messages/{auto_id}
//     sender_uid:  uid
//     sender_name: string
//     sender_role: string
//     text:        string
//     sent_at:     timestamp

import {
  collection, doc, addDoc, getDocs, getDoc, query, where,
  orderBy, onSnapshot, serverTimestamp, updateDoc, setDoc, limit,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Listing ──────────────────────────────────────────────────────────────
// Returns an unsubscribe; calls `cb(conversations[])` whenever any conversation
// I'm part of changes.
export function watchMyConversations(myUid, cb) {
  if (!myUid) { cb([]); return () => {}; }
  const q = query(
    collection(db, "conversations"),
    where("participants", "array-contains", myUid)
  );
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => toMs(b.last_at) - toMs(a.last_at));
    cb(rows);
  }, (err) => {
    console.error("[chat] watchMyConversations:", err);
    cb([]);
  });
}

// Watch messages of a single conversation.
export function watchMessages(conversationId, cb) {
  if (!conversationId) { cb([]); return () => {}; }
  const q = query(
    collection(db, "conversations", conversationId, "messages"),
    orderBy("sent_at", "asc"),
    limit(500)
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error("[chat] watchMessages:", err);
    cb([]);
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────
// Find an existing 1:1 conversation between two users, or create one.
// `meta` is { [uid]: { name, role, email } } for both participants.
export async function getOrCreateDirect(myUid, otherUid, meta) {
  if (!myUid || !otherUid || myUid === otherUid) {
    throw new Error("getOrCreateDirect: invalid participants");
  }
  // Try to find an existing direct conversation.
  const q = query(
    collection(db, "conversations"),
    where("participants", "array-contains", myUid),
    where("kind", "==", "direct")
  );
  const snap = await getDocs(q);
  const found = snap.docs.find((d) => {
    const p = d.data().participants || [];
    return p.length === 2 && p.includes(otherUid);
  });
  if (found) return found.id;

  // Create a new one.
  const ref = await addDoc(collection(db, "conversations"), {
    participants:      [myUid, otherUid],
    participants_meta: meta || {},
    kind:              "direct",
    title:             "",
    created_by:        myUid,
    created_at:        serverTimestamp(),
    last_message:      "",
    last_sender:       null,
    last_at:           serverTimestamp(),
  });
  return ref.id;
}

// Create a group conversation with N participants (doctor → many students).
export async function createGroup(myUid, otherUids, title, meta) {
  const participants = Array.from(new Set([myUid, ...otherUids])).filter(Boolean);
  if (participants.length < 2) throw new Error("group needs at least 2 people");
  const ref = await addDoc(collection(db, "conversations"), {
    participants,
    participants_meta: meta || {},
    kind:              "group",
    title:             title || "Group",
    created_by:        myUid,
    created_at:        serverTimestamp(),
    last_message:      "",
    last_sender:       null,
    last_at:           serverTimestamp(),
  });
  return ref.id;
}

// Send a message in a conversation. Also patches the conversation's
// last_message / last_at fields so the list re-sorts.
export async function sendMessage(conversationId, { senderUid, senderName, senderRole, text }) {
  if (!conversationId || !senderUid || !text?.trim()) return;
  const cleanText = text.trim();
  await addDoc(collection(db, "conversations", conversationId, "messages"), {
    sender_uid:  senderUid,
    sender_name: senderName || "",
    sender_role: senderRole || "",
    text:        cleanText,
    sent_at:     serverTimestamp(),
  });
  await updateDoc(doc(db, "conversations", conversationId), {
    last_message: cleanText.slice(0, 200),
    last_sender:  senderUid,
    last_at:      serverTimestamp(),
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────
function toMs(ts) {
  if (!ts) return 0;
  if (ts.toMillis) return ts.toMillis();
  if (typeof ts === "string") return new Date(ts).getTime();
  return 0;
}

export function formatTs(ts) {
  const ms = toMs(ts);
  if (!ms) return "";
  const d = new Date(ms);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sameDay = new Date(d); sameDay.setHours(0, 0, 0, 0);
  if (sameDay.getTime() === today.getTime()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Build a display label for a conversation from the current user's POV.
export function conversationLabel(conv, myUid) {
  if (!conv) return "";
  if (conv.kind === "group") return conv.title || "Group chat";
  const otherUid = (conv.participants || []).find((u) => u !== myUid);
  const other = conv.participants_meta?.[otherUid];
  if (other?.name) return other.name;
  if (other?.email) return other.email;
  return otherUid || "Unknown";
}

export function conversationSubtitle(conv, myUid) {
  if (!conv) return "";
  if (conv.kind === "group") {
    return `${(conv.participants?.length || 0)} members`;
  }
  const otherUid = (conv.participants || []).find((u) => u !== myUid);
  const role = conv.participants_meta?.[otherUid]?.role;
  return role || "";
}
