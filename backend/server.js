// HTTP/2-Bug in firebase-admin umgehen
// firebase-admin nutzt intern HTTP/2 für FCM — auf Windows + Node 18 kaputt.
// Lösung: FCM REST API direkt per HTTP/1.1 ansprechen.
process.env.GOOGLE_AUTH_LIBRARY_DISABLE_HTTP2 = "true";

import express from "express";
import cors from "cors";
import https from "https";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "fs";
import { createSign, scryptSync, randomBytes } from "crypto";
import multer from "multer";
import { fileURLToPath } from "url";
import { dirname, join, extname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = "./service-account.json";
let serviceAccount = null;
let firebaseInitialized = false;

if (existsSync(serviceAccountPath)) {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
  firebaseInitialized = true;
  console.log("✅ Firebase Admin initialisiert");
} else {
  console.warn(
    "⚠️  service-account.json nicht gefunden!\n" +
      "   Lade ihn aus der Firebase Console herunter und lege ihn in backend/ ab.\n",
  );
}

// ── Google OAuth2 Access Token per Service Account (JWT) ───────
let cachedToken = null;
let tokenExpiry = 0;

function createJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");

  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(serviceAccount.private_key, "base64url");

  return `${header}.${payload}.${signature}`;
}

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const jwt = createJWT();
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;

  const data = await httpPost("oauth2.googleapis.com", "/token", body, {
    "Content-Type": "application/x-www-form-urlencoded",
  });

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// ── HTTPS POST Helper (HTTP/1.1) ──────────────────────────────
function httpPost(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = typeof body === "string" ? body : JSON.stringify(body);
    const req = https.request(
      {
        hostname,
        port: 443,
        path,
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(postData),
        },
        ALPNProtocols: ["http/1.1"],
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON: ${data}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

// ── FCM v1 API: Einzelne Nachricht senden ─────────────────────
async function sendFCMMessage(token, notification, data) {
  const accessToken = await getAccessToken();
  const projectId = serviceAccount.project_id;

  const body = {
    message: {
      token,
      notification,
    },
  };
  if (data) body.message.data = data;

  const result = await httpPost(
    "fcm.googleapis.com",
    `/v1/projects/${projectId}/messages:send`,
    body,
    {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  );

  if (result.error) {
    throw {
      code: result.error.status,
      message: result.error.message,
      details: result.error.details,
    };
  }
  return result;
}

// ── FCM: An mehrere Tokens senden ─────────────────────────────
async function sendToMultiple(tokens, notification, data) {
  const results = await Promise.allSettled(
    tokens.map((token) => sendFCMMessage(token, notification, data)),
  );

  let successCount = 0;
  let failureCount = 0;
  const responses = results.map((r) => {
    if (r.status === "fulfilled") {
      successCount++;
      return { success: true };
    }
    failureCount++;
    return { success: false, error: r.reason };
  });

  // Ungültige Tokens entfernen
  const invalidStatuses = ["NOT_FOUND", "INVALID_ARGUMENT", "UNREGISTERED"];
  const validTokens = tokens.filter((_, i) => {
    if (responses[i].success) return true;
    const code = responses[i].error?.code || "";
    return !invalidStatuses.includes(code);
  });
  if (validTokens.length !== tokens.length) saveTokens(validTokens);

  return { successCount, failureCount, responses };
}

// ── Nachrichten-Speicher (einfache JSON-Datei) ─────────────────
const MESSAGES_FILE = "./messages.json";

function loadMessages() {
  if (existsSync(MESSAGES_FILE)) {
    return JSON.parse(readFileSync(MESSAGES_FILE, "utf8"));
  }
  return [];
}

function saveMessages(messages) {
  writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

// ── Token-Speicher (einfache JSON-Datei) ───────────────────────
const TOKENS_FILE = "./tokens.json";

function loadTokens() {
  if (existsSync(TOKENS_FILE)) {
    return JSON.parse(readFileSync(TOKENS_FILE, "utf8"));
  }
  return [];
}

function saveTokens(tokens) {
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

// ── Uploads-Verzeichnis & Multer ───────────────────────────────
const UPLOADS_DIR = join(__dirname, "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + extname(file.originalname));
  },
});

const allowedMimes = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Ungültiger Dateityp"));
    }
  },
});

// ── Passwort-Hashing ──────────────────────────────────────────
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const buf = scryptSync(password, salt, 64).toString("hex");
  return buf === hash;
}

// ── Benutzer-Speicher ─────────────────────────────────────────
const USERS_FILE = "./users.json";

function loadUsers() {
  if (existsSync(USERS_FILE)) {
    return JSON.parse(readFileSync(USERS_FILE, "utf8"));
  }
  return [];
}

function saveUsers(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Standard-Admin erstellen falls keine Benutzer existieren
(function initUsers() {
  const users = loadUsers();
  if (users.length === 0) {
    const { hash, salt } = hashPassword("admin123");
    users.push({
      id: Date.now().toString(),
      username: "admin",
      password: hash,
      salt,
      name: "Administrator",
      email: "",
      role: "admin",
      phone: "",
      position: "Administrator",
      createdAt: new Date().toISOString(),
    });
    saveUsers(users);
    console.log(
      "👤 Standard-Admin erstellt (Benutzer: admin, Passwort: admin123)",
    );
  }
})();

// ── Dokument-Speicher ─────────────────────────────────────────
const DOCUMENTS_FILE = "./documents.json";

function loadDocuments() {
  if (existsSync(DOCUMENTS_FILE)) {
    return JSON.parse(readFileSync(DOCUMENTS_FILE, "utf8"));
  }
  return [];
}

function saveDocuments(docs) {
  writeFileSync(DOCUMENTS_FILE, JSON.stringify(docs, null, 2));
}

// ── Session-Verwaltung ────────────────────────────────────────
const sessions = new Map();

function generateToken() {
  return randomBytes(32).toString("hex");
}

// ── Auth-Middleware ───────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Nicht angemeldet" });

  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: "Sitzung abgelaufen" });
  }

  const users = loadUsers();
  const user = users.find((u) => u.id === session.userId);
  if (!user) return res.status(401).json({ error: "Benutzer nicht gefunden" });

  const { password, salt, ...safeUser } = user;
  req.user = safeUser;
  next();
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Nur für Administratoren" });
  }
  next();
}

// ── Express-Server ─────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Frontend (SPA) bereitstellen ───────────────────────────────
app.use(express.static(join(__dirname, "../pwa-app")));

// Health-Check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", firebase: firebaseInitialized });
});

// ── Auth-Endpunkte ────────────────────────────────────────────
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Benutzername und Passwort erforderlich" });
  }

  const users = loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user || !verifyPassword(password, user.password, user.salt)) {
    return res.status(401).json({ error: "Ungültige Anmeldedaten" });
  }

  const token = generateToken();
  sessions.set(token, {
    userId: user.id,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });

  const { password: _, salt: __, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) sessions.delete(token);
  res.json({ message: "Abgemeldet" });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ── Uploads bereitstellen ─────────────────────────────────────
app.get("/api/uploads/:filename", (req, res) => {
  const safeName = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = join(UPLOADS_DIR, safeName);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "Datei nicht gefunden" });
  }
  res.sendFile(filePath);
});

// Token registrieren
app.post("/api/notifications/subscribe", (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Token fehlt" });
  }

  const tokens = loadTokens();
  if (!tokens.includes(token)) {
    tokens.push(token);
    saveTokens(tokens);
  }

  res.json({ message: "Token registriert", total: tokens.length });
});

// Token entfernen
app.post("/api/notifications/unsubscribe", (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Token fehlt" });
  }

  let tokens = loadTokens();
  tokens = tokens.filter((t) => t !== token);
  saveTokens(tokens);

  res.json({ message: "Token entfernt" });
});

// Test-Nachricht an alle registrierten Geräte senden
app.post("/api/notifications/send-test", async (req, res) => {
  if (!firebaseInitialized) {
    return res.status(503).json({ error: "Firebase nicht konfiguriert" });
  }

  const { title, body } = req.body;
  const tokens = loadTokens();

  if (tokens.length === 0) {
    return res.status(404).json({ error: "Keine Geräte registriert" });
  }

  try {
    const response = await sendToMultiple(tokens, {
      title: title || "Test-Nachricht",
      body: body || "Dies ist eine Test-Benachrichtigung vom Server.",
    });

    res.json({
      message: `Gesendet an ${response.successCount}/${tokens.length} Geräte`,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });
  } catch (err) {
    res.status(500).json({ error: "Senden fehlgeschlagen: " + err.message });
  }
});

// Broadcast: Nachricht an alle
app.post("/api/notifications/broadcast", async (req, res) => {
  if (!firebaseInitialized) {
    return res.status(503).json({ error: "Firebase nicht konfiguriert" });
  }

  const { title, body } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: "title und body sind erforderlich" });
  }

  const tokens = loadTokens();
  if (tokens.length === 0) {
    return res.status(404).json({ error: "Keine Geräte registriert" });
  }

  try {
    const response = await sendToMultiple(tokens, { title, body });

    res.json({
      message: `Broadcast an ${response.successCount} Geräte gesendet`,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Nachricht senden & speichern ────────────────────────
app.post(
  "/api/messages/send",
  authMiddleware,
  adminMiddleware,
  upload.single("image"),
  async (req, res) => {
    const { title, body, category, eventDate } = req.body;
    const validCategories = ["event", "intern", "projekte"];

    if (!title || !body) {
      return res
        .status(400)
        .json({ error: "title und body sind erforderlich" });
    }
    if (!category || !validCategories.includes(category)) {
      return res.status(400).json({
        error: "category muss 'event', 'intern' oder 'projekte' sein",
      });
    }

    // Nachricht speichern
    const messages = loadMessages();
    const newMessage = {
      id: Date.now().toString(),
      title,
      body,
      category,
      createdAt: new Date().toISOString(),
      sentTo: 0,
    };

    // Bild speichern wenn vorhanden
    if (req.file) {
      newMessage.imageUrl = `/api/uploads/${req.file.filename}`;
    }

    // Event-Datum speichern wenn vorhanden
    if (category === "event" && eventDate) {
      newMessage.eventDate = eventDate;
    }

    // Push senden falls Firebase konfiguriert
    if (firebaseInitialized) {
      const tokens = loadTokens();
      if (tokens.length > 0) {
        try {
          console.log(`[Push] Sende an ${tokens.length} Token(s)...`);
          const response = await sendToMultiple(
            tokens,
            { title, body },
            { category },
          );
          console.log(
            `[Push] Erfolg: ${response.successCount}, Fehler: ${response.failureCount}`,
          );

          // Fehlerdetails loggen
          response.responses.forEach((resp, i) => {
            if (!resp.success) {
              console.error(
                `[Push] Token ${i} Fehler:`,
                resp.error?.code,
                resp.error?.message,
              );
            }
          });

          newMessage.sentTo = response.successCount;
        } catch (err) {
          console.error("Push-Senden fehlgeschlagen:", err.message);
          console.error("Push-Fehler Details:", err);
          newMessage.sendError = err.message;
        }
      }
    }

    messages.unshift(newMessage);
    saveMessages(messages);

    res.json({
      message: "Nachricht gesendet und gespeichert",
      data: newMessage,
    });
  },
);

// ── Admin: Alle Nachrichten abrufen ────────────────────────────
app.get("/api/messages", authMiddleware, (_req, res) => {
  const messages = loadMessages();
  res.json(messages);
});

// ── Admin: Nachrichten nach Kategorie ──────────────────────────
app.get("/api/messages/:category", authMiddleware, (req, res) => {
  const { category } = req.params;
  const validCategories = ["event", "intern", "projekte"];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: "Ungültige Kategorie" });
  }
  const messages = loadMessages();
  res.json(messages.filter((m) => m.category === category));
});

// ── Admin: Nachricht löschen ───────────────────────────────────
app.delete("/api/messages/:id", authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;
  let messages = loadMessages();
  const before = messages.length;
  messages = messages.filter((m) => m.id !== id);
  if (messages.length === before) {
    return res.status(404).json({ error: "Nachricht nicht gefunden" });
  }
  saveMessages(messages);
  res.json({ message: "Nachricht gelöscht" });
});

// ── Benutzerverwaltung (Admin) ────────────────────────────────
app.get("/api/users", authMiddleware, adminMiddleware, (_req, res) => {
  const users = loadUsers().map(({ password, salt, ...u }) => u);
  res.json(users);
});

app.post("/api/users", authMiddleware, adminMiddleware, (req, res) => {
  const { username, password, name, email, role, phone, position } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Benutzername und Passwort erforderlich" });
  }

  const users = loadUsers();
  if (users.find((u) => u.username === username)) {
    return res.status(409).json({ error: "Benutzername existiert bereits" });
  }

  const { hash, salt } = hashPassword(password);
  const newUser = {
    id: Date.now().toString(),
    username,
    password: hash,
    salt,
    name: name || "",
    email: email || "",
    role: role || "user",
    phone: phone || "",
    position: position || "",
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers(users);

  const { password: _, salt: __, ...safeUser } = newUser;
  res.json({ message: "Benutzer erstellt", user: safeUser });
});

app.put("/api/users/:id", authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;
  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1)
    return res.status(404).json({ error: "Benutzer nicht gefunden" });

  const { name, email, role, phone, position, password } = req.body;
  if (name !== undefined) users[idx].name = name;
  if (email !== undefined) users[idx].email = email;
  if (role !== undefined) users[idx].role = role;
  if (phone !== undefined) users[idx].phone = phone;
  if (position !== undefined) users[idx].position = position;
  if (password) {
    const { hash, salt } = hashPassword(password);
    users[idx].password = hash;
    users[idx].salt = salt;
  }

  saveUsers(users);
  const { password: _, salt: __, ...safeUser } = users[idx];
  res.json({ message: "Benutzer aktualisiert", user: safeUser });
});

app.delete("/api/users/:id", authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;
  let users = loadUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return res.status(404).json({ error: "Benutzer nicht gefunden" });
  if (user.username === "admin") {
    return res
      .status(403)
      .json({ error: "Standard-Admin kann nicht gelöscht werden" });
  }

  users = users.filter((u) => u.id !== id);
  saveUsers(users);
  res.json({ message: "Benutzer gelöscht" });
});

// ── Dokument-Verwaltung ───────────────────────────────────────
app.get("/api/documents", authMiddleware, (req, res) => {
  const docs = loadDocuments();
  const { category } = req.query;
  if (category) {
    return res.json(docs.filter((d) => d.category === category));
  }
  res.json(docs);
});

app.post(
  "/api/documents",
  authMiddleware,
  adminMiddleware,
  upload.single("file"),
  (req, res) => {
    if (!req.file)
      return res.status(400).json({ error: "Keine Datei hochgeladen" });

    const { category, description } = req.body;
    const docs = loadDocuments();
    const newDoc = {
      id: Date.now().toString(),
      name: req.file.originalname,
      filename: req.file.filename,
      category: category || "sonstiges",
      description: description || "",
      uploadedBy: req.user.name || req.user.username,
      createdAt: new Date().toISOString(),
      size: req.file.size,
      mimetype: req.file.mimetype,
    };

    docs.unshift(newDoc);
    saveDocuments(docs);
    res.json({ message: "Dokument hochgeladen", document: newDoc });
  },
);

app.delete(
  "/api/documents/:id",
  authMiddleware,
  adminMiddleware,
  (req, res) => {
    const { id } = req.params;
    let docs = loadDocuments();
    const doc = docs.find((d) => d.id === id);
    if (!doc) return res.status(404).json({ error: "Dokument nicht gefunden" });

    const filePath = join(UPLOADS_DIR, doc.filename);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }

    docs = docs.filter((d) => d.id !== id);
    saveDocuments(docs);
    res.json({ message: "Dokument gelöscht" });
  },
);

// ── SPA Catch-All: Alle nicht-API-Routen → index.html ─────────
app.get("*", (_req, res) => {
  res.sendFile(join(__dirname, "../pwa-app/index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Backend läuft auf http://localhost:${PORT}`);
});
