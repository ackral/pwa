// HTTP/2-Bug in firebase-admin umgehen
process.env.GOOGLE_AUTH_LIBRARY_DISABLE_HTTP2 = "true";

import express from "express";
import cors from "cors";
import https from "https";
import { readFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { createSign, scryptSync, randomBytes } from "crypto";
import multer from "multer";
import { fileURLToPath } from "url";
import { dirname, join, extname } from "path";
import webpush from "web-push";
import {
  initDatabase,
  loadUsers,
  saveUsers,
  findUserByUsername,
  findUserById,
  addUser,
  updateUser,
  deleteUser,
  loadMessages,
  addMessage,
  updateMessage,
  deleteMessage,
  countMessages,
  loadTokens,
  addToken,
  removeToken,
  saveTokens,
  loadDocuments,
  addDocument,
  findDocument,
  deleteDocument,
  loadWebPushSubs,
  addOrUpdateWebPushSub,
  removeWebPushSub,
  removeWebPushSubs,
  clearAllWebPushSubs,
} from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Firebase Service Account ──────────────────────────────────
const serviceAccountPath = "./service-account.json";
let serviceAccount = null;
let firebaseInitialized = false;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    firebaseInitialized = true;
    console.log("✅ Firebase Admin initialisiert (aus Umgebungsvariable)");
  } catch (err) {
    console.error("❌ FIREBASE_SERVICE_ACCOUNT ist kein gültiges JSON");
  }
} else if (existsSync(serviceAccountPath)) {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
  firebaseInitialized = true;
  console.log("✅ Firebase Admin initialisiert (aus Datei)");
} else {
  console.warn(
    "⚠️  Firebase nicht konfiguriert. Setze die Umgebungsvariable FIREBASE_SERVICE_ACCOUNT\n" +
      "   oder lege service-account.json in backend/ ab (nur für lokale Entwicklung).\n",
  );
}

// ── VAPID-Schlüssel für Web Push ──────────────────────────────
const VAPID_FILE = "./vapid.json";
let vapidKeys;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  };
  console.log("✅ VAPID-Schlüssel aus Umgebungsvariablen geladen");
} else if (existsSync(VAPID_FILE)) {
  vapidKeys = JSON.parse(readFileSync(VAPID_FILE, "utf8"));
  console.log("✅ VAPID-Schlüssel aus Datei geladen");
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  try {
    const { writeFileSync } = await import("fs");
    writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2));
  } catch {
    /* ignore in readonly filesystem */
  }
  console.log("✅ VAPID-Schlüssel generiert");
}
webpush.setVapidDetails(
  "mailto:push@mycompanypwa.firebaseapp.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey,
);
console.log(
  "🔑 VAPID Public Key:",
  vapidKeys.publicKey.substring(0, 20) + "...",
);

// ── Web Push senden ───────────────────────────────────────────
async function sendWebPushToAll(title, body, messageCount) {
  const subs = await loadWebPushSubs();
  if (subs.length === 0) return { successCount: 0, failureCount: 0 };

  const payload = JSON.stringify({ title, body, badge: messageCount });
  const results = await Promise.allSettled(
    subs.map((sub) => webpush.sendNotification(sub, payload, { TTL: 86400 })),
  );

  let successCount = 0;
  const invalidEndpoints = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      successCount++;
    } else {
      const status = r.reason?.statusCode;
      console.error(
        `[WebPush] Fehler bei Sub ${i}: Status=${status || "unknown"}`,
        r.reason?.message,
      );
      invalidEndpoints.push(subs[i].endpoint);
    }
  });

  if (invalidEndpoints.length > 0) {
    await removeWebPushSubs(invalidEndpoints);
  }

  return { successCount, failureCount: results.length - successCount };
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

// ── HTTPS POST Helper ─────────────────────────────────────────
function httpPost(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = typeof body === "string" ? body : JSON.stringify(body);
    const req = https.request(
      {
        hostname,
        port: 443,
        path,
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(postData) },
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

// ── FCM v1 API ────────────────────────────────────────────────
async function sendFCMMessage(token, notification, data) {
  const accessToken = await getAccessToken();
  const projectId = serviceAccount.project_id;

  const body = { message: { token, notification } };
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

  const invalidStatuses = ["NOT_FOUND", "INVALID_ARGUMENT", "UNREGISTERED"];
  const validTokens = tokens.filter((_, i) => {
    if (responses[i].success) return true;
    const code = responses[i].error?.code || "";
    return !invalidStatuses.includes(code);
  });
  if (validTokens.length !== tokens.length) await saveTokens(validTokens);

  return { successCount, failureCount, responses };
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

// ── Session-Verwaltung ────────────────────────────────────────
const sessions = new Map();

function generateSessionToken() {
  return randomBytes(32).toString("hex");
}

// ── Auth-Middleware ───────────────────────────────────────────
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Nicht angemeldet" });

  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: "Sitzung abgelaufen" });
  }

  const user = await findUserById(session.userId);
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

// Health-Check
app.get("/api/health", async (_req, res) => {
  const tokens = await loadTokens();
  const subs = await loadWebPushSubs();
  res.json({
    status: "ok",
    firebase: firebaseInitialized,
    fcmTokens: tokens.length,
    webPushSubs: subs.length,
  });
});

// ── Auth-Endpunkte ────────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Benutzername und Passwort erforderlich" });
  }

  const user = await findUserByUsername(username);
  if (!user || !verifyPassword(password, user.password, user.salt)) {
    return res.status(401).json({ error: "Ungültige Anmeldedaten" });
  }

  const token = generateSessionToken();
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

// ── FCM Token-Verwaltung ──────────────────────────────────────
app.post("/api/notifications/subscribe", async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Token fehlt" });
  }
  await addToken(token);
  const tokens = await loadTokens();
  console.log(`[FCM] Token registriert (${tokens.length} gesamt)`);
  res.json({ message: "Token registriert", total: tokens.length });
});

app.post("/api/notifications/unsubscribe", async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Token fehlt" });
  }
  await removeToken(token);
  res.json({ message: "Token entfernt" });
});

// ── Web Push (iOS / native) ────────────────────────────────────
app.get("/api/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

app.post("/api/push/subscribe", async (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Ungültige Subscription" });
  }

  const total = await addOrUpdateWebPushSub(subscription);
  console.log(
    `[WebPush] Subscription registriert (${total} gesamt):`,
    subscription.endpoint.substring(0, 60) + "...",
  );
  res.json({ message: "Web-Push-Subscription registriert" });
});

app.post("/api/push/unsubscribe", async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: "Endpoint fehlt" });

  await removeWebPushSub(endpoint);
  res.json({ message: "Web-Push-Subscription entfernt" });
});

// ── Admin: Alle WebPush-Subscriptions löschen ─────────────────
app.post(
  "/api/push/clear-all",
  authMiddleware,
  adminMiddleware,
  async (_req, res) => {
    await clearAllWebPushSubs();
    console.log("[WebPush] Alle Subscriptions gelöscht (Admin-Aktion)");
    res.json({
      message:
        "Alle WebPush-Subscriptions gelöscht. Benutzer müssen sich neu anmelden.",
    });
  },
);

// ── Test-Nachricht senden ─────────────────────────────────────
app.post("/api/notifications/send-test", async (req, res) => {
  const { title, body } = req.body;
  const notifTitle = title || "Test-Nachricht";
  const notifBody = body || "Dies ist eine Test-Benachrichtigung vom Server.";

  let fcmSuccess = 0;
  let fcmFailure = 0;

  if (firebaseInitialized) {
    const tokens = await loadTokens();
    if (tokens.length > 0) {
      try {
        const response = await sendToMultiple(tokens, {
          title: notifTitle,
          body: notifBody,
        });
        fcmSuccess = response.successCount;
        fcmFailure = response.failureCount;
      } catch (err) {
        console.error("[send-test] FCM-Fehler:", err.message);
      }
    }
  }

  let wpSuccess = 0;
  let wpFailure = 0;
  try {
    const wpResult = await sendWebPushToAll(notifTitle, notifBody, 1);
    wpSuccess = wpResult.successCount;
    wpFailure = wpResult.failureCount;
  } catch (err) {
    console.error("[send-test] WebPush-Fehler:", err.message);
  }

  const totalSuccess = fcmSuccess + wpSuccess;
  const totalDevices = fcmSuccess + fcmFailure + wpSuccess + wpFailure;

  if (totalDevices === 0) {
    return res.status(404).json({ error: "Keine Geräte registriert" });
  }

  res.json({
    message: `Gesendet an ${totalSuccess}/${totalDevices} Geräte`,
    successCount: totalSuccess,
    failureCount: fcmFailure + wpFailure,
  });
});

// ── Broadcast ─────────────────────────────────────────────────
app.post("/api/notifications/broadcast", async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: "title und body sind erforderlich" });
  }

  let totalSuccess = 0;
  let totalFailure = 0;

  if (firebaseInitialized) {
    const tokens = await loadTokens();
    if (tokens.length > 0) {
      try {
        const response = await sendToMultiple(tokens, { title, body });
        totalSuccess += response.successCount;
        totalFailure += response.failureCount;
      } catch (err) {
        console.error("[Broadcast] FCM-Fehler:", err.message);
      }
    }
  }

  try {
    const wpResult = await sendWebPushToAll(title, body, 1);
    totalSuccess += wpResult.successCount;
    totalFailure += wpResult.failureCount;
  } catch (err) {
    console.error("[Broadcast] WebPush-Fehler:", err.message);
  }

  if (totalSuccess + totalFailure === 0) {
    return res.status(404).json({ error: "Keine Geräte registriert" });
  }

  res.json({
    message: `Broadcast an ${totalSuccess} Geräte gesendet`,
    successCount: totalSuccess,
    failureCount: totalFailure,
  });
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

    const newMessage = {
      id: Date.now().toString(),
      title,
      body,
      category,
      createdAt: new Date().toISOString(),
      sentTo: 0,
    };

    if (req.file) {
      newMessage.imageUrl = `/api/uploads/${req.file.filename}`;
    }
    if (category === "event" && eventDate) {
      newMessage.eventDate = eventDate;
    }

    // FCM Push
    if (firebaseInitialized) {
      const tokens = await loadTokens();
      console.log(`[Push] FCM-Tokens in DB: ${tokens.length}`);
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
          newMessage.sendError = err.message;
        }
      }
    }

    // Nachricht in DB speichern
    await addMessage(newMessage);
    const totalCount = await countMessages();

    // Web Push
    const wpSubs = await loadWebPushSubs();
    console.log(`[WebPush] Subscriptions in DB: ${wpSubs.length}`);
    try {
      const wpResult = await sendWebPushToAll(title, body, totalCount);
      console.log(
        `[WebPush] Erfolg: ${wpResult.successCount}, Fehler: ${wpResult.failureCount}`,
      );
      newMessage.sentTo = (newMessage.sentTo || 0) + wpResult.successCount;
      await updateMessage(newMessage.id, { sentTo: newMessage.sentTo });
    } catch (err) {
      console.error("[WebPush] Senden fehlgeschlagen:", err.message);
    }

    res.json({
      message: "Nachricht gesendet und gespeichert",
      data: newMessage,
    });
  },
);

// ── Nachrichten abrufen ────────────────────────────────────────
app.get("/api/messages", authMiddleware, async (_req, res) => {
  const messages = await loadMessages();
  res.json(messages);
});

app.get("/api/messages/count", authMiddleware, async (_req, res) => {
  const messages = await loadMessages();
  res.json({
    total: messages.length,
    latestId: messages.length > 0 ? messages[0].id : null,
  });
});

app.get("/api/messages/:category", authMiddleware, async (req, res) => {
  const { category } = req.params;
  const validCategories = ["event", "intern", "projekte"];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: "Ungültige Kategorie" });
  }
  const messages = await loadMessages();
  res.json(messages.filter((m) => m.category === category));
});

app.delete(
  "/api/messages/:id",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const deleted = await deleteMessage(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Nachricht nicht gefunden" });
    }
    res.json({ message: "Nachricht gelöscht" });
  },
);

// ── Benutzerverwaltung (Admin) ────────────────────────────────
app.get("/api/users", authMiddleware, adminMiddleware, async (_req, res) => {
  const users = (await loadUsers()).map(({ password, salt, ...u }) => u);
  res.json(users);
});

app.post("/api/users", authMiddleware, adminMiddleware, async (req, res) => {
  const { username, password, name, email, role, phone, position } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Benutzername und Passwort erforderlich" });
  }

  const existing = await findUserByUsername(username);
  if (existing) {
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

  await addUser(newUser);
  const { password: _, salt: __, ...safeUser } = newUser;
  res.json({ message: "Benutzer erstellt", user: safeUser });
});

app.put("/api/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, email, role, phone, position, password } = req.body;

  const fields = {};
  if (name !== undefined) fields.name = name;
  if (email !== undefined) fields.email = email;
  if (role !== undefined) fields.role = role;
  if (phone !== undefined) fields.phone = phone;
  if (position !== undefined) fields.position = position;
  if (password) {
    const { hash, salt } = hashPassword(password);
    fields.password = hash;
    fields.salt = salt;
  }

  const updated = await updateUser(id, fields);
  if (!updated) {
    return res.status(404).json({ error: "Benutzer nicht gefunden" });
  }

  const { password: _, salt: __, ...safeUser } = updated;
  res.json({ message: "Benutzer aktualisiert", user: safeUser });
});

app.delete(
  "/api/users/:id",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const { id } = req.params;
    const user = await findUserById(id);
    if (!user) {
      return res.status(404).json({ error: "Benutzer nicht gefunden" });
    }
    if (user.username === "admin") {
      return res
        .status(403)
        .json({ error: "Standard-Admin kann nicht gelöscht werden" });
    }

    await deleteUser(id);
    res.json({ message: "Benutzer gelöscht" });
  },
);

// ── Dokument-Verwaltung ───────────────────────────────────────
app.get("/api/documents", authMiddleware, async (req, res) => {
  const { category } = req.query;
  const docs = await loadDocuments(category || null);
  res.json(docs);
});

app.post(
  "/api/documents",
  authMiddleware,
  adminMiddleware,
  upload.single("file"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ error: "Keine Datei hochgeladen" });

    const { category, description } = req.body;
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

    await addDocument(newDoc);
    res.json({ message: "Dokument hochgeladen", document: newDoc });
  },
);

app.delete(
  "/api/documents/:id",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const doc = await findDocument(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: "Dokument nicht gefunden" });
    }

    const filePath = join(UPLOADS_DIR, doc.filename);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }

    await deleteDocument(req.params.id);
    res.json({ message: "Dokument gelöscht" });
  },
);

// ── Statische Frontend-Dateien ────────────────────────────────
app.use(express.static(join(__dirname, "./dist")));

app.get("*", (_req, res) => {
  res.sendFile(join(__dirname, "./dist/index.html"));
});

// ── Server starten ────────────────────────────────────────────
async function start() {
  // Datenbank initialisieren
  await initDatabase();

  // Standard-Admin erstellen falls keine Benutzer existieren
  const users = await loadUsers();
  if (users.length === 0) {
    const { hash, salt } = hashPassword("admin123");
    await addUser({
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
    console.log(
      "👤 Standard-Admin erstellt (Benutzer: admin, Passwort: admin123)",
    );
  }

  app.listen(PORT, () => {
    console.log(`🚀 Backend läuft auf http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("❌ Server konnte nicht gestartet werden:", err);
  process.exit(1);
});
