# Trainingsunterlage: Push Messenger PWA

## 1. Was ist diese App?

Eine **firmeninterne Progressive Web App (PWA)**, die Push-Benachrichtigungen an registrierte Geräte senden kann. Mitarbeiter sehen Nachrichten in Kategorien (Events, Intern, Projekte), Admins können Nachrichten verfassen und versenden.

---

## 2. Architektur-Überblick

Das Projekt besteht aus **drei Schichten**:

| Schicht         | Technologie                    | Ordner      | Port |
| --------------- | ------------------------------ | ----------- | ---- |
| **Frontend**    | React 19 + Vite + Firebase SDK | `frontend/` | 5173 |
| **Backend**     | Node.js + Express              | `backend/`  | 3001 |
| **Push-Dienst** | Google FCM v1 REST API         | extern      | —    |

Zusätzlich existiert ein **Vanilla-JS-Prototyp** im Root-Verzeichnis (`index.html`, `app.js`, `style.css`, `service-worker.js`) — das war die ursprüngliche Testversion vor dem React-Rewrite.

---

## 3. Kommunikationsfluss (End-to-End)

```
┌─────────────────────────────────────────────────────┐
│  Browser (React Frontend, localhost:5173)            │
│  - Benutzer erlaubt Push-Benachrichtigungen         │
│  - Firebase SDK holt FCM-Token vom Google-Server    │
│  - Token wird an Backend gesendet (POST /subscribe) │
└──────────────────────┬──────────────────────────────┘
                       │ /api/* (Vite Proxy → :3001)
                       ▼
┌─────────────────────────────────────────────────────┐
│  Node.js Backend (localhost:3001)                    │
│  - Speichert Token in tokens.json                   │
│  - Admin sendet Nachricht → POST /api/messages/send │
│  - Backend signiert JWT mit Service-Account         │
│  - Ruft FCM v1 API auf (HTTPS, HTTP/1.1)           │
│  - Speichert Nachricht in messages.json             │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────┐
│  Google FCM (fcm.googleapis.com)                    │
│  - Leitet Push an alle registrierten Geräte weiter  │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
   App im Vordergrund        App im Hintergrund
   → onMessage() in          → firebase-messaging-sw.js
     firebase.js               → showNotification()
   → Toast-Overlay in App
```

---

## 4. Ordnerstruktur erklärt

### 4.1 Backend (`backend/`)

| Datei                  | Zweck                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `server.js`            | **Gesamte Backend-Logik** in einer Datei: JWT-Erstellung, OAuth2-Token-Tausch, FCM-Versand, REST-API-Routen, JSON-Dateispeicherung |
| `package.json`         | Abhängigkeiten: `express`, `cors`, `firebase-admin`, `win-ca`                                                                      |
| `preload-certs.cjs`    | Lädt Windows-Stammzertifikate in Node.js (für HTTPS in Firmennetzwerken)                                                           |
| `service-account.json` | Google-Dienstkonto-Schlüssel (geheim, nicht committen!)                                                                            |
| `tokens.json`          | Gespeicherte FCM-Geräte-Tokens                                                                                                     |
| `messages.json`        | Gespeicherte Nachrichten                                                                                                           |

### 4.2 Backend API-Endpunkte

| Methode  | Pfad                             | Funktion                      |
| -------- | -------------------------------- | ----------------------------- |
| `GET`    | `/api/health`                    | Healthcheck + Firebase-Status |
| `POST`   | `/api/notifications/subscribe`   | FCM-Token registrieren        |
| `POST`   | `/api/notifications/unsubscribe` | FCM-Token entfernen           |
| `POST`   | `/api/notifications/send-test`   | Test-Push an alle Geräte      |
| `POST`   | `/api/notifications/broadcast`   | Broadcast an alle Geräte      |
| `POST`   | `/api/messages/send`             | Nachricht senden + speichern  |
| `GET`    | `/api/messages`                  | Alle Nachrichten abrufen      |
| `GET`    | `/api/messages/:category`        | Nach Kategorie filtern        |
| `DELETE` | `/api/messages/:id`              | Nachricht löschen             |

### 4.3 Frontend (`frontend/`)

#### Einstiegspunkte

| Datei                | Zweck                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| `main.jsx`           | React-Einstiegspunkt, rendert `<App />`                               |
| `App.jsx`            | Router (3 Routen: `/`, `/settings`, `/admin`) + Foreground-Push-Toast |
| `firebase.js`        | Firebase SDK Init, Push-Permission, Token-Registrierung               |
| `firebase-config.js` | Firebase-Projekt-Credentials + VAPID-Key                              |

#### Seiten (`pages/`)

| Datei                   | Route       | Zweck                                         |
| ----------------------- | ----------- | --------------------------------------------- |
| `HomePage` (in App.jsx) | `/`         | Startseite: Nachrichten-Liste + Kalender      |
| `SettingsPage.jsx`      | `/settings` | Status, Features, Push-Einstellungen, Notizen |
| `AdminPage.jsx`         | `/admin`    | Nachrichten senden + verwalten                |

#### Komponenten (`components/`)

```
Benutzer-Sicht (Client)                Admin-Sicht
┌──────────────────────┐    ┌──────────────────────────────┐
│  Header              │    │  Header                      │
│  ClientMessageOverview│   │  AdminSendMessage (Formular) │
│  EventCalendar       │    │  AdminMessageOverview        │
│  Footer              │    └──────────────────────────────┘
└──────────────────────┘
        Einstellungen
┌──────────────────────┐
│  StatusCard          │
│  FeaturesCard        │
│  PushCard            │
│  NotesCard           │
└──────────────────────┘
```

| Komponente                  | Funktion                                              |
| --------------------------- | ----------------------------------------------------- |
| `Header.jsx`                | App-Titel "Meine PWA"                                 |
| `Footer.jsx`                | Copyright-Zeile                                       |
| `ClientMessageOverview.jsx` | Nachrichten-Liste mit Kategorie-Filtern (nur lesen)   |
| `AdminMessageOverview.jsx`  | Nachrichten-Liste mit Lösch-Funktion                  |
| `AdminSendMessage.jsx`      | Formular: Kategorie, Titel, Text, Datum → sendet Push |
| `EventCalendar.jsx`         | Monatskalender mit Event-Markierungen                 |
| `PushCard.jsx`              | Push-Permission anfordern + Test-Nachricht senden     |
| `StatusCard.jsx`            | Online/Offline-Anzeige                                |
| `FeaturesCard.jsx`          | Statische Feature-Liste der PWA                       |
| `NotesCard.jsx`             | Lokaler Notizblock (localStorage)                     |

#### Service Worker & PWA

| Datei                      | Zweck                                                                  |
| -------------------------- | ---------------------------------------------------------------------- |
| `firebase-messaging-sw.js` | Empfängt Push im **Hintergrund** → zeigt System-Notification           |
| `vite.config.js`           | PWA-Plugin (autoUpdate), Manifest-Einstellungen, Dev-Proxy auf `:3001` |

---

## 5. Schlüsselkonzepte

### 5.1 Push-Benachrichtigungen (Schritt für Schritt)

```
1. Benutzer klickt "Benachrichtigungen erlauben" (PushCard.jsx)
         │
2. Browser fragt: "Möchten Sie Benachrichtigungen zulassen?"
         │
3. Firebase SDK holt FCM-Token von Google     (firebase.js)
         │
4. Token wird an Backend gesendet             (POST /api/notifications/subscribe)
         │
5. Backend speichert Token in tokens.json     (server.js)
         │
═══════════ Später: Admin sendet Nachricht ═══════════
         │
6. Admin füllt Formular aus                   (AdminSendMessage.jsx)
         │
7. Frontend sendet POST /api/messages/send    (mit Titel, Text, Kategorie)
         │
8. Backend erstellt JWT aus service-account.json
         │
9. Backend tauscht JWT gegen OAuth2-Token bei Google
         │
10. Backend ruft FCM v1 API auf für jedes registrierte Gerät
         │
11. Google FCM liefert Push an Geräte aus
         │
12a. App offen?  → onMessage() → Toast-Anzeige      (App.jsx)
12b. App zu?     → Service Worker → System-Notification
```

### 5.2 Datenspeicherung

Es gibt **keine Datenbank**. Alles wird in JSON-Dateien gespeichert:

- **`tokens.json`** — Array von FCM-Geräte-Tokens
- **`messages.json`** — Array von Nachrichten-Objekten mit `id`, `title`, `body`, `category`, `eventDate`, `createdAt`, `sentTo`

### 5.3 Firmennetzwerk-Besonderheiten

Zwei Workarounds für Windows-Firmenumgebungen:

1. **`win-ca` + `preload-certs.cjs`** — Injiziert Windows-Stammzertifikate in Node.js (nötig wenn Firmen-Proxy HTTPS-Verkehr aufbricht)
2. **`GOOGLE_AUTH_LIBRARY_DISABLE_HTTP2=true`** — Umgeht einen HTTP/2-Bug in Firebase Admin auf Windows

### 5.4 Vite Dev-Proxy

In der Entwicklung läuft das Frontend auf Port **5173** und das Backend auf Port **3001**. Damit das Frontend API-Aufrufe machen kann ohne CORS-Probleme, leitet Vite alle `/api/*`-Anfragen automatisch an `localhost:3001` weiter (konfiguriert in `vite.config.js`).

---

## 6. Setup & Start

```bash
# 1. Backend starten
cd backend
npm install
npm run dev          # → localhost:3001

# 2. Frontend starten (neues Terminal)
cd frontend
npm install
npm run dev          # → localhost:5173
```

**Voraussetzungen:**

- Node.js installiert
- `backend/service-account.json` vorhanden (Firebase Console → Dienstkonto)
- Firebase-Projekt konfiguriert (Credentials in `firebase-config.js` + `firebase-messaging-sw.js`)

---

## 7. Routing-Übersicht

```
/              → HomePage (Nachrichten + Kalender)
/settings      → SettingsPage (Status, Push, Notizen)
/admin         → AdminPage (Nachrichten senden + verwalten)
```

---

## 8. Technologie-Stack Zusammenfassung

| Bereich            | Technologie                        |
| ------------------ | ---------------------------------- |
| Frontend-Framework | React 19                           |
| Build-Tool         | Vite 6                             |
| PWA-Plugin         | vite-plugin-pwa                    |
| Routing            | react-router-dom 7                 |
| Push-Dienst        | Firebase Cloud Messaging (FCM v1)  |
| Backend-Framework  | Express 4                          |
| Authentifizierung  | Google OAuth2 (JWT → Access Token) |
| Datenspeicherung   | JSON-Dateien (kein DB)             |
| HTTPS/Zertifikate  | win-ca (Windows CA Injection)      |

---

## 9. React-Grundlagen in diesem Projekt

### 9.1 Wie startet die App?

Die gesamte React-App wird in **einer einzigen HTML-Datei** gerendert. Der Ablauf:

```
index.html                        ← enthält nur <div id="root"></div>
    │
    └── main.jsx                  ← React-Einstiegspunkt
         │
         └── ReactDOM.createRoot(document.getElementById("root"))
              .render(<App />)    ← rendert die App-Komponente in das div
```

**`main.jsx`** — Minimaler Einstiegspunkt:

```jsx
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- `React.StrictMode` aktiviert zusätzliche Warnungen in der Entwicklung
- `index.css` enthält alle Styles (global geladen)

---

### 9.2 Routing: Wie werden Seiten definiert?

Das Routing ist komplett in **`App.jsx`** definiert. Es verwendet `react-router-dom`:

```jsx
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

**Wie das funktioniert:**

| Konzept                            | Erklärung                                             |
| ---------------------------------- | ----------------------------------------------------- |
| `<BrowserRouter>`                  | Wrapper, der URL-Änderungen überwacht (History API)   |
| `<Routes>`                         | Container für alle Routen-Definitionen                |
| `<Route path="/" element={...} />` | Wenn URL = `/`, zeige die `HomePage`-Komponente       |
| `<Link to="/admin">`               | Navigations-Link (wie `<a>`, aber ohne Seiten-Reload) |

**Wo werden Links platziert?**

- `HomePage` → Links zu `/settings` und `/admin` in der Bottom-Navigation
- `SettingsPage` → "Zurück"-Link zu `/` und Link zu `/admin`
- `AdminPage` → "Zurück"-Link zu `/`

```jsx
// Beispiel aus HomePage:
<nav className="bottom-nav">
  <Link to="/settings">⚙️ Einstellungen</Link>
  <Link to="/admin">Admin-Bereich →</Link>
</nav>
```

---

### 9.3 Komponenten-Konzept: Wie ist eine Komponente aufgebaut?

Jede Komponente folgt dem gleichen Muster:

```jsx
// 1. Imports
import { useState, useEffect } from "react";

// 2. Komponenten-Funktion
function MeineKomponente() {
  // 3. State (veränderbare Daten)
  const [wert, setWert] = useState("Anfangswert");

  // 4. Side Effects (Daten laden, Events registrieren)
  useEffect(() => {
    // wird beim ersten Rendern ausgeführt
  }, []);

  // 5. Event-Handler (Funktionen für Buttons etc.)
  function handleClick() {
    setWert("Neuer Wert");
  }

  // 6. JSX-Return (was angezeigt wird)
  return (
    <div>
      <p>{wert}</p>
      <button onClick={handleClick}>Klick mich</button>
    </div>
  );
}

// 7. Export
export default MeineKomponente;
```

---

### 9.4 State: Wie werden Daten verwaltet?

**`useState`** erzeugt eine Variable + eine Setter-Funktion. Wenn der Setter aufgerufen wird, rendert React die Komponente neu.

```jsx
const [messages, setMessages] = useState([]); // Array, anfangs leer
const [loading, setLoading] = useState(true); // Boolean
const [filter, setFilter] = useState("all"); // String
const [title, setTitle] = useState(""); // Leerer String
```

**Konkrete Beispiele aus dem Projekt:**

| Komponente              | State-Variable  | Typ         | Zweck                                          |
| ----------------------- | --------------- | ----------- | ---------------------------------------------- |
| `ClientMessageOverview` | `messages`      | Array       | Alle geladenen Nachrichten                     |
| `ClientMessageOverview` | `filter`        | String      | Aktiver Kategorie-Filter ("all", "event", ...) |
| `ClientMessageOverview` | `loading`       | Boolean     | Zeigt "Laden…" an                              |
| `AdminSendMessage`      | `title`, `body` | String      | Formular-Eingabewerte                          |
| `AdminSendMessage`      | `sending`       | Boolean     | Button deaktivieren während Senden             |
| `AdminSendMessage`      | `status`        | String      | Erfolgs-/Fehlermeldung                         |
| `PushCard`              | `permission`    | String      | "default" / "granted" / "denied"               |
| `EventCalendar`         | `currentDate`   | Date        | Aktuell angezeigter Monat                      |
| `NotesCard`             | `notes`         | String      | Notiz-Text                                     |
| `App`                   | `toast`         | Object/null | Foreground-Push-Benachrichtigungs-Overlay      |

---

### 9.5 useEffect: Wann werden Daten geladen?

**`useEffect`** führt Code aus, wenn die Komponente geladen wird oder sich bestimmte Werte ändern.

```jsx
// Einmal beim Laden der Komponente ausführen (leeres Array [])
useEffect(() => {
  fetchMessages();
}, []);

// Bei jeder Änderung von 'permission' ausführen
useEffect(() => {
  // ...
}, [permission]);
```

**Im Projekt verwendete `useEffect`-Aufrufe:**

| Komponente              | Was passiert                                    | Wann                |
| ----------------------- | ----------------------------------------------- | ------------------- |
| `ClientMessageOverview` | `fetch("/api/messages")` — Nachrichten laden    | Beim ersten Rendern |
| `AdminMessageOverview`  | `fetch("/api/messages")` — Nachrichten laden    | Beim ersten Rendern |
| `HomePage`              | `fetch("/api/messages")` — Events laden         | Beim ersten Rendern |
| `PushCard`              | Push-Permission prüfen, Token auto-registrieren | Beim ersten Rendern |
| `NotesCard`             | Notizen aus `localStorage` laden                | Beim ersten Rendern |
| `SettingsPage`          | Online/Offline Event-Listener registrieren      | Beim ersten Rendern |
| `App`                   | Foreground-Push-Listener registrieren           | Beim ersten Rendern |

---

### 9.6 Event-Handler: Wie werden Button-Funktionen aufgerufen?

Buttons werden über **`onClick`** mit Handler-Funktionen verknüpft:

```jsx
<button onClick={handleClick}>Klick</button>
```

**Alle Button-Handler im Projekt im Detail:**

#### AdminSendMessage — `handleSend(e)`

```
Auslöser:  <form onSubmit={handleSend}>  (Formular-Absenden)
Ablauf:
  1. e.preventDefault()         — Verhindert Seiten-Reload
  2. Prüft ob Titel und Text ausgefüllt
  3. setSending(true)           — Button deaktivieren
  4. fetch("/api/messages/send") — POST an Backend
  5. Erfolg → Status anzeigen + Felder leeren
  6. setSending(false)          — Button wieder aktivieren
  7. setTimeout → Status nach 4s ausblenden
```

#### AdminMessageOverview — `handleDelete(id)`

```
Auslöser:  <button onClick={() => onDelete(msg.id)}>Löschen</button>
Ablauf:
  1. fetch(`/api/messages/${id}`, { method: "DELETE" })
  2. setMessages(prev => prev.filter(m => m.id !== id))
     → Nachricht aus lokaler Liste entfernen (kein Neu-Laden nötig)
```

#### ClientMessageOverview — Filter-Tabs

```
Auslöser:  <button onClick={() => setFilter(c.value)}>Events</button>
Ablauf:
  1. setFilter("event")        — State wird auf neuen Filter gesetzt
  2. React rendert neu
  3. const filtered = messages.filter(m => m.category === filter)
     → Gefilterte Liste wird automatisch berechnet
```

#### ClientMessageOverview / AdminMessageOverview — `fetchMessages()`

```
Auslöser:  <button onClick={fetchMessages}>Aktualisieren</button>
Ablauf:
  1. setLoading(true)
  2. fetch("/api/messages")     — GET alle Nachrichten
  3. setMessages(data)          — State aktualisieren
  4. setLoading(false)
```

#### PushCard — `handleAllow()`

```
Auslöser:  <button onClick={handleAllow}>Benachrichtigungen erlauben</button>
Ablauf:
  1. requestNotificationPermission()  — Browser-Permission-Dialog
  2. Token von Firebase erhalten
  3. registerTokenOnServer(token)     — POST /api/notifications/subscribe
  4. setPermission("granted")         — UI aktualisieren
  5. Fehlerfall → Fehlermeldung anzeigen
```

#### PushCard — `handleSendTest()`

```
Auslöser:  <button onClick={handleSendTest}>Test-Nachricht senden</button>
Ablauf:
  1. fetch("/api/notifications/send-test", { method: "POST", body: {title, body} })
  2. setStatus("Gesendet!")
  3. setTimeout → Status nach 3s ausblenden
```

#### NotesCard — `handleSave()`

```
Auslöser:  <button onClick={handleSave}>Speichern</button>
Ablauf:
  1. localStorage.setItem("pwa-notes", notes)
  2. setSaveStatus("Gespeichert!")
  3. setTimeout → Status nach 2s ausblenden
```

#### EventCalendar — Navigation

```
Auslöser:  <button onClick={prevMonth}>‹</button>
           <button onClick={nextMonth}>›</button>
           <button onClick={goToday}>Heute</button>
Ablauf:
  prevMonth → setCurrentDate(new Date(year, month - 1, 1))
  nextMonth → setCurrentDate(new Date(year, month + 1, 1))
  goToday   → setCurrentDate(new Date())
  → React rendert den Kalender für den neuen Monat
```

---

### 9.7 Props: Wie geben Komponenten Daten weiter?

**Props** sind Daten, die eine Eltern-Komponente an eine Kind-Komponente übergibt:

```
Eltern-Komponente                    Kind-Komponente
───────────────────                  ───────────────────
<EventCalendar events={events} />    function EventCalendar({ events }) {
                     ▲                                      ▲
                     │                                      │
              Wert übergeben                     Wert empfangen und nutzen
```

**Props im Projekt:**

| Eltern → Kind                                 | Prop       | Datentyp | Zweck                              |
| --------------------------------------------- | ---------- | -------- | ---------------------------------- |
| `HomePage` → `EventCalendar`                  | `events`   | Array    | Event-Nachrichten für den Kalender |
| `SettingsPage` → `StatusCard`                 | `isOnline` | Boolean  | Online/Offline-Status              |
| `AdminMessageOverview` → `MessageItem`        | `msg`      | Object   | Einzelne Nachricht                 |
| `AdminMessageOverview` → `MessageItem`        | `onDelete` | Function | Lösch-Callback                     |
| `ClientMessageOverview` → `ClientMessageItem` | `msg`      | Object   | Einzelne Nachricht                 |

---

### 9.8 useMemo: Berechnete Werte cachen

**`useMemo`** berechnet einen Wert nur neu, wenn sich Abhängigkeiten ändern (Performance-Optimierung):

```jsx
// EventCalendar: Kalendertage nur neu berechnen wenn sich Monat/Jahr ändert
const calendarDays = useMemo(() => {
  // ... aufwändige Berechnung der Tages-Zellen
  return days;
}, [year, month]); // ← nur wenn year oder month sich ändern

// EventCalendar: Events pro Tag gruppieren
const eventsByDay = useMemo(() => {
  const map = {};
  events.forEach((evt) => {
    /* ... */
  });
  return map;
}, [events, year, month]);
```

---

### 9.9 Formulare: Wie funktionieren Eingabefelder?

React verwendet **kontrollierte Komponenten** — der Input-Wert wird immer durch State gesteuert:

```jsx
const [title, setTitle] = useState("");

// Input zeigt immer den aktuellen State-Wert
// onChange aktualisiert den State bei jeder Tastatureingabe
<input
  type="text"
  value={title} // ← Wert kommt aus State
  onChange={(e) => setTitle(e.target.value)} // ← Tipperei aktualisiert State
  placeholder="Nachrichtentitel"
/>;
```

**Ablauf bei Tastendruck:**

```
Benutzer tippt "H"
    → onChange wird ausgelöst
    → setTitle("H")
    → React rendert neu
    → Input zeigt "H"

Benutzer tippt "e"
    → setTitle("He")
    → Input zeigt "He"
    ...usw.
```

Das Formular in `AdminSendMessage` nutzt `onSubmit` statt `onClick`:

```jsx
<form onSubmit={handleSend}>
  <input value={title} onChange={(e) => setTitle(e.target.value)} />
  <button type="submit">Senden</button>
</form>
```

Vorteil: Formular kann auch mit Enter-Taste abgesendet werden.

---

### 9.10 Zusammenfassung: Datenfluss einer Nachricht

```
Admin tippt Titel + Text in AdminSendMessage
    │
    │  State: title, body, category (useState)
    │  Input: onChange → setTitle(e.target.value)
    ▼
Admin klickt "Nachricht senden"
    │
    │  <form onSubmit={handleSend}>
    │  handleSend(e):
    │    e.preventDefault()
    │    fetch("/api/messages/send", { method: "POST", body: {title, body, category} })
    ▼
Backend empfängt POST /api/messages/send
    │
    │  Speichert in messages.json
    │  Sendet FCM Push an alle Tokens
    │  Antwortet mit { sentTo: 3 }
    ▼
AdminSendMessage zeigt "Gesendet an 3 Geräte"
    │
    │  setStatus("Gesendet an 3 Geräte")
    │  setTimeout → setStatus("") nach 4s
    ▼
Client-Geräte empfangen Push
    │
    ├── App offen: onMessage → setToast({title, body}) → Toast-Overlay
    │                         setTimeout → setToast(null) nach 5s
    │
    └── App zu: Service Worker → showNotification()
    ▼
Client öffnet App / klickt "Aktualisieren"
    │
    │  ClientMessageOverview useEffect → fetch("/api/messages")
    │  setMessages(data) → React rendert Nachrichten-Liste
    ▼
Nachricht wird in ClientMessageOverview angezeigt
    mit Kategorie-Badge, Datum, Titel, Text
```
