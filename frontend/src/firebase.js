import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { firebaseConfig, vapidKey } from "./firebase-config";

const app = initializeApp(firebaseConfig);

// Firebase Messaging nur auf Chromium-Browsern initialisieren
// (Firefox & iOS Safari unterstützen kein FCM)
const isChromium =
  /Chrome/.test(navigator.userAgent) && !/Edge/.test(navigator.userAgent);
let messaging = null;
try {
  if (isChromium) {
    messaging = getMessaging(app);
  }
} catch {
  console.warn("[Push] Firebase Messaging nicht verfügbar");
}

// iOS erkennen
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

// Nativen Web Push abonnieren (funktioniert auf ALLEN Plattformen)
export async function subscribeNativePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("[Push] Web Push API nicht verfügbar");
    return null;
  }

  try {
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

    console.log("[Push] Native Web Push Subscription registriert");
    return subscription;
  } catch (err) {
    console.error("[Push] Native Web Push Subscription fehlgeschlagen:", err);
    return null;
  }
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

  // IMMER nativen Web Push abonnieren (funktioniert auf allen Plattformen)
  await subscribeNativePush();

  // Auf Chromium zusätzlich FCM registrieren (für Firebase-spezifische Features)
  if (isChromium && messaging) {
    try {
      console.log("[Push] Chromium erkannt – registriere zusätzlich FCM...");
      const swRegistration = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
      );
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: swRegistration,
      });
      console.log("[Push] FCM-Token erhalten:", token ? "ja" : "nein");
      return token;
    } catch (err) {
      console.warn("[Push] FCM-Registrierung fehlgeschlagen:", err.message);
    }
  }

  // Auf iOS / Firefox: nur nativer Web Push
  return "webpush-only";
}

export async function registerTokenOnServer(token) {
  if (token === "webpush-only" || token === "ios-webpush") {
    return { message: "Web Push registriert" };
  }
  const res = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return res.json();
}

export function onForegroundMessage(callback) {
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    callback(payload);
  });
}

export { messaging };
