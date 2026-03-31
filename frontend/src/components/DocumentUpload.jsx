import { useState, useEffect } from "react";
import { useAuth, authHeaders } from "../auth";

const DOC_CATEGORIES = [
  { value: "reglement", label: "Reglement" },
  { value: "info", label: "Mitarbeiter-Info" },
  { value: "sonstiges", label: "Sonstiges" },
];

function DocumentUpload() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [category, setCategory] = useState("info");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);

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

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setStatus("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);
    formData.append("description", description);

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: authHeaders(token),
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus("Dokument hochgeladen");
      setFile(null);
      setDescription("");
      // Reset file input
      e.target.reset();
      fetchDocuments();
    } catch (err) {
      setStatus("Fehler: " + err.message);
    }
    setUploading(false);
    setTimeout(() => setStatus(""), 3000);
  }

  async function handleDelete(id) {
    if (!confirm("Dokument wirklich löschen?")) return;
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchDocuments();
    } catch (err) {
      setStatus("Fehler: " + err.message);
      setTimeout(() => setStatus(""), 3000);
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  const catLabel = Object.fromEntries(
    DOC_CATEGORIES.map((c) => [c.value, c.label]),
  );

  return (
    <section className="card">
      <h2>📁 Dokumente verwalten</h2>

      <form className="admin-form" onSubmit={handleUpload}>
        <label>
          Kategorie
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {DOC_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Beschreibung
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Kurze Beschreibung"
          />
        </label>
        <label>
          Datei
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0] || null)}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
            required
          />
        </label>
        <button type="submit" disabled={uploading || !file}>
          {uploading ? "Wird hochgeladen…" : "Hochladen"}
        </button>
        {status && <p className="send-status">{status}</p>}
      </form>

      <h3 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>
        Hochgeladene Dokumente
      </h3>

      {loading ? (
        <p className="status-text">Laden…</p>
      ) : documents.length === 0 ? (
        <p className="status-text">Keine Dokumente vorhanden</p>
      ) : (
        <div className="document-list">
          {documents.map((doc) => (
            <div key={doc.id} className="document-item">
              <div className="document-info">
                <strong>{doc.name}</strong>
                <span className="document-meta">
                  {catLabel[doc.category] || doc.category} ·{" "}
                  {formatSize(doc.size)} · {doc.uploadedBy} ·{" "}
                  {new Date(doc.createdAt).toLocaleDateString("de-DE")}
                </span>
                {doc.description && (
                  <span className="document-desc">{doc.description}</span>
                )}
              </div>
              <div className="document-actions">
                <a
                  href={`/api/uploads/${doc.filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-small"
                >
                  Öffnen
                </a>
                <button
                  className="btn-delete"
                  onClick={() => handleDelete(doc.id)}
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="btn-group" style={{ marginTop: "1rem" }}>
        <button onClick={fetchDocuments}>Aktualisieren</button>
      </div>
    </section>
  );
}

export default DocumentUpload;
