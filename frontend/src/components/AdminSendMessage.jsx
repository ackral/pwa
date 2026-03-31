import { useState } from "react";
import { useAuth, authHeaders } from "../auth";

const CATEGORIES = [
  { value: "event", label: "Event" },
  { value: "intern", label: "Intern" },
  { value: "projekte", label: "Projekte" },
];

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

  async function handleSend(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

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
        setStatus(`Gesendet an ${data.data.sentTo} Geräte`);
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
      <h2>Nachricht senden</h2>
      <form className="admin-form" onSubmit={handleSend}>
        <label>
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
          <label>
            Datum
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
            />
          </label>
        )}

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

        <label>
          Nachricht
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Nachrichtentext"
            required
          />
        </label>

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

        <button type="submit" disabled={sending}>
          {sending ? "Wird gesendet…" : "Nachricht senden"}
        </button>

        {status && <p className="send-status">{status}</p>}
      </form>
    </section>
  );
}

export default AdminSendMessage;
