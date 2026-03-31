import { useState, useEffect } from "react";
import { useAuth, authHeaders } from "../auth";

const CATEGORIES = [
  { value: "all", label: "Alle" },
  { value: "event", label: "Event" },
  { value: "intern", label: "Intern" },
  { value: "projekte", label: "Projekte" },
];

function AdminMessageOverview() {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages();
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

  async function handleDelete(id) {
    try {
      await fetch(`/api/messages/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch {
      /* ignore */
    }
  }

  const filtered =
    filter === "all" ? messages : messages.filter((m) => m.category === filter);

  const grouped = CATEGORIES.filter((c) => c.value !== "all").reduce(
    (acc, cat) => {
      acc[cat.value] = filtered.filter((m) => m.category === cat.value);
      return acc;
    },
    {},
  );

  const categoryLabel = {
    event: "Event",
    intern: "Intern",
    projekte: "Projekte",
  };

  const categoryColor = {
    event: "#e74c3c",
    intern: "#4a90d9",
    projekte: "#27ae60",
  };

  return (
    <section className="card">
      <h2>Nachrichten-Übersicht</h2>

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
        <p className="status-text">Laden…</p>
      ) : filtered.length === 0 ? (
        <p className="status-text">Keine Nachrichten vorhanden</p>
      ) : filter !== "all" ? (
        <div className="message-list">
          {filtered.map((msg) => (
            <MessageItem
              key={msg.id}
              msg={msg}
              categoryLabel={categoryLabel}
              categoryColor={categoryColor}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        Object.entries(grouped)
          .filter(([, msgs]) => msgs.length > 0)
          .map(([cat, msgs]) => (
            <div key={cat} className="message-group">
              <h3 style={{ color: categoryColor[cat] }}>
                {categoryLabel[cat]}
              </h3>
              <div className="message-list">
                {msgs.map((msg) => (
                  <MessageItem
                    key={msg.id}
                    msg={msg}
                    categoryLabel={categoryLabel}
                    categoryColor={categoryColor}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))
      )}

      <div className="btn-group" style={{ marginTop: "1rem" }}>
        <button onClick={fetchMessages}>Aktualisieren</button>
      </div>
    </section>
  );
}

function MessageItem({ msg, categoryLabel, categoryColor, onDelete }) {
  const date = new Date(msg.createdAt).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="message-item">
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
      <p className="message-body">{msg.body}</p>
      {msg.imageUrl && (
        <img
          src={msg.imageUrl}
          alt="Bild"
          className="message-image"
          loading="lazy"
        />
      )}
      <div className="message-footer">
        <span className="message-sent">An {msg.sentTo} Geräte gesendet</span>
        <button className="btn-delete" onClick={() => onDelete(msg.id)}>
          Löschen
        </button>
      </div>
    </div>
  );
}

export default AdminMessageOverview;
