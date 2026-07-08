import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { AppError } from "@/lib/errors/app-error";

const SESSION_COOKIE = "opal-lab-session";
const SESSION_TTL = 60 * 60 * 24 * 7;

function getSessionSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new AppError("INTERNAL_ERROR", "Session secret is not configured", 500);
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(getSessionSecret());
}

export async function verifySession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    return typeof payload.userId === "string" ? payload.userId : null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: string): Promise<void> {
  const token = await createSession(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireSessionUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "נדרשת התחברות", 401);
  }
  return userId;
}
