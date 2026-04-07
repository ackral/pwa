import { useState } from "react";
import { useAuth } from "../auth";

function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);
    setError("");

    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  return (
    <>
      <header>
        <h1>Meine PWA</h1>
        <p className="subtitle">Willkommen zurück</p>
      </header>
      <main>
        <section className="card login-card">
          <h2>🔐 Anmelden</h2>
          <form className="admin-form" onSubmit={handleSubmit}>
            <label>
              Benutzername
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Benutzername"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Passwort
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort"
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Anmeldung…" : "Anmelden"}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        </section>
      </main>
      <footer>
        <p>&copy; 2026 Meine PWA</p>
      </footer>
    </>
  );
}

export default LoginPage;
