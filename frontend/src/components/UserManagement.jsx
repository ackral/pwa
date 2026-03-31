import { useState, useEffect } from "react";
import { useAuth, authHeaders } from "../auth";

function UserManagement() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({
    username: "",
    password: "",
    name: "",
    email: "",
    role: "user",
    phone: "",
    position: "",
  });
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        headers: authHeaders(token),
      });
      const data = await res.json();
      setUsers(data);
    } catch {
      setUsers([]);
    }
    setLoading(false);
  }

  function resetForm() {
    setForm({
      username: "",
      password: "",
      name: "",
      email: "",
      role: "user",
      phone: "",
      position: "",
    });
    setEditUser(null);
    setShowForm(false);
  }

  function startEdit(user) {
    setForm({
      username: user.username,
      password: "",
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      position: user.position,
    });
    setEditUser(user);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("");

    try {
      if (editUser) {
        const updateData = { ...form };
        delete updateData.username;
        if (!updateData.password) delete updateData.password;
        const res = await fetch(`/api/users/${editUser.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(token),
          },
          body: JSON.stringify(updateData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setStatus("Benutzer aktualisiert");
      } else {
        if (!form.username || !form.password) {
          setStatus("Benutzername und Passwort erforderlich");
          return;
        }
        const res = await fetch("/api/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(token),
          },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setStatus("Benutzer erstellt");
      }
      resetForm();
      fetchUsers();
    } catch (err) {
      setStatus("Fehler: " + err.message);
    }
    setTimeout(() => setStatus(""), 3000);
  }

  async function handleDelete(id) {
    if (!confirm("Benutzer wirklich löschen?")) return;
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchUsers();
    } catch (err) {
      setStatus("Fehler: " + err.message);
      setTimeout(() => setStatus(""), 3000);
    }
  }

  return (
    <section className="card">
      <h2>👥 Benutzerverwaltung</h2>

      {loading ? (
        <p className="status-text">Laden…</p>
      ) : (
        <div className="user-list">
          {users.map((u) => (
            <div key={u.id} className="user-item">
              <div className="user-info">
                <strong>{u.name || u.username}</strong>
                <span className="user-role-badge">{u.role}</span>
              </div>
              <div className="user-details">
                <span>@{u.username}</span>
                {u.position && <span> · {u.position}</span>}
                {u.email && <span> · {u.email}</span>}
                {u.phone && <span> · {u.phone}</span>}
              </div>
              <div className="user-actions">
                <button className="btn-small" onClick={() => startEdit(u)}>
                  Bearbeiten
                </button>
                {u.username !== "admin" && (
                  <button
                    className="btn-delete"
                    onClick={() => handleDelete(u.id)}
                  >
                    Löschen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="btn-group" style={{ marginTop: "1rem" }}>
        <button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Abbrechen" : "Neuer Benutzer"}
        </button>
        <button onClick={fetchUsers}>Aktualisieren</button>
      </div>

      {showForm && (
        <form
          className="admin-form"
          onSubmit={handleSubmit}
          style={{ marginTop: "1rem" }}
        >
          {!editUser && (
            <label>
              Benutzername
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </label>
          )}
          <label>
            Passwort {editUser && "(leer = nicht ändern)"}
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!editUser}
            />
          </label>
          <label>
            Name
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            E-Mail
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Rolle
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="user">Benutzer</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <label>
            Telefon
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label>
            Position
            <input
              type="text"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
            />
          </label>
          <button type="submit">{editUser ? "Speichern" : "Erstellen"}</button>
        </form>
      )}

      {status && <p className="send-status">{status}</p>}
    </section>
  );
}

export default UserManagement;
