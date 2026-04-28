import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import StudentDashboard from "./pages/StudentDashboard";
import StudentLectures from "./pages/StudentLectures";
import StudentEngagement from "./pages/StudentEngagement";
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
        <Route index element={<StudentDashboard />} />
        <Route path="lectures" element={<StudentLectures />} />
        <Route path="engagement" element={<StudentEngagement />} />
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
