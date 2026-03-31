# PWA App – React Frontend + Node.js Backend + Firebase Push

## Projektstruktur

```c
pwa-app/
├── frontend/                      ← React (Vite) PWA
│   ├── src/
│   │   ├── components/
│   │   │   ├── AdminMessageOverview.jsx  ← Nachrichten-Verwaltung (Admin)
│   │   │   ├── AdminSendMessage.jsx      ← Nachricht senden (Admin)
│   │   │   ├── ClientMessageOverview.jsx ← Nachrichten-Übersicht (Client)
│   │   │   ├── EventCalendar.jsx         ← Monatskalender für Events
│   │   │   ├── FeaturesCard.jsx          ← Feature-Übersicht
│   │   │   ├── Footer.jsx                ← App-Footer
│   │   │   ├── Header.jsx                ← App-Header
│   │   │   ├── NotesCard.jsx             ← Lokale Notizen (localStorage)
│   │   │   ├── PushCard.jsx              ← Push-Berechtigung & Test-Versand
│   │   │   └── StatusCard.jsx            ← Online/Offline-Status
│   │   ├── pages/
│   │   │   ├── AdminPage.jsx             ← Admin-Bereich
│   │   │   └── SettingsPage.jsx          ← Einstellungen & Status
│   │   ├── App.jsx                       ← Router & Foreground-Push-Toast
│   │   ├── main.jsx
│   │   ├── index.css
│   │   ├── firebase.js                   ← Firebase Init, Token, Push-Listener
│   │   └── firebase-config.js            ← ⚠️ HIER Firebase-Daten eintragen
│   └── public/
│       ├── firebase-messaging-sw.js      ← ⚠️ HIER Firebase-Daten eintragen
│       └── icons/
├── backend/                       ← Node.js + Express + Firebase Admin
│   ├── server.js
│   ├── preload-certs.cjs                 ← Windows-Zertifikate für Node
│   ├── messages.json                     ← Nachrichten-Speicher (auto-generiert)
│   ├── tokens.json                       ← Token-Speicher (auto-generiert)
│   └── service-account.json              ← ⚠️ Aus Firebase Console herunterladen
```

## Seiten & Routing

| Pfad        | Seite         | Beschreibung                                               |
| ----------- | ------------- | ---------------------------------------------------------- |
| `/`         | Home          | Nachrichten-Übersicht (Client), Event-Kalender, Navigation |
| `/settings` | Einstellungen | Status, Features, Push-Konfiguration, Notizen              |
| `/admin`    | Admin-Bereich | Nachrichten senden (mit Kategorie) & verwalten/löschen     |

## Setup

### 1. Firebase-Projekt einrichten

1. Gehe zu [Firebase Console](https://console.firebase.google.com/)
2. Erstelle ein neues Projekt
3. Aktiviere **Cloud Messaging**
4. Erstelle eine **Web-App** und kopiere die Konfiguration
5. Unter **Projekteinstellungen → Dienstkonten** → "Neuen privaten Schlüssel generieren"
   → Speichere die Datei als `backend/service-account.json`

### 2. Firebase-Konfiguration eintragen

Ersetze die Platzhalter in diesen Dateien:

- `frontend/src/firebase-config.js` — Firebase Web-Config + VAPID-Key
- `frontend/public/firebase-messaging-sw.js` — gleiche Firebase-Config

### 3. Abhängigkeiten installieren

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 4. Projekt starten

Beide Server müssen gleichzeitig laufen (jeweils in einem eigenen Terminal):

**Terminal 1 – Backend:**

```bash
cd backend
npm run dev
```

Der Server läuft auf `http://localhost:3001`.

**Terminal 2 – Frontend:**

```bash
cd frontend
npm run dev
```

Das Frontend läuft auf `https://localhost:5173` (HTTPS mit self-signed Zertifikat) und proxied `/api`-Aufrufe automatisch an das Backend.

### 5. Im Browser öffnen

- **Am PC:** [https://localhost:5173](https://localhost:5173) aufrufen
- **Auf dem Smartphone (gleiches WLAN):** `https://<PC-IP>:5173` aufrufen
  - Die lokale IP findest du mit `ipconfig` (Windows) bzw. `ifconfig` (Mac/Linux)
  - Die Zertifikatswarnung im Browser mit "Erweitert → Trotzdem fortfahren" bestätigen

> **Hinweis:** Der Browser zeigt eine Zertifikatswarnung, da Vite ein self-signed Zertifikat verwendet. Das ist lokal unbedenklich. Push-Benachrichtigungen erfordern HTTPS und funktionieren daher nur über diese Verbindung (nicht über reines HTTP).

## API-Endpunkte

| Methode | Pfad                             | Beschreibung                                |
| ------- | -------------------------------- | ------------------------------------------- |
| GET     | `/api/health`                    | Health-Check (inkl. Firebase-Status)        |
| POST    | `/api/notifications/subscribe`   | Push-Token registrieren                     |
| POST    | `/api/notifications/unsubscribe` | Push-Token entfernen                        |
| POST    | `/api/notifications/send-test`   | Test-Nachricht an alle Geräte               |
| POST    | `/api/notifications/broadcast`   | Broadcast mit Titel + Nachricht             |
| POST    | `/api/messages/send`             | Kategorisierte Nachricht senden & speichern |
| GET     | `/api/messages`                  | Alle gespeicherten Nachrichten abrufen      |
| GET     | `/api/messages/:category`        | Nachrichten nach Kategorie filtern          |
| DELETE  | `/api/messages/:id`              | Nachricht löschen                           |

## Nachrichtenkategorien

| Kategorie  | Beschreibung                 |
| ---------- | ---------------------------- |
| `event`    | Events mit optionalem Datum  |
| `intern`   | Interne Mitteilungen         |
| `projekte` | Projekt-bezogene Nachrichten |

## Technologie-Stack

| Bereich  | Technologie                                    |
| -------- | ---------------------------------------------- |
| Frontend | React, Vite, VitePWA, React Router, Firebase   |
| Backend  | Node.js, Express, Firebase Admin (FCM v1 API)  |
| Push     | Firebase Cloud Messaging (HTTP/1.1 Workaround) |
| Speicher | JSON-Dateien (messages.json, tokens.json)      |
