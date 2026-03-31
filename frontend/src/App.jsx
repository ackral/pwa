import { useState, useEffect, useCallback } from "react";
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
import NotificationBanner from "./components/NotificationBanner";
import { onForegroundMessage } from "./firebase";

// localStorage key used to track the last message ID the user has seen
// so we don't re-show the same banner on every focus event.
const LAST_SEEN_KEY = "lastSeenMessageId";

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
  const { user, loading, token } = useAuth();
  const [toast, setToast] = useState(null);
  const [banner, setBanner] = useState(null);

  // ── In-app notification check (iOS Safari fallback) ──────────
  // Fetches the latest message from the API and shows a banner if
  // it hasn't been seen yet. Runs on mount and whenever the user
  // returns to the app (window focus / tab visibility change).
  const checkMessages = useCallback(async () => {
    // Only check when a user is logged in and a token is available
    if (!user || !token) return;
    try {
      const res = await fetch("/api/messages", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        console.warn("[InAppNotif] Auth failed (401) – token may be expired");
        return;
      }
      if (!res.ok) return;
      const messages = await res.json();
      if (!Array.isArray(messages) || messages.length === 0) return;

      // The API returns messages newest-first; show the most recent one
      const latest = messages[0];
      const lastSeenId = localStorage.getItem(LAST_SEEN_KEY);

      // Only show the banner when there is a genuinely new message
      if (String(latest.id) !== String(lastSeenId)) {
        setBanner({ title: latest.title, body: latest.body, id: latest.id });
      }
    } catch (err) {
      console.error("[InAppNotif] Failed to check messages:", err);
    }
  }, [user, token]);

  // Dismiss the banner and remember this message as seen
  const dismissBanner = useCallback(() => {
    if (banner) {
      localStorage.setItem(LAST_SEEN_KEY, String(banner.id));
    }
    setBanner(null);
  }, [banner]);

  useEffect(() => {
    // Check on mount
    checkMessages();

    // Check when the browser window regains focus
    window.addEventListener("focus", checkMessages);

    // Check when the tab becomes visible again (e.g. switching back on mobile)
    const handleVisibilityChange = () => {
      if (!document.hidden) checkMessages();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", checkMessages);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkMessages]);

  // ── Firebase foreground push (Android / desktop) ─────────────
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
      {banner && (
        <NotificationBanner
          title={banner.title}
          body={banner.body}
          onClose={dismissBanner}
        />
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
