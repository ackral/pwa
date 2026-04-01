import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { firebaseConfig, vapidKey } from "./firebase-config";

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// iOS erkennen (iOS Safari unterstützt kein Firebase FCM, aber nativen Web Push)
export function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// Base64url → Uint8Array (für PushManager.subscribe applicationServerKey)
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Nativen Web Push abonnieren (iOS Safari + alle Plattformen als Fallback)
export async function subscribeNativePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Web Push wird nicht unterstützt");
  }

  // VAPID Public Key vom Server holen
  const keyRes = await fetch("/api/push/vapid-public-key");
  const { publicKey } = await keyRes.json();

  // firebase-messaging-sw.js als Service Worker registrieren
  const swReg = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js",
  );
  await navigator.serviceWorker.ready;

  // Bestehende Subscription prüfen
  let subscription = await swReg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await swReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  // Subscription beim Backend registrieren
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription }),
  });

  return subscription;
}

// Native Web-Push-Subscription entfernen
export async function unsubscribeNativePush() {
  const swReg = await navigator.serviceWorker.getRegistration(
    "/firebase-messaging-sw.js",
  );
  if (!swReg) return;
  const subscription = await swReg.pushManager.getSubscription();
  if (!subscription) return;

  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}

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

  // Auf iOS: nativen Web Push verwenden statt FCM
  if (isIOS()) {
    console.log("[Push] iOS erkannt – verwende nativen Web Push");
    await subscribeNativePush();
    return "ios-webpush";
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
  if (token === "ios-webpush") return { message: "iOS Web Push registriert" };
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
