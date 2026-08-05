import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { PageSpinner } from "./components/ui/Spinner";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Onboarding } from "./pages/Onboarding";
import { Dashboard } from "./pages/Dashboard";
import { Transactions } from "./pages/Transactions";
import { Insights } from "./pages/Insights";
import { Goals } from "./pages/Goals";
import { Investments } from "./pages/Investments";
import { Chat } from "./pages/Chat";
import { Academy } from "./pages/Academy";
import { Settings } from "./pages/Settings";
import { NotFound } from "./pages/NotFound";
function PrivateArea() {
  const {
    user,
    loading
  } = useAuth();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.onboarding_done) return <Navigate to="/onboarding" replace />;
  return <Layout />;
}
function PublicOnly({
  children
}) {
  const {
    user,
    loading
  } = useAuth();
  if (loading) return <PageSpinner />;
  if (user) return <Navigate to={user.onboarding_done ? "/" : "/onboarding"} replace />;
  return <>{children}</>;
}
function OnboardingGuard() {
  const {
    user,
    loading
  } = useAuth();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.onboarding_done) return <Navigate to="/" replace />;
  return <Onboarding />;
}
export default function App() {
  return <Routes>
      <Route path="/login" element={<PublicOnly>
            <Login />
          </PublicOnly>} />
      <Route path="/registro" element={<PublicOnly>
            <Register />
          </PublicOnly>} />
      <Route path="/onboarding" element={<OnboardingGuard />} />

      <Route element={<PrivateArea />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transacciones" element={<Transactions />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/metas" element={<Goals />} />
        <Route path="/inversiones" element={<Investments />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/academy" element={<Academy />} />
        <Route path="/configuracion" element={<Settings />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>;
}
