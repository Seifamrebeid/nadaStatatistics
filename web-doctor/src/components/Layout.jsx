import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";

/* ─── Inline SVG icons ──────────────────────────────────────────────────── */
const Icon = {
  Dashboard: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  Classes: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M3 9l9-6 9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  Attendance: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  Live: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="12" r="3" /><path d="M2 12C2 6.5 6.5 2 12 2s10 4.5 10 10-4.5 10-10 10S2 17.5 2 12" />
      <path d="M5.6 5.6l12.8 12.8M5.6 18.4L18.4 5.6" />
    </svg>
  ),
  Analytics: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Subjects: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  Weeks: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Lectures: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  Grades: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  ),
  Search: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Bell: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Messages: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Hierarchy: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
      <path d="M12 7v4M12 11l-5.5 6M12 11l5.5 6" />
    </svg>
  ),
  Profile: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Logout: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Menu: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  Close: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

/* ─── Nav structure ─────────────────────────────────────────────────────── */
const NAV_SECTIONS = [
  {
    title: "Overview",
    items: [
      { to: "/",                label: "Dashboard",      icon: "Dashboard" },
      { to: "/classes",         label: "My Classes",     icon: "Classes" },
      { to: "/attendance",      label: "Attendance",     icon: "Attendance" },
    ],
  },
  {
    title: "Live",
    items: [
      { to: "/lectures",        label: "Live Classroom", icon: "Live",      live: true },
      { to: "/analytics",       label: "Analytics",      icon: "Analytics" },
      { to: "/reports",         label: "Reports",        icon: "Reports" },
    ],
  },
  {
    title: "Management",
    items: [
      { to: "/subjects",        label: "Subjects",       icon: "Subjects" },
      { to: "/weeks",           label: "Weeks",          icon: "Weeks" },
      { to: "/lectures",        label: "Lectures",       icon: "Lectures" },
      { to: "/grades",          label: "Grades",         icon: "Grades" },
      { to: "/student-search",  label: "Student Search", icon: "Search" },
      { to: "/notifications",   label: "Notifications",  icon: "Bell" },
      { to: "/hierarchy",       label: "Hierarchy",      icon: "Hierarchy" },
      { to: "/profile",         label: "Profile",        icon: "Profile" },
    ],
  },
];

/* ─── Route → breadcrumb label ─────────────────────────────────────────── */
const BREADCRUMB_MAP = {
  "/":               "Dashboard",
  "/classes":        "My Classes",
  "/attendance":     "Attendance",
  "/lectures":       "Lectures",
  "/analytics":      "Analytics",
  "/subjects":       "Subjects",
  "/weeks":          "Weeks",
  "/grades":         "Grades",
  "/student-search": "Student Search",
  "/notifications":  "Notifications",
  "/hierarchy":      "Hierarchy",
  "/profile":        "Profile",
};

/* ─── NavItem ───────────────────────────────────────────────────────────── */
function NavItem({ to, label, iconName, live = false, onClose }) {
  const IconComp = Icon[iconName];
  return (
    <NavLink
      to={to}
      end={to === "/"}
      onClick={onClose}
      className={({ isActive }) =>
        `group flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 cursor-pointer relative
         ${isActive
           ? "nav-active"
           : "border border-transparent hover:bg-white/[.06] hover:border-white/10"
         }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`nav-item-icon h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors
              ${isActive
                ? "bg-[rgba(20,184,166,.3)]"
                : "bg-white/[.07] group-hover:bg-white/[.12]"
              }`}
          >
            {IconComp && (
              <span className={isActive ? "text-[#5eead4]" : "text-white/50 group-hover:text-white/80"}>
                <IconComp />
              </span>
            )}
          </span>
          <span
            className={`nav-item-label flex-1 transition-colors
              ${isActive ? "text-[#ccfbf1] font-bold" : "text-white/60 group-hover:text-white/90 font-medium"}`}
          >
            {label}
          </span>
          {live && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-wide">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 live-dot inline-block" />
              Live
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

/* ─── Sidebar content ───────────────────────────────────────────────────── */
function SidebarContent({ profile, liveSessions = 2, onClose, onLogout }) {
  const initials = (profile?.name || profile?.email || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="sidebar-bg h-full flex flex-col w-60 overflow-hidden">
      {/* Logo */}
      <div className="relative z-10 px-4 pt-5 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">Classroom AI</div>
            <div className="text-white/40 text-[10px] font-medium tracking-wide">Doctor Portal</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden text-white/40 hover:text-white/80 transition-colors"
        >
          <Icon.Close />
        </button>
      </div>

      {/* Live pill */}
      <div className="relative z-10 px-4 mb-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[.06] border border-white/[.08]">
          <span className="h-2 w-2 rounded-full bg-emerald-400 live-dot flex-shrink-0" />
          <span className="text-[11px] text-white/60 font-medium">{liveSessions} sessions live</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex-1 overflow-y-auto px-3 py-2 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/25">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavItem
                  key={item.to + item.label}
                  to={item.to}
                  label={item.label}
                  iconName={item.icon}
                  live={item.live}
                  onClose={onClose}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User card */}
      <div className="relative z-10 p-3 border-t border-white/[.08]">
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[.06] border border-white/[.08] mb-2">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #14b8a6, #06b6d4)" }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-semibold truncate leading-tight">
              {profile?.name || "Doctor"}
            </div>
            <div className="text-white/40 text-[10px] truncate">{profile?.email}</div>
          </div>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[rgba(20,184,166,.2)] text-[#5eead4] border border-[rgba(20,184,166,.25)] uppercase tracking-wide flex-shrink-0">
            Doctor
          </span>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-white/50 hover:text-white/90 hover:bg-white/[.06] border border-transparent hover:border-white/10 text-xs font-medium transition-all"
        >
          <Icon.Logout />
          Sign out
        </button>
      </div>
    </div>
  );
}

/* ─── Layout ────────────────────────────────────────────────────────────── */
export default function Layout() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchVal, setSearchVal] = useState("");

  // Close sidebar on route change (mobile)
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  async function handleLogout() {
    await signOut(auth);
    navigate("/login", { replace: true });
  }

  const initials = (profile?.name || profile?.email || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const breadcrumb = BREADCRUMB_MAP[location.pathname] ?? "Page";

  return (
    <div className="min-h-screen flex" style={{ background: "var(--page-bg)" }}>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 sticky top-0 h-screen z-30">
        <SidebarContent
          profile={profile}
          onClose={() => {}}
          onLogout={handleLogout}
        />
      </aside>

      {/* ── Mobile sidebar ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-60 transform transition-transform duration-250 ease-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent
          profile={profile}
          onClose={() => setMobileOpen(false)}
          onLogout={handleLogout}
        />
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="topbar-glass sticky top-0 z-20 h-14 flex items-center px-4 lg:px-6 gap-4">
          {/* Hamburger */}
          <button
            className="lg:hidden text-slate-500 hover:text-slate-900 transition-colors"
            onClick={() => setMobileOpen(true)}
          >
            <Icon.Menu />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400 font-medium hidden sm:inline">Doctor Portal</span>
            <span className="text-slate-300 hidden sm:inline">/</span>
            <span className="text-slate-700 font-semibold">{breadcrumb}</span>
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="hidden md:flex items-center gap-2 bg-slate-100/80 border border-slate-200 rounded-xl px-3 py-1.5 w-52 focus-within:ring-2 focus-within:ring-[rgba(20,184,166,.25)] focus-within:border-[#2dd4bf] transition-all">
            <Icon.Search />
            <input
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              placeholder="Quick search…"
              className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none w-full"
            />
          </div>

          {/* Bell */}
          <button className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors">
            <Icon.Bell />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
          </button>

          {/* Settings */}
          <button className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors hidden sm:inline-flex">
            <Icon.Settings />
          </button>

          {/* Avatar */}
          <div
            className="h-8 w-8 rounded-xl flex items-center justify-center text-white text-xs font-bold cursor-pointer shadow flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #14b8a6, #06b6d4)" }}
          >
            {initials}
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
