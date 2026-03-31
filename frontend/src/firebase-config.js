// Firebase-Konfiguration
// Ersetze diese Werte mit deinem eigenen Firebase-Projekt
const firebaseConfig = {
  apiKey: "AIzaSyB3VZPzDN-JCqtzaT22UdlLD3NfhWcuLCs",
  authDomain: "mycompanypwa.firebaseapp.com",
  projectId: "mycompanypwa",
  storageBucket: "mycompanypwa.firebasestorage.app",
  messagingSenderId: "542063105466",
  appId: "1:542063105466:web:e0850045cb2eba8f157983",
  measurementId: "G-LY632HGEG2",
};

// VAPID-Key für Web-Push (aus Firebase Console → Cloud Messaging → Web-Push-Zertifikat)
const vapidKey =
  "BFsRT53xrWXDamickUSdk5oGT8YkoXYEQbaAVl9TCZtmbzLWUiTcjhLARl4-VDjPPbmPoeyFKYKq2Al5xI05Vi8";

export { firebaseConfig, vapidKey };
