import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getAdminAuth() {
  const app = getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
  return getAuth(app);
}

export async function verifyIdToken(token: string) {
  if (!token) throw new Error("Missing authentication token.");
  return getAdminAuth().verifyIdToken(token);
}
