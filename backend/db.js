// ── Datenbank-Abstraktionsschicht ──────────────────────────────
// Verwendet PostgreSQL wenn DATABASE_URL gesetzt ist (Railway),
// sonst JSON-Dateien (lokale Entwicklung).

import pg from "pg";
import { readFileSync, writeFileSync, existsSync } from "fs";

const { Pool } = pg;

let pool = null;
let useDb = false;

// ── Initialisierung ───────────────────────────────────────────
export async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.log("📁 Kein DATABASE_URL – verwende JSON-Dateien");
    return false;
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  // Verbindung testen
  try {
    await pool.query("SELECT 1");
    console.log("✅ PostgreSQL-Verbindung hergestellt");
  } catch (err) {
    console.error("❌ PostgreSQL-Verbindung fehlgeschlagen:", err.message);
    pool = null;
    return false;
  }

  // Tabellen erstellen
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      salt TEXT NOT NULL,
      name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      role TEXT DEFAULT 'user',
      phone TEXT DEFAULT '',
      position TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL,
      event_date TEXT,
      image_url TEXT,
      sent_to INTEGER DEFAULT 0,
      send_error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fcm_tokens (
      token TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      category TEXT DEFAULT 'sonstiges',
      description TEXT DEFAULT '',
      uploaded_by TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      size INTEGER DEFAULT 0,
      mimetype TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS webpush_subscriptions (
      endpoint TEXT PRIMARY KEY,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("✅ Datenbank-Tabellen bereit");
  useDb = true;
  return true;
}

export function isDbActive() {
  return useDb;
}

// ── JSON-Datei-Helfer ─────────────────────────────────────────
function loadJson(file) {
  if (existsSync(file)) {
    return JSON.parse(readFileSync(file, "utf8"));
  }
  return [];
}

function saveJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2));
}

// ═══════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════
export async function loadUsers() {
  if (!useDb) return loadJson("./users.json");

  const { rows } = await pool.query(
    `SELECT id, username, password, salt, name, email, role, phone, position,
            created_at AS "createdAt"
     FROM users ORDER BY created_at`,
  );
  return rows;
}

export async function saveUsers(users) {
  if (!useDb) return saveJson("./users.json", users);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM users");
    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, username, password, salt, name, email, role, phone, position, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           username=EXCLUDED.username, password=EXCLUDED.password, salt=EXCLUDED.salt,
           name=EXCLUDED.name, email=EXCLUDED.email, role=EXCLUDED.role,
           phone=EXCLUDED.phone, position=EXCLUDED.position`,
        [
          u.id,
          u.username,
          u.password,
          u.salt,
          u.name || "",
          u.email || "",
          u.role || "user",
          u.phone || "",
          u.position || "",
          u.createdAt ? new Date(u.createdAt) : new Date(),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function findUserByUsername(username) {
  if (!useDb) {
    const users = loadJson("./users.json");
    return users.find((u) => u.username === username) || null;
  }
  const { rows } = await pool.query(
    `SELECT id, username, password, salt, name, email, role, phone, position,
            created_at AS "createdAt"
     FROM users WHERE username = $1`,
    [username],
  );
  return rows[0] || null;
}

export async function findUserById(id) {
  if (!useDb) {
    const users = loadJson("./users.json");
    return users.find((u) => u.id === id) || null;
  }
  const { rows } = await pool.query(
    `SELECT id, username, password, salt, name, email, role, phone, position,
            created_at AS "createdAt"
     FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

export async function addUser(user) {
  if (!useDb) {
    const users = loadJson("./users.json");
    users.push(user);
    saveJson("./users.json", users);
    return;
  }
  await pool.query(
    `INSERT INTO users (id, username, password, salt, name, email, role, phone, position, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      user.id,
      user.username,
      user.password,
      user.salt,
      user.name || "",
      user.email || "",
      user.role || "user",
      user.phone || "",
      user.position || "",
      user.createdAt ? new Date(user.createdAt) : new Date(),
    ],
  );
}

export async function updateUser(id, fields) {
  if (!useDb) {
    const users = loadJson("./users.json");
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    Object.assign(users[idx], fields);
    saveJson("./users.json", users);
    return users[idx];
  }
  const setClauses = [];
  const values = [id];
  let paramIdx = 2;

  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined) continue;
    const col = key === "createdAt" ? "created_at" : key;
    setClauses.push(`${col} = $${paramIdx}`);
    values.push(val);
    paramIdx++;
  }
  if (setClauses.length === 0) return null;

  const { rows } = await pool.query(
    `UPDATE users SET ${setClauses.join(", ")} WHERE id = $1
     RETURNING id, username, password, salt, name, email, role, phone, position, created_at AS "createdAt"`,
    values,
  );
  return rows[0] || null;
}

export async function deleteUser(id) {
  if (!useDb) {
    const users = loadJson("./users.json");
    const filtered = users.filter((u) => u.id !== id);
    if (filtered.length === users.length) return false;
    saveJson("./users.json", filtered);
    return true;
  }
  const { rowCount } = await pool.query("DELETE FROM users WHERE id = $1", [
    id,
  ]);
  return rowCount > 0;
}

// ═══════════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════════
export async function loadMessages() {
  if (!useDb) return loadJson("./messages.json");

  const { rows } = await pool.query(
    `SELECT id, title, body, category,
            event_date AS "eventDate",
            image_url AS "imageUrl",
            sent_to AS "sentTo",
            send_error AS "sendError",
            created_at AS "createdAt"
     FROM messages ORDER BY created_at DESC`,
  );
  // createdAt als ISO-String
  return rows.map((r) => ({
    ...r,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  }));
}

export async function addMessage(msg) {
  if (!useDb) {
    const messages = loadJson("./messages.json");
    messages.unshift(msg);
    saveJson("./messages.json", messages);
    return;
  }
  await pool.query(
    `INSERT INTO messages (id, title, body, category, event_date, image_url, sent_to, send_error, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      msg.id,
      msg.title,
      msg.body,
      msg.category,
      msg.eventDate || null,
      msg.imageUrl || null,
      msg.sentTo || 0,
      msg.sendError || null,
      msg.createdAt ? new Date(msg.createdAt) : new Date(),
    ],
  );
}

export async function updateMessage(id, fields) {
  if (!useDb) {
    const messages = loadJson("./messages.json");
    const msg = messages.find((m) => m.id === id);
    if (msg) {
      Object.assign(msg, fields);
      saveJson("./messages.json", messages);
    }
    return;
  }
  const setClauses = [];
  const values = [id];
  let paramIdx = 2;
  const keyMap = {
    sentTo: "sent_to",
    sendError: "send_error",
    imageUrl: "image_url",
    eventDate: "event_date",
  };
  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined) continue;
    const col = keyMap[key] || key;
    setClauses.push(`${col} = $${paramIdx}`);
    values.push(val);
    paramIdx++;
  }
  if (setClauses.length > 0) {
    await pool.query(
      `UPDATE messages SET ${setClauses.join(", ")} WHERE id = $1`,
      values,
    );
  }
}

export async function deleteMessage(id) {
  if (!useDb) {
    const messages = loadJson("./messages.json");
    const filtered = messages.filter((m) => m.id !== id);
    if (filtered.length === messages.length) return false;
    saveJson("./messages.json", filtered);
    return true;
  }
  const { rowCount } = await pool.query("DELETE FROM messages WHERE id = $1", [
    id,
  ]);
  return rowCount > 0;
}

export async function countMessages() {
  if (!useDb) {
    return loadJson("./messages.json").length;
  }
  const { rows } = await pool.query(
    "SELECT count(*)::int AS count FROM messages",
  );
  return rows[0].count;
}

// ═══════════════════════════════════════════════════════════════
// FCM TOKENS
// ═══════════════════════════════════════════════════════════════
export async function loadTokens() {
  if (!useDb) return loadJson("./tokens.json");

  const { rows } = await pool.query("SELECT token FROM fcm_tokens");
  return rows.map((r) => r.token);
}

export async function addToken(token) {
  if (!useDb) {
    const tokens = loadJson("./tokens.json");
    if (!tokens.includes(token)) {
      tokens.push(token);
      saveJson("./tokens.json", tokens);
    }
    return;
  }
  await pool.query(
    "INSERT INTO fcm_tokens (token) VALUES ($1) ON CONFLICT DO NOTHING",
    [token],
  );
}

export async function removeToken(token) {
  if (!useDb) {
    const tokens = loadJson("./tokens.json").filter((t) => t !== token);
    saveJson("./tokens.json", tokens);
    return;
  }
  await pool.query("DELETE FROM fcm_tokens WHERE token = $1", [token]);
}

export async function saveTokens(tokens) {
  if (!useDb) return saveJson("./tokens.json", tokens);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM fcm_tokens");
    for (const t of tokens) {
      await client.query(
        "INSERT INTO fcm_tokens (token) VALUES ($1) ON CONFLICT DO NOTHING",
        [t],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════
export async function loadDocuments(category) {
  if (!useDb) {
    const docs = loadJson("./documents.json");
    return category ? docs.filter((d) => d.category === category) : docs;
  }
  const query = category
    ? {
        text: `SELECT id, name, filename, category, description, uploaded_by AS "uploadedBy",
                      created_at AS "createdAt", size, mimetype
               FROM documents WHERE category = $1 ORDER BY created_at DESC`,
        values: [category],
      }
    : {
        text: `SELECT id, name, filename, category, description, uploaded_by AS "uploadedBy",
                      created_at AS "createdAt", size, mimetype
               FROM documents ORDER BY created_at DESC`,
      };
  const { rows } = await pool.query(query);
  return rows.map((r) => ({
    ...r,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  }));
}

export async function addDocument(doc) {
  if (!useDb) {
    const docs = loadJson("./documents.json");
    docs.unshift(doc);
    saveJson("./documents.json", docs);
    return;
  }
  await pool.query(
    `INSERT INTO documents (id, name, filename, category, description, uploaded_by, created_at, size, mimetype)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      doc.id,
      doc.name,
      doc.filename,
      doc.category || "sonstiges",
      doc.description || "",
      doc.uploadedBy || "",
      doc.createdAt ? new Date(doc.createdAt) : new Date(),
      doc.size || 0,
      doc.mimetype || "",
    ],
  );
}

export async function findDocument(id) {
  if (!useDb) {
    return loadJson("./documents.json").find((d) => d.id === id) || null;
  }
  const { rows } = await pool.query(
    `SELECT id, name, filename, category, description, uploaded_by AS "uploadedBy",
            created_at AS "createdAt", size, mimetype
     FROM documents WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

export async function deleteDocument(id) {
  if (!useDb) {
    const docs = loadJson("./documents.json");
    const doc = docs.find((d) => d.id === id);
    if (!doc) return null;
    saveJson(
      "./documents.json",
      docs.filter((d) => d.id !== id),
    );
    return doc;
  }
  const { rows } = await pool.query(
    `DELETE FROM documents WHERE id = $1
     RETURNING id, name, filename, category, description, uploaded_by AS "uploadedBy",
               created_at AS "createdAt", size, mimetype`,
    [id],
  );
  return rows[0] || null;
}

// ═══════════════════════════════════════════════════════════════
// WEB PUSH SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════
export async function loadWebPushSubs() {
  if (!useDb) return loadJson("./webpush-subs.json");

  const { rows } = await pool.query(
    "SELECT subscription FROM webpush_subscriptions",
  );
  return rows.map((r) => r.subscription);
}

export async function addOrUpdateWebPushSub(subscription) {
  if (!useDb) {
    const subs = loadJson("./webpush-subs.json");
    const idx = subs.findIndex((s) => s.endpoint === subscription.endpoint);
    if (idx >= 0) {
      subs[idx] = subscription;
    } else {
      subs.push(subscription);
    }
    saveJson("./webpush-subs.json", subs);
    return subs.length;
  }
  await pool.query(
    `INSERT INTO webpush_subscriptions (endpoint, subscription)
     VALUES ($1, $2)
     ON CONFLICT (endpoint) DO UPDATE SET subscription = EXCLUDED.subscription`,
    [subscription.endpoint, JSON.stringify(subscription)],
  );
  const { rows } = await pool.query(
    "SELECT count(*)::int AS count FROM webpush_subscriptions",
  );
  return rows[0].count;
}

export async function removeWebPushSub(endpoint) {
  if (!useDb) {
    const subs = loadJson("./webpush-subs.json").filter(
      (s) => s.endpoint !== endpoint,
    );
    saveJson("./webpush-subs.json", subs);
    return;
  }
  await pool.query("DELETE FROM webpush_subscriptions WHERE endpoint = $1", [
    endpoint,
  ]);
}

export async function removeWebPushSubs(endpoints) {
  if (!useDb) {
    const subs = loadJson("./webpush-subs.json").filter(
      (s) => !endpoints.includes(s.endpoint),
    );
    saveJson("./webpush-subs.json", subs);
    return;
  }
  if (endpoints.length === 0) return;
  await pool.query(
    "DELETE FROM webpush_subscriptions WHERE endpoint = ANY($1::text[])",
    [endpoints],
  );
}
