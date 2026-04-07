import { useState, useRef, useCallback } from "react";
import { useAuth, authHeaders } from "../auth";

const CATEGORIES = [
  { value: "event", label: "Event" },
  { value: "intern", label: "Intern" },
  { value: "projekte", label: "Projekte" },
];

const TOOLBAR_ACTIONS = [
  { cmd: "bold", icon: "B", title: "Fett", style: "font-weight:700" },
  { cmd: "italic", icon: "I", title: "Kursiv", style: "font-style:italic" },
  {
    cmd: "underline",
    icon: "U",
    title: "Unterstrichen",
    style: "text-decoration:underline",
  },
  {
    cmd: "strikeThrough",
    icon: "S",
    title: "Durchgestrichen",
    style: "text-decoration:line-through",
  },
  { type: "sep" },
  { cmd: "insertUnorderedList", icon: "•", title: "Aufzählung" },
  { cmd: "insertOrderedList", icon: "1.", title: "Nummerierung" },
  { type: "sep" },
  { cmd: "createLink", icon: "🔗", title: "Link einfügen" },
  { cmd: "removeFormat", icon: "✕", title: "Formatierung entfernen" },
];

function RichTextEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null);

  const execCommand = useCallback(
    (cmd) => {
      if (cmd === "createLink") {
        const url = prompt("URL eingeben:");
        if (url) document.execCommand("createLink", false, url);
      } else {
        document.execCommand(cmd, false, null);
      }
      if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
      editorRef.current?.focus();
    },
    [onChange],
  );

  function handleInput() {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  const isEmpty = !value || value === "<br>" || value === "<div><br></div>";

  return (
    <div className="rich-editor-wrapper">
      <div className="rich-editor-toolbar">
        {TOOLBAR_ACTIONS.map((action, i) =>
          action.type === "sep" ? (
            <span key={i} className="toolbar-sep" />
          ) : (
            <button
              key={action.cmd}
              type="button"
              className="toolbar-btn"
              title={action.title}
              style={
                action.style
                  ? {
                      ...Object.fromEntries([
                        action.style.split(":").map((s) => s.trim()),
                      ]),
                    }
                  : undefined
              }
              onMouseDown={(e) => {
                e.preventDefault();
                execCommand(action.cmd);
              }}
            >
              {action.icon}
            </button>
          ),
        )}
      </div>
      <div
        ref={editorRef}
        className={`rich-editor-content${isEmpty ? " is-empty" : ""}`}
        contentEditable
        data-placeholder={placeholder}
        onInput={handleInput}
        onPaste={handlePaste}
        suppressContentEditableWarning
      />
    </div>
  );
}

function AdminSendMessage() {
  const { token } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("intern");
  const [eventDate, setEventDate] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setImage(null);
      setImagePreview(null);
    }
  }

  function removeImage() {
    setImage(null);
    setImagePreview(null);
  }

  const bodyEmpty = !body || body === "<br>" || body === "<div><br></div>";

  async function handleSend(e) {
    e.preventDefault();
    if (!title.trim() || bodyEmpty) return;

    setSending(true);
    setStatus("");

    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("body", body);
      formData.append("category", category);
      if (category === "event" && eventDate) {
        formData.append("eventDate", eventDate);
      }
      if (image) {
        formData.append("image", image);
      }

      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: authHeaders(token),
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(`✓ Gesendet an ${data.data.sentTo} Geräte`);
        setTitle("");
        setBody("");
        setEventDate("");
        setImage(null);
        setImagePreview(null);
      } else {
        setStatus("Fehler: " + (data.error || "Unbekannt"));
      }
    } catch {
      setStatus("Fehler beim Senden");
    }
    setSending(false);
    setTimeout(() => setStatus(""), 4000);
  }

  return (
    <section className="card">
      <h2>✉️ Nachricht senden</h2>
      <form className="admin-form" onSubmit={handleSend}>
        <div className="form-row">
          <label className="form-field">
            Kategorie
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          {category === "event" && (
            <label className="form-field">
              Datum
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
              />
            </label>
          )}
        </div>

        <label>
          Titel
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nachrichtentitel"
            required
          />
        </label>

        <label>Nachricht</label>
        <RichTextEditor
          value={body}
          onChange={setBody}
          placeholder="Nachrichtentext eingeben…"
        />

        <label>
          Bild (optional)
          <input
            type="file"
            onChange={handleImageChange}
            accept="image/jpeg,image/png,image/gif,image/webp"
          />
        </label>
        {imagePreview && (
          <div className="image-preview">
            <img src={imagePreview} alt="Vorschau" />
            <button type="button" className="btn-delete" onClick={removeImage}>
              Bild entfernen
            </button>
          </div>
        )}

        <button type="submit" disabled={sending || !title.trim() || bodyEmpty}>
          {sending ? "Wird gesendet…" : "Nachricht senden"}
        </button>

        {status && (
          <p
            className={`send-status ${status.startsWith("Fehler") ? "send-status-error" : ""}`}
          >
            {status}
          </p>
        )}
      </form>
    </section>
  );
}

export default AdminSendMessage;
