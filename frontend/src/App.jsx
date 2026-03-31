import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Header from "./components/Header";
import ClientMessageOverview from "./components/ClientMessageOverview";
import EventCalendar from "./components/EventCalendar";
import DocumentList from "./components/DocumentList";
import Footer from "./components/Footer";
import AdminPage from "./pages/AdminPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import { onForegroundMessage } from "./firebase";

function ProtectedRoute({ children, adminOnly }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main style={{ textAlign: "center", padding: "3rem" }}>
        <p>Laden…</p>
      </main>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function HomePage() {
  const { user, token } = useAuth();
  const [events, setEvents] = useState([]);

  useEffect(() => {
    fetch("/api/messages", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then((data) => {
        setEvents(data.filter((m) => m.category === "event"));
      })
      .catch(() => setEvents([]));
  }, [token]);

  return (
    <>
      <Header />
      <main>
        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">💬 Nachrichten</h2>
          </div>
          <ClientMessageOverview />
        </section>

        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">📅 Kalender</h2>
          </div>
          <EventCalendar events={events} />
        </section>

        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">📋 Dokumente</h2>
          </div>
          <DocumentList />
        </section>
      </main>

      {user?.role === "admin" && (
        <nav className="bottom-nav">
          <Link to="/admin" className="nav-link nav-link-admin">
            🛠️ Admin-Bereich
          </Link>
        </nav>
      )}

      <Footer />
    </>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const unsubscribe = onForegroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      setToast({ title, body });
      setTimeout(() => setToast(null), 5000);
    });
    return () => unsubscribe;
  }, []);

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            !loading && user ? <Navigate to="/" replace /> : <LoginPage />
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Routes>
      {toast && (
        <div className="toast">
          <strong>{toast.title}</strong>
          <p>{toast.body}</p>
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
