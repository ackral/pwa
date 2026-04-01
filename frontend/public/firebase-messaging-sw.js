// Firebase Cloud Messaging Service Worker
// Dieser Service Worker wird von Firebase für Push-Benachrichtigungen im Hintergrund verwendet.

importScripts(
  "https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyB3VZPzDN-JCqtzaT22UdlLD3NfhWcuLCs",
  authDomain: "mycompanypwa.firebaseapp.com",
  projectId: "mycompanypwa",
  storageBucket: "mycompanypwa.firebasestorage.app",
  messagingSenderId: "542063105466",
  appId: "1:542063105466:web:e0850045cb2eba8f157983",
});

const messaging = firebase.messaging();

// Hintergrund-Nachrichten behandeln (Firebase / Android / Desktop)
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "Neue Nachricht", {
    body: body || "Du hast eine neue Benachrichtigung!",
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
  });
});

// ── Native Web Push (iOS Safari & andere Plattformen) ──────────
// Wird ausgelöst wenn eine native Web-Push-Nachricht ankommt (z.B. auf iOS).
// Firebase's onBackgroundMessage greift hier NICHT – daher eigener Handler.
self.addEventListener("push", (event) => {
  // Wenn Firebase die Nachricht bereits verarbeitet hat, nicht doppelt anzeigen.
  // Firebase-Nachrichten haben das Format {"notification":{...},"from":"..."} im FCM-Wrapper.
  // Native Web-Push-Nachrichten vom eigenen Backend haben unser eigenes JSON-Format.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "Neue Nachricht" };
  }

  // Nur verarbeiten wenn es KEIN Firebase-FCM-Payload ist
  // (FCM-Nachrichten werden von firebase-messaging-compat.js abgefangen)
  if (data.from || data.notification?.google) return;

  const title = data.title || "Neue Nachricht";
  const body = data.body || "";
  const badgeCount = data.badge;

  const notifPromise = self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    data: { url: "/" },
  });

  // App-Icon-Badge setzen (iOS 16.4+, Chrome 81+)
  const badgePromise =
    badgeCount != null && "setAppBadge" in navigator
      ? navigator.setAppBadge(badgeCount)
      : Promise.resolve();

  event.waitUntil(Promise.all([notifPromise, badgePromise]));
});

// Klick auf Benachrichtigung → App öffnen / fokussieren
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Bestehendes Fenster fokussieren falls vorhanden
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        // Sonst neues Fenster öffnen
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
