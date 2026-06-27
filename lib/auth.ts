import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { NextResponse } from "next/server";

const ADMIN_COOKIE = "lifeguard_admin_session";
const GUARD_COOKIE = "lifeguard_guard_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const FALLBACK_SECRET = randomBytes(32).toString("hex");

type SessionPayload = {
  role: "admin" | "guard";
  name?: string;
  exp: number;
};

function stableSecret() {
  return (
    process.env.LIFEGUARD_SESSION_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.PGPASSWORD ||
    FALLBACK_SECRET
  );
}

export function adminCode() {
  return process.env.LIFEGUARD_ADMIN_CODE || process.env.ADMIN_CODE || "7900";
}

function signature(value: string) {
  return createHmac("sha256", stableSecret()).update(value).digest("base64url");
}

function constantTimeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function createSession(payload: Omit<SessionPayload, "exp">) {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const body = Buffer.from(JSON.stringify({ ...payload, exp: expiresAt })).toString("base64url");
  return `${body}.${signature(body)}`;
}

function readSession(value: string | undefined): SessionPayload | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig || !constantTimeEqual(signature(body), sig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") || "";
  const match = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

function setCookie(response: NextResponse, name: string, value: string) {
  response.cookies.set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function setAdminSession(response: NextResponse) {
  setCookie(response, ADMIN_COOKIE, createSession({ role: "admin" }));
}

export function setGuardSession(response: NextResponse, name: string) {
  setCookie(response, GUARD_COOKIE, createSession({ role: "guard", name }));
}

export function isAdminRequest(request: Request) {
  return readSession(readCookie(request, ADMIN_COOKIE))?.role === "admin";
}

export function guardNameForRequest(request: Request) {
  const session = readSession(readCookie(request, GUARD_COOKIE));
  return session?.role === "guard" ? session.name || "" : "";
}
