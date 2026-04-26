import { useAuth } from "../auth";
import { Link } from "react-router-dom";

function Header() {
  const { user, logout } = useAuth();

  const displayName = user?.name || user?.username || "Benutzer";

  return (
    <header className="header-modern">
      <div className="header-top">
        <div className="header-brand">
          <span className="header-app-name">
            OSTSCHWEIZ <span>DRUCK</span>
          </span>
        </div>
        <div className="header-actions">
          <span
            style={{
              fontSize: "0.78rem",
              color: "rgba(255,255,255,0.5)",
              alignSelf: "center",
              marginRight: "0.25rem",
              letterSpacing: "0.02em",
            }}
          >
            {displayName}
          </span>
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
    </header>
  );
}

export default Header;
