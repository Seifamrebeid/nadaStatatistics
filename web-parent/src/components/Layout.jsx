import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useChildren } from "../context/ChildContext";
import {
  LayoutDashboard,
  Heart,
  CalendarDays,
  BarChart2,
  BookOpen,
  Clock,
  Video,
  Archive,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  GraduationCap,
  ChevronRight,
} from "lucide-react";

/* ── Nav structure ──────────────────────────────────────── */
const NAV_SECTIONS = [
  {
    title: "My Children",
    items: [
      { to: "/",         label: "Dashboard",   icon: LayoutDashboard, end: true },
      { to: "/children", label: "My Children", icon: Heart },
    ],
  },
  {
    title: "Academic",
    items: [
      { to: "/attendance", label: "Attendance", icon: CalendarDays },
      { to: "/grades",     label: "Grades",     icon: BarChart2 },
      { to: "/subjects",   label: "Subjects",   icon: BookOpen },
      { to: "/weeks",      label: "Schedule",   icon: Clock },
      { to: "/lectures",   label: "Lectures",   icon: Video },
      { to: "/history",    label: "History",    icon: Archive },
    ],
  },
];

/* ── Breadcrumb helper ──────────────────────────────────── */
const ROUTE_LABELS = {
  "":           "Dashboard",
  children:     "My Children",
  attendance:   "Attendance",
  grades:       "Grades",
  subjects:     "Subjects",
  weeks:        "Schedule",
  lectures:     "Lectures",
  history:      "History",
  profile:      "Profile",
};

function Breadcrumb() {
  const { pathname } = useLocation();
  const segments = pathname.replace(/^\//, "").split("/").filter(Boolean);
  return (
    <nav className="flex items-center gap-1 text-sm text-slate-500">
      <span className="font-medium text-slate-700">Parent Portal</span>
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
          <span className={i === segments.length - 1 ? "text-brand-600 font-semibold" : ""}>
            {ROUTE_LABELS[seg] ?? seg}
          </span>
        </span>
      ))}
    </nav>
  );
}

/* ── Sidebar ────────────────────────────────────────────── */
function Sidebar({ onClose, profile, handleLogout }) {
  const initials = (profile?.name || profile?.email || "P")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="sidebar-bg w-60 flex flex-col h-full relative z-10">
      {/* Logo */}
      <div className="h-16 px-4 flex items-center justify-between shrink-0">
        <Link to="/" className="flex items-center gap-2.5" onClick={onClose}>
          {/* Logo mark */}
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shadow-lg shrink-0"
            style={{ background: "linear-gradient(135deg,#f97316,#f59e0b)" }}
          >
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-bold text-white tracking-tight">
              Classroom AI
            </div>
            <div className="text-[10px] font-medium tracking-widest uppercase"
              style={{ color: "#f97316" }}>
              Parent Portal
            </div>
          </div>
        </Link>
        {/* Mobile close */}
        <button
          className="lg:hidden text-orange-300/70 hover:text-white transition-colors"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Live pill */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{ background: "rgba(249,115,22,.12)", border: "1px solid rgba(249,115,22,.2)" }}>
          <span
            className="live-dot h-2 w-2 rounded-full shrink-0"
            style={{ background: "#f97316" }}
          />
          <span className="text-[11px] font-semibold" style={{ color: "#fdba74" }}>
            1 session live now
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: "rgba(249,115,22,.55)" }}>
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `nav-item${isActive ? " nav-active" : ""}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className="nav-item-icon">
                          <Icon
                            className="h-3.5 w-3.5"
                            style={{ color: isActive ? "#fdba74" : "#a8a29e" }}
                          />
                        </span>
                        <span className="nav-item-label truncate">{label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="shrink-0 px-3 pb-4"
        style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}>
        {/* Avatar + info */}
        <div className="flex items-center gap-3 px-2 py-3">
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 shadow"
            style={{ background: "linear-gradient(135deg,#f97316,#f59e0b)" }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white truncate">
              {profile?.name || "Parent"}
            </div>
            <div className="text-[11px] truncate" style={{ color: "#a8a29e" }}>
              {profile?.email}
            </div>
          </div>
        </div>
        {/* Role badge */}
        <div className="px-2 mb-2">
          <span
            className="badge text-[10px]"
            style={{ background: "rgba(249,115,22,.15)", color: "#fdba74",
                     border: "1px solid rgba(249,115,22,.2)" }}
          >
            Parent Account
          </span>
        </div>
        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
          style={{ color: "#a8a29e" }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "rgba(255,255,255,.07)";
            e.currentTarget.style.color = "#fde8d0";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#a8a29e";
          }}
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </aside>
  );
}

/* ── Layout root ────────────────────────────────────────── */
export default function Layout() {
  const { profile } = useAuth();
  const { children: kids, selectedId, setSelected } = useChildren();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = (profile?.name || profile?.email || "P")
    .slice(0, 2)
    .toUpperCase();

  async function handleLogout() {
    await signOut(auth);
    nav("/login", { replace: true });
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--page-bg)" }}>
      {/* ── Sidebar — desktop static, mobile drawer ── */}
      <div
        className={`fixed lg:static inset-y-0 left-0 z-40 flex flex-col transform transition-transform duration-200 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        style={{ width: 240 }}
      >
        <Sidebar
          onClose={() => setMobileOpen(false)}
          profile={profile}
          handleLogout={handleLogout}
        />
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: "rgba(15,23,42,.55)", backdropFilter: "blur(2px)" }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Main column ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="topbar-glass h-16 flex items-center px-4 lg:px-6 gap-4 sticky top-0 z-20">
          {/* Hamburger */}
          <button
            className="lg:hidden text-slate-500 hover:text-slate-900 transition-colors"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Breadcrumb */}
          <div className="hidden sm:block">
            <Breadcrumb />
          </div>

          <div className="flex-1" />

          {/* Child selector */}
          {kids.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs font-medium text-slate-500">
                Viewing:
              </span>
              <select
                value={selectedId || ""}
                onChange={(e) => setSelected(e.target.value)}
                className="input"
                style={{ width: "auto", padding: "6px 10px", fontSize: "12px" }}
              >
                {kids.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 text-xs">
            <Search className="h-3.5 w-3.5" />
            <span>Search…</span>
          </div>

          {/* Bell */}
          <button className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700">
            <Bell className="h-4.5 w-4.5 h-[18px] w-[18px]" />
            <span
              className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full"
              style={{ background: "#f97316" }}
            />
          </button>

          {/* Avatar */}
          <div className="flex items-center gap-2.5">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow"
              style={{ background: "linear-gradient(135deg,#f97316,#f59e0b)" }}
            >
              {initials}
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="text-xs font-semibold text-slate-800 max-w-[120px] truncate">
                {profile?.name || "Parent"}
              </div>
              <div
                className="text-[10px] font-semibold px-1.5 py-px rounded-full"
                style={{ background: "#fff7ed", color: "#ea580c" }}
              >
                Parent
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 lg:px-8 py-6 lg:py-8">
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
