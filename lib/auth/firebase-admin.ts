type VerifiedUser = {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
};

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

/**
 * Verify Firebase ID tokens without loading firebase-admin inside a Vercel
 * serverless route. Firebase's documented accounts:lookup endpoint validates
 * the ID token and returns the authenticated user's profile.
 *
 * This deliberately uses the Firebase Web API key already required by the
 * browser Google-auth client. The API key is not treated as a secret by
 * Firebase; authorization comes from the ID token in the request body.
 */
export async function verifyIdToken(token: string): Promise<VerifiedUser> {
  if (!token) throw new Error("Missing authentication token.");

  const apiKey = env("FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!apiKey) {
    throw new Error("Firebase verification is not configured. Set NEXT_PUBLIC_FIREBASE_API_KEY in Vercel.");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      cache: "no-store",
    },
  );

  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // Keep the raw response for the useful error below.
  }

  if (!response.ok) {
    const detail = data?.error?.message || raw || "Firebase rejected the ID token.";
    throw new Error(`Firebase token verification failed (${response.status}): ${detail}`);
  }

  const firebaseUser = data?.users?.[0];
  if (!firebaseUser?.localId) {
    throw new Error("Firebase returned no authenticated user.");
  }

  if (firebaseUser.disabled === true) {
    throw new Error("This Firebase user account is disabled.");
  }

  return {
    uid: String(firebaseUser.localId),
    email: typeof firebaseUser.email === "string" ? firebaseUser.email : undefined,
    name: typeof firebaseUser.displayName === "string" ? firebaseUser.displayName : undefined,
    picture: typeof firebaseUser.photoUrl === "string" ? firebaseUser.photoUrl : undefined,
  };
}
