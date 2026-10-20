/**
 * The relay: a dumb mailbox for sealed parcels. It can't read them, and it keeps no logs, no IP
 * addresses and no times finer than a day. See PROTOCOL.md.
 */

export const MAX_BODY = 256 * 1024;
export const MAX_DEVICES = 12;
export const EXPIRY_DAYS = 90;

const MAILBOX = /^[0-9a-f]{32}$/;
const DEVICE = /^[0-9a-f]{16}$/;
const DAY_MS = 86_400_000;

export interface Parcel {
  device: string;
  body: Uint8Array;
}

/** Where mailboxes live: D1 when deployed, memory in tests. */
export interface Store {
  /** The stored token hash, after creating the mailbox with [auth] if it didn't exist. */
  claim(mailbox: string, auth: string): Promise<string>;
  /** The stored token hash, or null for an unknown mailbox. */
  authOf(mailbox: string): Promise<string | null>;
  parcels(mailbox: string): Promise<Parcel[]>;
  devices(mailbox: string): Promise<string[]>;
  put(mailbox: string, device: string, body: Uint8Array, day: number): Promise<void>;
  remove(mailbox: string, device: string): Promise<void>;
  removeMailbox(mailbox: string): Promise<void>;
  /** Deletes parcels last written before [day], then mailboxes with none left. */
  expire(day: number): Promise<void>;
  /** Records the day's totals (counts only) for the operator. */
  recordStats(day: number): Promise<void>;
}

export const today = (now: number) => Math.floor(now / DAY_MS);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...CORS, "Cache-Control": "no-store", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
  });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** Reads at most [limit] bytes; null when the body is larger. */
async function readBody(request: Request, limit: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > limit) return null;
  const bytes = new Uint8Array(await request.arrayBuffer());
  return bytes.length > limit ? null : bytes;
}

export async function handle(request: Request, store: Store, now = Date.now()): Promise<Response> {
  if (request.method === "OPTIONS") return reply(204);
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  if (parts[0] !== "v1" || parts.length < 2 || parts.length > 3) return reply(404);
  const [, mailbox, device] = parts;
  if (!MAILBOX.test(mailbox) || (device !== undefined && !DEVICE.test(device))) return reply(400);

  const token = request.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]{20,100})$/)?.[1];
  if (!token) return reply(401);
  const auth = await sha256Hex(token);

  const method = request.method;
  if (method === "PUT" && device) {
    const body = await readBody(request, MAX_BODY);
    if (!body) return reply(413);
    if (body.length === 0) return reply(400);
    if (!sameText(await store.claim(mailbox, auth), auth)) return reply(401);
    const devices = await store.devices(mailbox);
    if (!devices.includes(device) && devices.length >= MAX_DEVICES) return reply(409);
    await store.put(mailbox, device, body, today(now));
    return reply(204);
  }

  // Everything else needs an existing mailbox; an unknown one looks empty.
  const stored = await store.authOf(mailbox);
  if (stored === null) return method === "GET" && !device ? reply(200, { parcels: [] }) : method === "DELETE" ? reply(204) : reply(405);
  if (!sameText(stored, auth)) return reply(401);

  if (method === "GET" && !device) {
    const parcels = await store.parcels(mailbox);
    return reply(200, { parcels: parcels.map((p) => ({ device: p.device, body: toBase64(p.body) })) });
  }
  if (method === "DELETE") {
    if (device) await store.remove(mailbox, device);
    else await store.removeMailbox(mailbox);
    return reply(204);
  }
  return reply(405);
}

export const expire = (store: Store, now = Date.now()) => store.expire(today(now) - EXPIRY_DAYS);

/** The daily job: yesterday's totals first (while every parcel still counts), then expiry. */
export async function daily(store: Store, now = Date.now()) {
  await store.recordStats(today(now) - 1);
  await expire(store, now);
}
