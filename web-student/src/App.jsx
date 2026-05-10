import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import { PageLoader } from "./components/Spinner";
import Login from "./pages/Login";
import StudentDashboard from "./pages/StudentDashboard";
import StudentLectures from "./pages/StudentLectures";
import StudentLiveLecture from "./pages/StudentLiveLecture";
import StudentEngagement from "./pages/StudentEngagement";
import StudentHistory from "./pages/StudentHistory";
import StudentDoctorSearch from "./pages/StudentDoctorSearch";
import StudentGrades from "./pages/StudentGrades";
import StudentAttendance from "./pages/StudentAttendance";
import StudentHierarchy from "./pages/StudentHierarchy";
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
        <Route index element={<StudentDashboard />} />
        <Route path="lectures" element={<StudentLectures />} />
        <Route path="live" element={<StudentLiveLecture />} />
        <Route path="engagement" element={<StudentEngagement />} />
        <Route path="doctor-search" element={<StudentDoctorSearch />} />
        <Route path="grades" element={<StudentGrades />} />
        <Route path="attendance" element={<StudentAttendance />} />
        <Route path="history" element={<StudentHistory />} />
        <Route path="hierarchy" element={<StudentHierarchy />} />
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
