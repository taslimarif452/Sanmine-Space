import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

type VerifiedUser = {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
};

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function getAdminAuth() {
  const projectId = env("FIREBASE_PROJECT_ID") || env("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const clientEmail = env("FIREBASE_CLIENT_EMAIL");
  const privateKey = env("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin credentials are not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in Vercel, or allow the public Firebase verification fallback.");
  }

  const app = getApps()[0] ?? initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  return getAuth(app);
}

async function verifyWithFirebaseRest(token: string): Promise<VerifiedUser> {
  const apiKey = env("FIREBASE_API_KEY") || env("NEXT_PUBLIC_FIREBASE_API_KEY");
  const projectId = env("FIREBASE_PROJECT_ID") || env("NEXT_PUBLIC_FIREBASE_PROJECT_ID");

  if (!apiKey || !projectId) {
    throw new Error("Firebase verification is not configured. Set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID, or the Firebase Admin credentials.");
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }),
    cache: "no-store",
  });

  const raw = await response.text();
  if (!response.ok) {
    let detail = raw || "Firebase rejected the ID token.";
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.error?.message || detail;
    } catch { /* non-JSON Firebase response */ }
    throw new Error(`Firebase token verification failed (${response.status}): ${detail}`);
  }

  const data = JSON.parse(raw) as { users?: Array<{ localId?: string; email?: string; displayName?: string; photoUrl?: string }> };
  const firebaseUser = data.users?.[0];
  if (!firebaseUser?.localId) throw new Error("Firebase returned no authenticated user.");

  return {
    uid: firebaseUser.localId,
    email: firebaseUser.email,
    name: firebaseUser.displayName,
    picture: firebaseUser.photoUrl,
  };
}

export async function verifyIdToken(token: string): Promise<VerifiedUser> {
  if (!token) throw new Error("Missing authentication token.");

  // Prefer Firebase Admin when the server credentials are present. This is the
  // recommended trusted-server setup. If they are not present in Vercel, use
  // Firebase's token verification endpoint so the app still works with the
  // public Firebase web config already required for Google Sign-In.
  try {
    return await getAdminAuth().verifyIdToken(token);
  } catch (adminError) {
    try {
      return await verifyWithFirebaseRest(token);
    } catch (restError) {
      const adminMessage = adminError instanceof Error ? adminError.message : "Admin verification failed.";
      const restMessage = restError instanceof Error ? restError.message : "Firebase verification failed.";
      throw new Error(`Authentication failed. Admin: ${adminMessage} REST: ${restMessage}`);
    }
  }
}
