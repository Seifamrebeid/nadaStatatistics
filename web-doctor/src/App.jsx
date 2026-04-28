import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLectures from "./pages/AdminLectures";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminSettings from "./pages/AdminSettings";
import DoctorNotifications from "./pages/DoctorNotifications";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

function Gate() {
  const { user, profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }
  if (!user || !profile) {
    return <Login />;
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="lectures" element={<AdminLectures />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="notifications" element={<DoctorNotifications />} />
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
