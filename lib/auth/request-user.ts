import { verifyIdToken } from "@/lib/auth/firebase-admin";

export async function getRequestUser(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return verifyIdToken(token);
}
