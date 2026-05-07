import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import { PageLoader } from "./components/Spinner";
import Login from "./pages/Login";
import DoctorDashboard from "./pages/DoctorDashboard";
import DoctorSubjects from "./pages/DoctorSubjects";
import DoctorClasses from "./pages/DoctorClasses";
import DoctorWeeks from "./pages/DoctorWeeks";
import DoctorHierarchy from "./pages/DoctorHierarchy";
import DoctorLectures from "./pages/DoctorLectures";
import DoctorAnalytics from "./pages/DoctorAnalytics";
import DoctorNotifications from "./pages/DoctorNotifications";
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
        <Route index element={<DoctorDashboard />} />
        <Route path="subjects" element={<DoctorSubjects />} />
        <Route path="classes" element={<DoctorClasses />} />
        <Route path="weeks" element={<DoctorWeeks />} />
        <Route path="hierarchy" element={<DoctorHierarchy />} />
        <Route path="lectures" element={<DoctorLectures />} />
        <Route path="analytics" element={<DoctorAnalytics />} />
        <Route path="notifications" element={<DoctorNotifications />} />
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
