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

// Hintergrund-Nachrichten behandeln
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "Neue Nachricht", {
    body: body || "Du hast eine neue Benachrichtigung!",
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
  });
});
