import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import { PageLoader } from "./components/Spinner";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import AdminAdmins from "./pages/AdminAdmins";
import AdminDoctors from "./pages/AdminDoctors";
import AdminStudents from "./pages/AdminStudents";
import AdminParents from "./pages/AdminParents";
import AdminSubjects from "./pages/AdminSubjects";
import AdminClasses from "./pages/AdminClasses";
import AdminWeeks from "./pages/AdminWeeks";
import AdminLectures from "./pages/AdminLectures";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminReports from "./pages/AdminReports";
import AdminSettings from "./pages/AdminSettings";
import AdminStudentSearch from "./pages/AdminStudentSearch";
import AdminGrades from "./pages/AdminGrades";
import AdminAttendance from "./pages/AdminAttendance";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

function Gate() {
  const { user, profile, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user || !profile) {
    return <Login />;
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="admins" element={<AdminAdmins />} />
        <Route path="doctors" element={<AdminDoctors />} />
        <Route path="students" element={<AdminStudents />} />
        <Route path="student-search" element={<AdminStudentSearch />} />
        <Route path="parents" element={<AdminParents />} />
        <Route path="subjects" element={<AdminSubjects />} />
        <Route path="classes" element={<AdminClasses />} />
        <Route path="weeks" element={<AdminWeeks />} />
        <Route path="lectures" element={<AdminLectures />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="grades" element={<AdminGrades />} />
        <Route path="attendance" element={<AdminAttendance />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
