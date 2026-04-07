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

const PAGE_SIZE = 5;

function ClientMessageOverview() {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  function handleFilterChange(value) {
    setFilter(value);
    setVisibleCount(PAGE_SIZE);
  }

  const filtered =
    filter === "all" ? messages : messages.filter((m) => m.category === filter);
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="messages-container">
      <div className="filter-tabs">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            className={`filter-tab ${filter === c.value ? "active" : ""}`}
            onClick={() => handleFilterChange(c.value)}
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
        <>
          <div className="message-list">
            {visible.map((msg) => (
              <ClientMessageItem key={msg.id} msg={msg} />
            ))}
          </div>
          {hasMore && (
            <button
              className="btn-load-more"
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            >
              Weitere {Math.min(PAGE_SIZE, filtered.length - visibleCount)}{" "}
              Nachrichten laden
            </button>
          )}
          {!hasMore && filtered.length > PAGE_SIZE && (
            <p className="msg-all-loaded">
              Alle {filtered.length} Nachrichten geladen
            </p>
          )}
        </>
      )}

      <button className="btn-refresh" onClick={fetchMessages}>
        🔄 Aktualisieren
      </button>
    </div>
  );
}

function ClientMessageItem({ msg }) {
  const [expanded, setExpanded] = useState(false);

  const date = new Date(msg.createdAt).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`message-item ${expanded ? "expanded" : ""}`}
      style={{ borderLeftColor: categoryColor[msg.category] }}
      onClick={() => setExpanded((e) => !e)}
    >
      <div className="message-header">
        <span
          className="category-badge"
          style={{ background: categoryColor[msg.category] }}
        >
          {categoryLabel[msg.category]}
        </span>
        <div className="message-header-right">
          <span className="message-date">{date}</span>
          <span className="message-chevron">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      <strong className="message-title">{msg.title}</strong>
      {expanded && (
        <>
          <div
            className="message-body"
            dangerouslySetInnerHTML={{ __html: msg.body }}
            onClick={(e) => e.stopPropagation()}
          />
          {msg.imageUrl && (
            <img
              src={msg.imageUrl}
              alt="Bild"
              className="message-image"
              loading="lazy"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </>
      )}
    </div>
  );
}

export default ClientMessageOverview;
