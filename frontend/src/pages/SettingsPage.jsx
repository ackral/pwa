import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import StatusCard from "../components/StatusCard";
import FeaturesCard from "../components/FeaturesCard";
import NotesCard from "../components/NotesCard";
import PushCard from "../components/PushCard";
import Footer from "../components/Footer";

function SettingsPage() {
  const { user, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return (
    <>
      <header>
        <h1>Einstellungen</h1>
        <p className="subtitle">App-Konfiguration & Status</p>
      </header>
      <main>
        <nav className="admin-nav">
          <Link to="/" className="back-link">
            ← Zurück zur Übersicht
          </Link>
        </nav>
        <StatusCard isOnline={isOnline} />
        <FeaturesCard />
        <PushCard />
        <NotesCard />
        <section className="card">
          <h2>Konto</h2>
          <p className="status-text">
            Angemeldet als: <strong>{user?.name || user?.username}</strong> (
            {user?.role})
          </p>
          <div className="btn-group" style={{ marginTop: "0.75rem" }}>
            <button onClick={logout} style={{ background: "#e74c3c" }}>
              Abmelden
            </button>
          </div>
        </section>
        {user?.role === "admin" && (
          <div className="admin-link-wrapper">
            <Link to="/admin" className="admin-link">
              Admin-Bereich →
            </Link>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

export default SettingsPage;
