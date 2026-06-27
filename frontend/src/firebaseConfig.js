// ============================================================================
//  Asha Care — Firebase Client Config
//  Public web config for project asha-care-b95ff (safe to embed in frontend).
//  Override any value via frontend/.env using VITE_ prefix for local dev.
// ============================================================================

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "AIzaSyBr-NRUg9MOdDjJeMeJqjNrB3dFA_iDt2A",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "asha-care-b95ff.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "asha-care-b95ff",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "asha-care-b95ff.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "291162494739",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "1:291162494739:web:9e14867df4d2ab82382ce6",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
