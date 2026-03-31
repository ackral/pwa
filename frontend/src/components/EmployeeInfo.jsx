import { useState, useEffect } from "react";
import { useAuth, authHeaders } from "../auth";

function EmployeeInfo() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <section className="card">
      <h2>👤 Mitarbeiter-Übersicht</h2>

      {loading ? (
        <p className="status-text">Laden…</p>
      ) : users.length === 0 ? (
        <p className="status-text">Keine Mitarbeiter vorhanden</p>
      ) : (
        <div className="employee-grid">
          {users.map((u) => (
            <div key={u.id} className="employee-card">
              <div className="employee-avatar">
                {(u.name || u.username).charAt(0).toUpperCase()}
              </div>
              <div className="employee-details">
                <strong>{u.name || u.username}</strong>
                {u.position && (
                  <span className="employee-position">{u.position}</span>
                )}
                {u.email && (
                  <span className="employee-contact">📧 {u.email}</span>
                )}
                {u.phone && (
                  <span className="employee-contact">📞 {u.phone}</span>
                )}
                <span className="user-role-badge">{u.role}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="btn-group" style={{ marginTop: "1rem" }}>
        <button onClick={fetchUsers}>Aktualisieren</button>
      </div>
    </section>
  );
}

export default EmployeeInfo;
