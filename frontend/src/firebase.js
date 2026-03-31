import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { firebaseConfig, vapidKey } from "./firebase-config";

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

export async function requestNotificationPermission() {
  console.log("[Push] requestNotificationPermission aufgerufen");

  if (!("Notification" in window)) {
    console.warn("[Push] Notification API nicht verfügbar");
    return null;
  }

  console.log("[Push] Aktueller Status:", Notification.permission);
  const permission = await Notification.requestPermission();
  console.log("[Push] Ergebnis von requestPermission:", permission);

  if (permission !== "granted") {
    return null;
  }

  // Firebase-Messaging-Service-Worker explizit registrieren,
  // damit es keinen Konflikt mit dem VitePWA-Service-Worker gibt
  console.log("[Push] Registriere Service Worker...");
  const swRegistration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js",
  );
  console.log("[Push] Service Worker registriert:", swRegistration.scope);

  console.log("[Push] Fordere FCM-Token an...");
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: swRegistration,
  });
  console.log("[Push] Token erhalten:", token ? "ja" : "nein");
  return token;
}

export async function registerTokenOnServer(token) {
  const res = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return res.json();
}

export function onForegroundMessage(callback) {
  return onMessage(messaging, (payload) => {
    callback(payload);
  });
}

export { messaging };
