import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ChildProvider } from "./context/ChildContext";
import Layout from "./components/Layout";
import { PageLoader } from "./components/Spinner";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import Chat from "./pages/Chat";

// ─── Admin pages ──────────────────────────────────────────────
import AdminDashboard      from "./pages/AdminDashboard";
import AdminAdmins         from "./pages/AdminAdmins";
import AdminDoctors        from "./pages/AdminDoctors";
import AdminStudents       from "./pages/AdminStudents";
import AdminParents        from "./pages/AdminParents";
import AdminSubjects       from "./pages/AdminSubjects";
import AdminClasses        from "./pages/AdminClasses";
import AdminWeeks          from "./pages/AdminWeeks";
import AdminLectures       from "./pages/AdminLectures";
import AdminAnalytics      from "./pages/AdminAnalytics";
import AdminReports        from "./pages/AdminReports";
import AdminAbout          from "./pages/AdminAbout";
import AdminSettings       from "./pages/AdminSettings";
import AdminStudentSearch  from "./pages/AdminStudentSearch";
import AdminGrades         from "./pages/AdminGrades";
import AdminAttendance     from "./pages/AdminAttendance";

// ─── Doctor pages ─────────────────────────────────────────────
import DoctorDashboard       from "./pages/DoctorDashboard";
import DoctorSubjects        from "./pages/DoctorSubjects";
import DoctorClasses         from "./pages/DoctorClasses";
import DoctorWeeks           from "./pages/DoctorWeeks";
import DoctorHierarchy       from "./pages/DoctorHierarchy";
import DoctorLectures        from "./pages/DoctorLectures";
import LiveClassroom         from "./pages/LiveClassroom";
import DoctorCapture         from "./pages/DoctorCapture";
import DoctorAnalytics       from "./pages/DoctorAnalytics";
import DoctorReports         from "./pages/DoctorReports";
import DoctorNotifications   from "./pages/DoctorNotifications";
import DoctorStudentSearch   from "./pages/DoctorStudentSearch";
import DoctorGrades          from "./pages/DoctorGrades";
import DoctorAttendance      from "./pages/DoctorAttendance";

// ─── Student pages ────────────────────────────────────────────
import StudentDashboard      from "./pages/StudentDashboard";
import StudentLectures       from "./pages/StudentLectures";
import StudentLiveLecture    from "./pages/StudentLiveLecture";
import StudentTranscripts    from "./pages/StudentTranscripts";
import StudentEngagement     from "./pages/StudentEngagement";
import StudentHistory        from "./pages/StudentHistory";
import StudentDoctorSearch   from "./pages/StudentDoctorSearch";
import StudentGrades         from "./pages/StudentGrades";
import StudentAttendance     from "./pages/StudentAttendance";
import StudentHierarchy      from "./pages/StudentHierarchy";
import StudentReports        from "./pages/StudentReports";

// ─── Parent pages ─────────────────────────────────────────────
import ParentDashboard    from "./pages/ParentDashboard";
import ParentChildren     from "./pages/ParentChildren";
import ParentAttendance   from "./pages/ParentAttendance";
import ParentGrades       from "./pages/ParentGrades";
import ChildHistory       from "./pages/ChildHistory";
import ChildLectures      from "./pages/ChildLectures";
import ChildSubjects      from "./pages/ChildSubjects";
import ChildWeeks         from "./pages/ChildWeeks";

// ─── Role gate ────────────────────────────────────────────────
function RequireRole({ role, children }) {
  const { profile } = useAuth();
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.role !== role) {
    return <Navigate to={`/${profile.role}`} replace />;
  }
  return children;
}

// Sends authenticated users from "/" to the right home based on role.
function RoleHome() {
  const { profile } = useAuth();
  if (!profile) return <Navigate to="/login" replace />;
  return <Navigate to={`/${profile.role}`} replace />;
}

function Gate() {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user || !profile) {
    if (location.pathname !== "/login") return <Navigate to="/login" replace />;
    return <Login />;
  }

  return (
    <Routes>
      <Route path="/login" element={<RoleHome />} />

      <Route element={<Layout />}>
        <Route index element={<RoleHome />} />

        {/* ── Admin ── */}
        <Route path="admin" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
        <Route path="admin/admins"         element={<RequireRole role="admin"><AdminAdmins /></RequireRole>} />
        <Route path="admin/doctors"        element={<RequireRole role="admin"><AdminDoctors /></RequireRole>} />
        <Route path="admin/students"       element={<RequireRole role="admin"><AdminStudents /></RequireRole>} />
        <Route path="admin/student-search" element={<RequireRole role="admin"><AdminStudentSearch /></RequireRole>} />
        <Route path="admin/parents"        element={<RequireRole role="admin"><AdminParents /></RequireRole>} />
        <Route path="admin/subjects"       element={<RequireRole role="admin"><AdminSubjects /></RequireRole>} />
        <Route path="admin/classes"        element={<RequireRole role="admin"><AdminClasses /></RequireRole>} />
        <Route path="admin/weeks"          element={<RequireRole role="admin"><AdminWeeks /></RequireRole>} />
        <Route path="admin/lectures"       element={<RequireRole role="admin"><AdminLectures /></RequireRole>} />
        <Route path="admin/analytics"      element={<RequireRole role="admin"><AdminAnalytics /></RequireRole>} />
        <Route path="admin/grades"         element={<RequireRole role="admin"><AdminGrades /></RequireRole>} />
        <Route path="admin/attendance"     element={<RequireRole role="admin"><AdminAttendance /></RequireRole>} />
        <Route path="admin/reports"        element={<RequireRole role="admin"><AdminReports /></RequireRole>} />
        <Route path="admin/about"          element={<RequireRole role="admin"><AdminAbout /></RequireRole>} />
        <Route path="admin/settings"       element={<RequireRole role="admin"><AdminSettings /></RequireRole>} />
        <Route path="admin/chat"           element={<RequireRole role="admin"><Chat /></RequireRole>} />

        {/* ── Doctor ── */}
        <Route path="doctor" element={<RequireRole role="doctor"><DoctorDashboard /></RequireRole>} />
        <Route path="doctor/subjects"                 element={<RequireRole role="doctor"><DoctorSubjects /></RequireRole>} />
        <Route path="doctor/classes"                  element={<RequireRole role="doctor"><DoctorClasses /></RequireRole>} />
        <Route path="doctor/weeks"                    element={<RequireRole role="doctor"><DoctorWeeks /></RequireRole>} />
        <Route path="doctor/hierarchy"                element={<RequireRole role="doctor"><DoctorHierarchy /></RequireRole>} />
        <Route path="doctor/lectures"                 element={<RequireRole role="doctor"><DoctorLectures /></RequireRole>} />
        <Route path="doctor/lectures/:lectureId/live"    element={<RequireRole role="doctor"><LiveClassroom /></RequireRole>} />
        <Route path="doctor/lectures/:lectureId/capture" element={<RequireRole role="doctor"><DoctorCapture /></RequireRole>} />
        <Route path="doctor/analytics"                element={<RequireRole role="doctor"><DoctorAnalytics /></RequireRole>} />
        <Route path="doctor/reports"                  element={<RequireRole role="doctor"><DoctorReports /></RequireRole>} />
        <Route path="doctor/grades"                   element={<RequireRole role="doctor"><DoctorGrades /></RequireRole>} />
        <Route path="doctor/attendance"               element={<RequireRole role="doctor"><DoctorAttendance /></RequireRole>} />
        <Route path="doctor/student-search"           element={<RequireRole role="doctor"><DoctorStudentSearch /></RequireRole>} />
        <Route path="doctor/notifications"            element={<RequireRole role="doctor"><DoctorNotifications /></RequireRole>} />
        <Route path="doctor/chat"                     element={<RequireRole role="doctor"><Chat /></RequireRole>} />

        {/* ── Student ── */}
        <Route path="student" element={<RequireRole role="student"><StudentDashboard /></RequireRole>} />
        <Route path="student/lectures"          element={<RequireRole role="student"><StudentLectures /></RequireRole>} />
        <Route path="student/live/:lectureId"   element={<RequireRole role="student"><StudentLiveLecture /></RequireRole>} />
        <Route path="student/transcripts"       element={<RequireRole role="student"><StudentTranscripts /></RequireRole>} />
        <Route path="student/engagement"        element={<RequireRole role="student"><StudentEngagement /></RequireRole>} />
        <Route path="student/doctor-search"     element={<RequireRole role="student"><StudentDoctorSearch /></RequireRole>} />
        <Route path="student/grades"            element={<RequireRole role="student"><StudentGrades /></RequireRole>} />
        <Route path="student/attendance"        element={<RequireRole role="student"><StudentAttendance /></RequireRole>} />
        <Route path="student/history"           element={<RequireRole role="student"><StudentHistory /></RequireRole>} />
        <Route path="student/hierarchy"         element={<RequireRole role="student"><StudentHierarchy /></RequireRole>} />
        <Route path="student/reports"           element={<RequireRole role="student"><StudentReports /></RequireRole>} />
        <Route path="student/chat"              element={<RequireRole role="student"><Chat /></RequireRole>} />

        {/* ── Parent ── */}
        <Route path="parent"            element={<RequireRole role="parent"><ParentDashboard /></RequireRole>} />
        <Route path="parent/children"   element={<RequireRole role="parent"><ParentChildren /></RequireRole>} />
        <Route path="parent/attendance" element={<RequireRole role="parent"><ParentAttendance /></RequireRole>} />
        <Route path="parent/grades"     element={<RequireRole role="parent"><ParentGrades /></RequireRole>} />
        <Route path="parent/child/:childId/history"  element={<RequireRole role="parent"><ChildHistory /></RequireRole>} />
        <Route path="parent/child/:childId/lectures" element={<RequireRole role="parent"><ChildLectures /></RequireRole>} />
        <Route path="parent/child/:childId/subjects" element={<RequireRole role="parent"><ChildSubjects /></RequireRole>} />
        <Route path="parent/child/:childId/weeks"    element={<RequireRole role="parent"><ChildWeeks /></RequireRole>} />
        <Route path="parent/chat"                    element={<RequireRole role="parent"><Chat /></RequireRole>} />

        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ChildProvider>
          <Gate />
        </ChildProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
