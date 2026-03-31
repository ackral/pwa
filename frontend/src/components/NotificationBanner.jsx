import { useEffect } from "react";

/**
 * In-app notification banner for iOS Safari compatibility.
 *
 * Props:
 *   title   {string}   – notification title
 *   body    {string}   – notification body text
 *   onClose {function} – called when the banner is dismissed
 */
function NotificationBanner({ title, body, onClose }) {
  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="notification-banner" role="alert" aria-live="polite">
      <div className="notification-banner-content">
        <span className="notification-banner-icon">🔔</span>
        <div className="notification-banner-text">
          {title && (
            <strong className="notification-banner-title">{title}</strong>
          )}
          {body && <p className="notification-banner-body">{body}</p>}
        </div>
      </div>
      <button
        className="notification-banner-close"
        onClick={onClose}
        aria-label="Benachrichtigung schließen"
      >
        ✕
      </button>
    </div>
  );
}

export default NotificationBanner;
