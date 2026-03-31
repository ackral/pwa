import { useState, useEffect } from "react";

function NotesCard() {
  const [notes, setNotes] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("pwa-notes");
    if (saved) setNotes(saved);
  }, []);

  function handleSave() {
    localStorage.setItem("pwa-notes", notes);
    setSaveStatus("Gespeichert!");
    setTimeout(() => setSaveStatus(""), 2000);
  }

  return (
    <section className="card">
      <h2>Notizen</h2>
      <textarea
        placeholder="Schreibe hier deine Notizen..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button onClick={handleSave}>Speichern</button>
      {saveStatus && <p className="save-status">{saveStatus}</p>}
    </section>
  );
}

export default NotesCard;
