import { useEffect, useRef, useState } from "react";
import { Plus, Send, MessageSquare, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  watchMyConversations, watchMessages, sendMessage,
  conversationLabel, conversationSubtitle, formatTs,
} from "../lib/chat";
import NewChatModal from "../components/NewChatModal";

// Shared chat page — same component for admin/doctor/student/parent.
// Permissions are open in the demo (Firestore rules in the emulator are
// permissive); the contact picker filters whom you can reach.

export default function Chat() {
  const { profile } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  // Subscribe to my conversations
  useEffect(() => {
    if (!profile?.uid) return;
    return watchMyConversations(profile.uid, (list) => {
      setConversations(list);
      // Auto-select the most recent conversation if none selected.
      setActiveId((cur) => cur || list[0]?.id || null);
    });
  }, [profile?.uid]);

  // Subscribe to messages for the active conversation
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    return watchMessages(activeId, setMessages);
  }, [activeId]);

  // Scroll to the bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeId]);

  async function handleSend(e) {
    e?.preventDefault?.();
    if (!draft.trim() || !activeId || !profile) return;
    setSending(true);
    try {
      await sendMessage(activeId, {
        senderUid:  profile.uid,
        senderName: profile.name || profile.email,
        senderRole: profile.role,
        text:       draft,
      });
      setDraft("");
    } catch (e) {
      alert(e.message);
    } finally {
      setSending(false);
    }
  }

  const activeConv = conversations.find((c) => c.id === activeId);
  const allowGroups = profile?.role === "doctor" || profile?.role === "admin";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Messages</h1>
          <p className="text-sm text-slate-500">
            Real-time chat across roles. Pick a conversation or start a new one.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="btn btn-primary inline-flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
      </div>

      <div className="card overflow-hidden" style={{ height: "calc(100vh - 220px)", minHeight: 480 }}>
        <div className="flex h-full">
          {/* ─── Conversation list ─── */}
          <aside className="w-64 lg:w-80 border-r border-slate-100 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 text-xs font-bold uppercase tracking-wider text-slate-500">
              Conversations · {conversations.length}
            </div>
            <ul className="flex-1 overflow-y-auto">
              {conversations.length === 0 && (
                <li className="px-4 py-8 text-sm text-slate-400 text-center">
                  No chats yet.<br/>Click <b>New chat</b> to start.
                </li>
              )}
              {conversations.map((c) => {
                const isActive = c.id === activeId;
                const label = conversationLabel(c, profile?.uid);
                const sub = conversationSubtitle(c, profile?.uid);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setActiveId(c.id)}
                      className={`w-full text-left px-4 py-3 border-l-4 transition ${
                        isActive
                          ? "bg-brand-50 border-brand-600"
                          : "border-transparent hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                          c.kind === "group" ? "bg-amber-500" : "bg-brand-600"
                        }`}>
                          {c.kind === "group"
                            ? <Users className="h-4 w-4" />
                            : (label || "?").split(/[\s@.]/).filter(Boolean).map(s => s[0]).join("").slice(0,2).toUpperCase()
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900 truncate">{label}</span>
                            <span className="text-[10px] text-slate-400 shrink-0">{formatTs(c.last_at)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {sub && (
                              <span className="text-[10px] uppercase font-bold text-brand-700 tracking-wide">{sub}</span>
                            )}
                            <span className="text-xs text-slate-500 truncate">{c.last_message || "(no messages yet)"}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* ─── Active conversation ─── */}
          <section className="flex-1 flex flex-col min-w-0">
            {!activeConv && (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                <MessageSquare className="h-12 w-12 mb-2 opacity-40" />
                <div className="text-sm">Pick a conversation to start chatting.</div>
              </div>
            )}
            {activeConv && (
              <>
                <header className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                    activeConv.kind === "group" ? "bg-amber-500" : "bg-brand-600"
                  }`}>
                    {activeConv.kind === "group"
                      ? <Users className="h-4 w-4" />
                      : (conversationLabel(activeConv, profile?.uid) || "?").split(/[\s@.]/).filter(Boolean).map(s => s[0]).join("").slice(0,2).toUpperCase()
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">
                      {conversationLabel(activeConv, profile?.uid)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {activeConv.kind === "group"
                        ? `${activeConv.participants?.length || 0} members · ${conversationSubtitle(activeConv, profile?.uid)}`
                        : conversationSubtitle(activeConv, profile?.uid)
                      }
                    </div>
                  </div>
                </header>

                <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2 bg-slate-50/40">
                  {messages.length === 0 && (
                    <div className="text-center text-sm text-slate-400 py-8">
                      No messages yet. Say hi 👋
                    </div>
                  )}
                  {messages.map((m) => {
                    const mine = m.sender_uid === profile?.uid;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                          mine
                            ? "bg-brand-600 text-white rounded-br-md"
                            : "bg-white border border-slate-100 text-slate-900 rounded-bl-md"
                        }`}>
                          {!mine && activeConv.kind === "group" && (
                            <div className="text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                              {m.sender_name || "—"}
                            </div>
                          )}
                          <div className="whitespace-pre-wrap break-words">{m.text}</div>
                          <div className={`text-[10px] mt-0.5 ${mine ? "text-white/70" : "text-slate-400"} text-right`}>
                            {formatTs(m.sent_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={handleSend} className="px-4 py-3 border-t border-slate-100 flex items-end gap-2 bg-white">
                  <textarea
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Type a message. Enter to send, Shift+Enter for a new line."
                    className="flex-1 resize-none border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
                    style={{ maxHeight: 120 }}
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="btn btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    Send
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>

      <NewChatModal
        open={showNew}
        onClose={() => setShowNew(false)}
        myProfile={profile}
        allowGroups={allowGroups}
        onCreated={(id) => setActiveId(id)}
      />
    </div>
  );
}
