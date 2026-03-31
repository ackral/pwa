import { useState, useEffect } from "react";
import {
  requestNotificationPermission,
  registerTokenOnServer,
} from "../firebase";

function PushCard() {
  const [permission, setPermission] = useState("default");
  const [title, setTitle] = useState("Hallo!");
  const [body, setBody] = useState("Dies ist eine Test-Benachrichtigung.");
  const [status, setStatus] = useState("");
  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);

      // Automatisch Token registrieren, wenn Berechtigung bereits erteilt
      if (Notification.permission === "granted") {
        requestNotificationPermission()
          .then((token) => {
            if (token) {
              return registerTokenOnServer(token);
            }
          })
          .then(() => console.log("[Push] Token automatisch re-registriert"))
          .catch((err) =>
            console.error("[Push] Auto-Registrierung fehlgeschlagen:", err),
          );
      }
    }
  }, []);

  async function handleAllow() {
    try {
      const token = await requestNotificationPermission();
      if (token) {
        setPermission("granted");
        await registerTokenOnServer(token);
        setStatus("Push-Token registriert!");
      } else {
        setPermission(Notification.permission);
        setStatus(
          Notification.permission === "denied"
            ? "Berechtigung blockiert – bitte in den Browser-Einstellungen erlauben"
            : "Berechtigung nicht erteilt",
        );
      }
    } catch (err) {
      console.error("Push-Fehler:", err);
      setPermission(Notification.permission);
      setStatus("Fehler: " + err.message);
    }
    setTimeout(() => setStatus(""), 5000);
  }

  async function handleSendTest() {
    try {
      const res = await fetch("/api/notifications/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const data = await res.json();
      setStatus(data.message || "Gesendet!");
    } catch {
      setStatus("Fehler beim Senden");
    }
    setTimeout(() => setStatus(""), 3000);
  }

  const notSupported = !("Notification" in window);

  return (
    <>
      <section className="card">
        <h2>Push-Benachrichtigungen</h2>

        {notSupported ? (
          <p className="status-text status-offline">
            Benachrichtigungen werden nicht unterstützt
          </p>
        ) : (
          <p
            className={`status-text ${
              permission === "granted"
                ? "status-online"
                : permission === "denied"
                  ? "status-offline"
                  : "status-warning"
            }`}
          >
            {permission === "granted"
              ? "Berechtigung: Erlaubt ✓"
              : permission === "denied"
                ? "Berechtigung: Blockiert ✗"
                : "Berechtigung: Noch nicht erteilt"}
          </p>
        )}

        <div className="btn-group">
          {permission !== "granted" && !notSupported && (
            <button onClick={handleAllow} disabled={permission === "denied"}>
              Benachrichtigungen erlauben
            </button>
          )}
          {permission === "granted" && (
            <button onClick={handleSendTest}>Test-Nachricht senden</button>
          )}
        </div>

        {permission === "granted" && (
          <div className="notif-form">
            <input
              type="text"
              placeholder="Titel"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              type="text"
              placeholder="Nachricht"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        )}

        {status && <p className="save-status">{status}</p>}
      </section>
    </>
  );
}

export default PushCard;
