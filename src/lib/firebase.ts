import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';

// Values come from environment variables set in Vercel (Project Settings > Environment Variables).
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string,
  // On the club domain, sign-in pages are proxied through it (see vercel.json),
  // so the Google window says isphbusiness.club instead of firebaseapp.com.
  authDomain: typeof window !== 'undefined' && window.location.hostname === 'isphbusiness.club' ? 'isphbusiness.club' : (env.VITE_FIREBASE_AUTH_DOMAIN as string),
  projectId: env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: env.VITE_FIREBASE_APP_ID as string,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const app = initializeApp(firebaseConfigured ? firebaseConfig : { apiKey: 'missing', projectId: 'missing', appId: 'missing' });
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let instance: Firestore;
try {
  instance = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch {
  instance = initializeFirestore(app, {});
}
export const db = instance;
