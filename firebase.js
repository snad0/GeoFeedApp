// firebase.js
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- YOUR CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyBcWEO2zGgA9cZxyqaNwcvLAYRKZgOB_lU",
  authDomain: "geofeedapp-test.firebaseapp.com",
  projectId: "geofeedapp-test",
  storageBucket: "geofeedapp-test.firebasestorage.app",
  messagingSenderId: "941275504335",
  appId: "1:941275504335:web:7fe62bd4538b39957661ba"
};

// Ensure single init (works with Fast Refresh)
let app, auth;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} else {
  app = getApp();
  auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
