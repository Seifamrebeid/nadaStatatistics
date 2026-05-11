import { useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";

/* ── Inline SVG icon helpers ─────────────────────────────────────────── */
function Icon({ d, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {Array.isArray(d) ? d.map((path, i) => <path key={i} d={path} />) : <path d={d} />}
    </svg>
  );
}

const ICONS = {
  dashboard:    ["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z", "M9 22V12h6v10"],
  students:     ["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M23 21v-2a4 4 0 00-3-3.87", "M16 3.13a4 4 0 010 7.75", "M9 7a4 4 0 100 8 4 4 0 000-8z"],
  attendance:   ["M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"],
  analytics:    ["M18 20V10", "M12 20V4", "M6 20v-6"],
  lectures:     ["M15 10l4.553-2.069A1 1 0 0121 8.87V15.13a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"],
  grades:       ["M22 10v6M2 10l10-5 10 5-10 5z", "M6 12v5c3 3 9 3 12 0v-5"],
  doctors:      ["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2", "M12 3a4 4 0 100 8 4 4 0 000-8z"],
  subjects:     ["M4 19.5A2.5 2.5 0 016.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"],
  classes:      ["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"],
  weeks:        ["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 6v6l4 2"],
  parents:      ["M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"],
  admins:       ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  search:       ["M11 19a8 8 0 100-16 8 8 0 000 16z", "M21 21l-4.35-4.35"],
  settings:     ["M12 15a3 3 0 100-6 3 3 0 000 6z", "M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"],
  profile:      ["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2", "M12 3a4 4 0 100 8 4 4 0 000-8z"],
  logout:       ["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  menu:         ["M3 12h18", "M3 6h18", "M3 18h18"],
  close:        ["M18 6L6 18", "M6 6l12 12"],
  bell:         ["M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9", "M13.73 21a2 2 0 01-3.46 0"],
  chevrRight:   "M9 18l6-6-6-6",
};

/* ── Nav configuration ───────────────────────────────────────────────── */
const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { to: "/",              label: "Dashboard",      icon: "dashboard"  },
      { to: "/students",      label: "Students",       icon: "students"   },
      { to: "/attendance",    label: "Attendance",     icon: "attendance" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { to: "/analytics",     label: "Live Analytics", icon: "analytics"  },
      { to: "/lectures",      label: "Lectures",       icon: "lectures"   },
      { to: "/grades",        label: "Grades",         icon: "grades"     },
      { to: "/reports",       label: "Reports",        icon: "reports"    },
    ],
  },
  {
    label: "Management",
    items: [
      { to: "/classes",       label: "Classes",        icon: "classes"    },
      { to: "/subjects",      label: "Subjects",       icon: "subjects"   },
      { to: "/weeks",         label: "Weeks",          icon: "weeks"      },
      { to: "/doctors",       label: "Doctors",        icon: "doctors"    },
      { to: "/admins",        label: "Admins",         icon: "admins"     },
      { to: "/parents",       label: "Parents",        icon: "parents"    },
      { to: "/student-search",label: "Student Search", icon: "search"     },
      { to: "/about",         label: "About project",  icon: "about"      },
      { to: "/settings",      label: "Settings",       icon: "settings"   },
    ],
  },
];

/* human-readable page names from pathname */
const PAGE_NAMES = {
  "/":               "Dashboard",
  "/students":       "Students",
  "/attendance":     "Attendance",
  "/analytics":      "Live Analytics",
  "/lectures":       "Lectures",
  "/grades":         "Grades",
  "/classes":        "Classes",
  "/subjects":       "Subjects",
  "/weeks":          "Weeks",
  "/doctors":        "Doctors",
  "/admins":         "Admins",
  "/parents":        "Parents",
  "/student-search": "Student Search",
  "/settings":       "Settings",
  "/profile":        "Profile",
};

/* ── Component ───────────────────────────────────────────────────────── */
export default function Layout() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await signOut(auth);
    nav("/login", { replace: true });
  }

  const email = profile?.email || "";
  const initials = email.slice(0, 2).toUpperCase() || "AD";
  const currentPage = PAGE_NAMES[location.pathname] || "Page";

  /* ── Sidebar content ─────────────────────────────────────────────── */
  const sidebarContent = (
    <div className="sidebar-bg flex flex-col h-full w-60" style={{ minWidth: 240 }}>
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 relative z-10">
        <div className="flex items-center gap-3">
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: "linear-gradient(135deg, #7c3aed, #6366f1)",
            boxShadow: "0 4px 14px rgba(124,58,237,.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <path d="M9 22V12h6v10" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.2 }}>
              Classroom AI
            </div>
            <div style={{ fontSize: 10.5, color: "#a78bfa", fontWeight: 500 }}>
              Admin Portal
            </div>
          </div>
        </div>
        <button
          className="lg:hidden"
          onClick={() => setMobileOpen(false)}
          style={{ color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 4 }}
        >
          <Icon d={ICONS.close} size={18} />
        </button>
      </div>

      {/* Live pill */}
      <div className="px-5 pb-4 relative z-10">
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.22)",
          borderRadius: 99, padding: "4px 12px",
        }}>
          <span className="live-dot" style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#10b981", display: "inline-block",
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#6ee7b7" }}>2 sessions live</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 relative z-10" style={{ scrollbarWidth: "none" }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-4">
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.09em",
              color: "rgba(148,163,184,.5)", textTransform: "uppercase",
              padding: "0 10px", marginBottom: 4,
            }}>
              {section.label}
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              {section.items.map(({ to, label, icon, badge }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === "/"}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) => isActive ? "nav-active" : ""}
                    style={({ isActive }) => ({
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 10px", borderRadius: 10,
                      textDecoration: "none", border: "1px solid transparent",
                      transition: "background .15s, border .15s",
                      background: isActive ? undefined : "transparent",
                    })}
                  >
                    {({ isActive }) => (
                      <>
                        <span className="nav-item-icon" style={{
                          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: isActive ? "rgba(124,58,237,.35)" : "rgba(255,255,255,.07)",
                          transition: "background .15s",
                        }}>
                          <span style={{ color: isActive ? "#c4b5fd" : "#64748b" }}>
                            <Icon d={ICONS[icon]} size={14} />
                          </span>
                        </span>
                        <span className="nav-item-label" style={{
                          fontSize: 13, fontWeight: isActive ? 700 : 500,
                          color: isActive ? "#e0d7ff" : "#94a3b8",
                          flex: 1, transition: "color .15s",
                        }}>
                          {label}
                        </span>
                        {badge && (
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            background: "rgba(124,58,237,.35)", color: "#c4b5fd",
                            borderRadius: 99, padding: "1px 7px",
                          }}>
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User card */}
      <div className="relative z-10" style={{
        borderTop: "1px solid rgba(255,255,255,.07)",
        padding: "14px 16px 18px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 800, color: "#fff",
            boxShadow: "0 2px 10px rgba(124,58,237,.4)",
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {profile?.name || "Admin"}
            </div>
            <div style={{ fontSize: 10.5, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {email}
            </div>
          </div>
          <span style={{
            fontSize: 9.5, fontWeight: 700, color: "#a78bfa",
            background: "rgba(124,58,237,.18)", borderRadius: 99, padding: "2px 8px",
            whiteSpace: "nowrap",
          }}>
            Admin
          </span>
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            padding: "7px 0", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: "rgba(248,113,113,.08)", color: "#f87171",
            border: "1px solid rgba(248,113,113,.15)", transition: "background .15s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(248,113,113,.16)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(248,113,113,.08)"}
        >
          <Icon d={ICONS.logout} size={13} />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--page-bg)" }}>
      {/* Sidebar — desktop static */}
      <aside className="hidden lg:flex flex-col" style={{
        width: 240, flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto",
      }}>
        {sidebarContent}
      </aside>

      {/* Sidebar — mobile overlay */}
      {mobileOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 40,
            background: "rgba(9,6,26,.55)", backdropFilter: "blur(3px)",
          }}
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className="lg:hidden flex flex-col"
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50,
          width: 240,
          transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform .22s cubic-bezier(.4,0,.2,1)",
        }}
      >
        {sidebarContent}
      </aside>

      {/* Main column */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Topbar */}
        <header className="topbar-glass sticky top-0 z-20" style={{
          height: 60, display: "flex", alignItems: "center",
          paddingLeft: 20, paddingRight: 20, gap: 12,
        }}>
          {/* Hamburger */}
          <button
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#475569", padding: 6, borderRadius: 8,
            }}
          >
            <Icon d={ICONS.menu} size={20} />
          </button>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ color: "#94a3b8", fontWeight: 500 }}>Admin</span>
            <span style={{ color: "#cbd5e1" }}>
              <Icon d={ICONS.chevrRight} size={13} />
            </span>
            <span style={{ color: "#0f172a", fontWeight: 700 }}>{currentPage}</span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Search */}
          <div className="hidden sm:flex" style={{
            alignItems: "center", gap: 8,
            background: "#f1f5f9", border: "1px solid #e2e8f0",
            borderRadius: 10, padding: "6px 12px", width: 200,
          }}>
            <span style={{ color: "#94a3b8" }}><Icon d={ICONS.search} size={14} /></span>
            <input
              placeholder="Search..."
              style={{
                border: "none", background: "transparent", outline: "none",
                fontSize: 12.5, color: "#0f172a", width: "100%",
              }}
            />
          </div>

          {/* Notification bell */}
          <div style={{ position: "relative" }}>
            <button style={{
              background: "none", border: "none", cursor: "pointer", color: "#64748b",
              padding: 7, borderRadius: 9, display: "flex",
              transition: "background .15s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <Icon d={ICONS.bell} size={18} />
            </button>
            <span style={{
              position: "absolute", top: 5, right: 5,
              width: 7, height: 7, borderRadius: "50%",
              background: "#f43f5e", border: "1.5px solid #fff",
            }} />
          </div>

          {/* Avatar */}
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 800, color: "#fff",
            cursor: "pointer", flexShrink: 0,
            boxShadow: "0 2px 8px rgba(124,58,237,.35)",
          }}
            onClick={() => nav("/profile")}
          >
            {initials}
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
