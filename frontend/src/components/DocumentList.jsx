import { useState, useEffect } from "react";
import { useAuth, authHeaders } from "../auth";

const DOC_CATEGORIES = [
  { value: "all", label: "Alle" },
  { value: "reglement", label: "Reglemente" },
  { value: "info", label: "Mitarbeiter-Info" },
  { value: "sonstiges", label: "Sonstiges" },
];

function DocumentList() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocuments();
  }, []);

  async function fetchDocuments() {
    setLoading(true);
    try {
      const res = await fetch("/api/documents", {
        headers: authHeaders(token),
      });
      const data = await res.json();
      setDocuments(data);
    } catch {
      setDocuments([]);
    }
    setLoading(false);
  }

  const filtered =
    filter === "all"
      ? documents
      : documents.filter((d) => d.category === filter);

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function getIcon(mimetype) {
    if (mimetype?.startsWith("image/")) return "🖼️";
    if (mimetype?.includes("pdf")) return "📄";
    if (mimetype?.includes("word") || mimetype?.includes("document"))
      return "📝";
    if (mimetype?.includes("excel") || mimetype?.includes("sheet")) return "📊";
    return "📎";
  }

  const catLabel = {
    reglement: "Reglement",
    info: "Mitarbeiter-Info",
    sonstiges: "Sonstiges",
  };

  return (
    <div className="documents-container">
      <div className="filter-tabs">
        {DOC_CATEGORIES.map((c) => (
          <button
            key={c.value}
            className={`filter-tab ${filter === c.value ? "active" : ""}`}
            onClick={() => setFilter(c.value)}
          >
            {c.label}
            <span className="tab-count">
              {c.value === "all"
                ? documents.length
                : documents.filter((d) => d.category === c.value).length}
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
          <span className="empty-icon">📁</span>
          <p>Keine Dokumente vorhanden</p>
        </div>
      ) : (
        <div className="document-list">
          {filtered.map((doc) => (
            <a
              key={doc.id}
              href={`/api/uploads/${doc.filename}`}
              target="_blank"
              rel="noopener noreferrer"
              className="document-link-item"
            >
              <span className="document-icon">{getIcon(doc.mimetype)}</span>
              <div className="document-link-info">
                <strong>{doc.name}</strong>
                {doc.description && (
                  <span className="document-desc">{doc.description}</span>
                )}
                <span className="document-meta">
                  {catLabel[doc.category] || doc.category} ·{" "}
                  {formatSize(doc.size)} ·{" "}
                  {new Date(doc.createdAt).toLocaleDateString("de-DE")}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}

      <button className="btn-refresh" onClick={fetchDocuments}>
        🔄 Aktualisieren
      </button>
    </div>
  );
}

export default DocumentList;
