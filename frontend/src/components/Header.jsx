import { useAuth } from "../auth";
import { Link } from "react-router-dom";

function Header() {
  const { user, logout } = useAuth();

  const displayName = user?.name || user?.username || "Benutzer";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";

  return (
    <header className="header-modern">
      <div className="header-top">
        <div className="header-brand">
          <span className="header-logo">📱</span>
          <span className="header-app-name">Meine PWA</span>
        </div>
        <div className="header-actions">
          <Link
            to="/settings"
            className="header-icon-btn"
            title="Einstellungen"
          >
            ⚙️
          </Link>
          <button onClick={logout} className="header-icon-btn" title="Abmelden">
            🚪
          </button>
        </div>
      </div>
      <div className="header-welcome">
        <div className="header-avatar">{initials}</div>
        <div>
          <p className="header-greeting">{greeting},</p>
          <h1 className="header-username">{displayName}</h1>
        </div>
      </div>
    </header>
  );
}

export default Header;
