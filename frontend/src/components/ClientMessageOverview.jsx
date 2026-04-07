import { useState, useEffect } from "react";
import { useAuth, authHeaders } from "../auth";

const CATEGORIES = [
  { value: "all", label: "Alle" },
  { value: "event", label: "Events" },
  { value: "intern", label: "Intern" },
  { value: "projekte", label: "Projekte" },
];

const categoryColor = {
  event: "#e74c3c",
  intern: "#4a90d9",
  projekte: "#27ae60",
};

const categoryLabel = {
  event: "Event",
  intern: "Intern",
  projekte: "Projekte",
};

function ClientMessageOverview() {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages();

    // Automatisch aktualisieren wenn ein Push empfangen wird
    const handlePushRefresh = () => fetchMessages();
    window.addEventListener("push-received", handlePushRefresh);
    return () => window.removeEventListener("push-received", handlePushRefresh);
  }, []);

  async function fetchMessages() {
    setLoading(true);
    try {
      const res = await fetch("/api/messages", {
        headers: authHeaders(token),
      });
      const data = await res.json();
      setMessages(data);
    } catch {
      setMessages([]);
    }
    setLoading(false);
  }

  const filtered =
    filter === "all" ? messages : messages.filter((m) => m.category === filter);

  return (
    <div className="messages-container">
      <div className="filter-tabs">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            className={`filter-tab ${filter === c.value ? "active" : ""}`}
            onClick={() => setFilter(c.value)}
          >
            {c.label}
            <span className="tab-count">
              {c.value === "all"
                ? messages.length
                : messages.filter((m) => m.category === c.value).length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">
          <p>Laden…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📭</span>
          <p>Keine Nachrichten vorhanden</p>
        </div>
      ) : (
        <div className="message-list">
          {filtered.map((msg) => (
            <ClientMessageItem key={msg.id} msg={msg} />
          ))}
        </div>
      )}

      <button className="btn-refresh" onClick={fetchMessages}>
        🔄 Aktualisieren
      </button>
    </div>
  );
}

function ClientMessageItem({ msg }) {
  const date = new Date(msg.createdAt).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="message-item"
      style={{ borderLeftColor: categoryColor[msg.category] }}
    >
      <div className="message-header">
        <span
          className="category-badge"
          style={{ background: categoryColor[msg.category] }}
        >
          {categoryLabel[msg.category]}
        </span>
        <span className="message-date">{date}</span>
      </div>
      <strong className="message-title">{msg.title}</strong>
      <div
        className="message-body"
        dangerouslySetInnerHTML={{ __html: msg.body }}
      />
      {msg.imageUrl && (
        <img
          src={msg.imageUrl}
          alt="Bild"
          className="message-image"
          loading="lazy"
        />
      )}
    </div>
  );
}

export default ClientMessageOverview;
