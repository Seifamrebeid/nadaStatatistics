import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ChildProvider } from "./context/ChildContext";
import Layout from "./components/Layout";
import { PageLoader } from "./components/Spinner";
import Login from "./pages/Login";
import ParentDashboard from "./pages/ParentDashboard";
import ParentChildren from "./pages/ParentChildren";
import ChildSubjects from "./pages/ChildSubjects";
import ChildWeeks from "./pages/ChildWeeks";
import ChildLectures from "./pages/ChildLectures";
import ChildHistory from "./pages/ChildHistory";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

function Gate() {
  const { user, profile, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user || !profile) {
    return <Login />;
  }
  return (
    <ChildProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ParentDashboard />} />
          <Route path="children" element={<ParentChildren />} />
          <Route path="subjects" element={<ChildSubjects />} />
          <Route path="weeks" element={<ChildWeeks />} />
          <Route path="lectures" element={<ChildLectures />} />
          <Route path="history" element={<ChildHistory />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ChildProvider>
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
