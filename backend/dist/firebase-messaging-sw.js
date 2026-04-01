// Push-Benachrichtigungs-Service-Worker
// Unterstützt sowohl Firebase FCM (Android/Desktop Chrome) als auch
// nativen Web Push (iOS Safari, Firefox, Edge)

// ── iOS / Nicht-Chromium-Erkennung ─────────────────────────────
// Auf iOS und Firefox funktioniert Firebase FCM nicht.
// Dort wird nur der native Web-Push-Handler genutzt.
const isChromium =
  typeof navigator !== "undefined" &&
  /Chrome/.test(navigator.userAgent) &&
  !/Edge/.test(navigator.userAgent);

let firebaseReady = false;

if (isChromium) {
  try {
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

    // Hintergrund-Nachrichten behandeln (Firebase / Android / Desktop Chrome)
    messaging.onBackgroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      self.registration.showNotification(title || "Neue Nachricht", {
        body: body || "Du hast eine neue Benachrichtigung!",
        icon: "/icons/icon-192.svg",
        badge: "/icons/icon-192.svg",
      });

      // App-Badge setzen (Android Chrome 81+)
      if ("setAppBadge" in navigator) {
        navigator.setAppBadge(1).catch(() => {});
      }

      // Offene App-Fenster benachrichtigen → In-App-Banner sofort anzeigen
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((windowClients) => {
          windowClients.forEach((client) =>
            client.postMessage({ type: "PUSH_RECEIVED" }),
          );
        });
    });

    firebaseReady = true;
    console.log("[SW] Firebase SDK geladen");
  } catch (err) {
    console.warn("[SW] Firebase SDK konnte nicht geladen werden:", err.message);
  }
} else {
  console.log("[SW] Kein Chromium-Browser – nur nativer Web Push aktiv");
}

// ── Native Web Push (iOS Safari, Firefox, Edge & Fallback) ─────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "Neue Nachricht" };
  }

  // Firebase-FCM-Nachrichten überspringen (werden vom SDK oben verarbeitet)
  if (
    firebaseReady &&
    (data.from || (data.notification && data.fcmMessageId))
  ) {
    return;
  }

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

  // Offene App-Fenster benachrichtigen → In-App-Banner sofort anzeigen
  const notifyClientsPromise = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((windowClients) => {
      windowClients.forEach((client) =>
        client.postMessage({ type: "PUSH_RECEIVED" }),
      );
    });

  event.waitUntil(
    Promise.all([notifPromise, badgePromise, notifyClientsPromise]),
  );
});

// Klick auf Benachrichtigung → App öffnen / fokussieren
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
