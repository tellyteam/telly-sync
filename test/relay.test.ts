import { describe, expect, it } from "vitest";
import { expire, handle, MAX_BODY, MAX_DEVICES, type Parcel, type Store } from "../src/relay";

class MemoryStore implements Store {
  auth = new Map<string, string>();
  rows = new Map<string, Map<string, { body: Uint8Array; day: number }>>();

  async claim(m: string, a: string) {
    if (!this.auth.has(m)) this.auth.set(m, a);
    return this.auth.get(m)!;
  }
  async authOf(m: string) {
    return this.auth.get(m) ?? null;
  }
  async parcels(m: string): Promise<Parcel[]> {
    return [...(this.rows.get(m) ?? new Map()).entries()].map(([device, r]) => ({ device, body: r.body }));
  }
  async devices(m: string) {
    return [...(this.rows.get(m)?.keys() ?? [])];
  }
  async put(m: string, d: string, body: Uint8Array, day: number) {
    if (!this.rows.has(m)) this.rows.set(m, new Map());
    this.rows.get(m)!.set(d, { body, day });
  }
  async remove(m: string, d: string) {
    this.rows.get(m)?.delete(d);
  }
  async removeMailbox(m: string) {
    this.rows.delete(m);
    this.auth.delete(m);
  }
  async expire(day: number) {
    for (const [m, devices] of this.rows) {
      for (const [d, r] of devices) if (r.day < day) devices.delete(d);
      if (devices.size === 0) this.rows.delete(m);
    }
    for (const m of this.auth.keys()) if (!this.rows.has(m)) this.auth.delete(m);
  }
}

const MAILBOX = "0123456789abcdef0123456789abcdef";
const DEVICE = "00112233aabbccdd";
const TOKEN = "abcdefghijklmnopqrstuvwxyz012345";
const url = (path: string) => `https://relay.test${path}`;

function call(store: Store, method: string, path: string, opts: { token?: string; body?: Uint8Array; now?: number } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token !== undefined) headers.Authorization = `Bearer ${opts.token}`;
  return handle(new Request(url(path), { method, headers, body: opts.body }), store, opts.now);
}

const put = (store: Store, device = DEVICE, token = TOKEN, body = new Uint8Array([1, 2, 3]), now?: number) =>
  call(store, "PUT", `/v1/${MAILBOX}/${device}`, { token, body, now });

describe("relay", () => {
  it("stores a parcel and returns it to the same household", async () => {
    const store = new MemoryStore();
    expect((await put(store)).status).toBe(204);
    const res = await call(store, "GET", `/v1/${MAILBOX}`, { token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ parcels: [{ device: DEVICE, body: "AQID" }] });
  });

  it("keeps only the hash of the token", async () => {
    const store = new MemoryStore();
    await put(store);
    const kept = store.auth.get(MAILBOX)!;
    expect(kept).toMatch(/^[0-9a-f]{64}$/);
    expect(kept).not.toContain(TOKEN);
  });

  it("refuses the wrong token for reading, writing and deleting", async () => {
    const store = new MemoryStore();
    await put(store);
    const wrong = "ZZZZefghijklmnopqrstuvwxyz012345";
    expect((await call(store, "GET", `/v1/${MAILBOX}`, { token: wrong })).status).toBe(401);
    expect((await put(store, DEVICE, wrong)).status).toBe(401);
    expect((await call(store, "DELETE", `/v1/${MAILBOX}`, { token: wrong })).status).toBe(401);
    expect(await store.devices(MAILBOX)).toEqual([DEVICE]);
  });

  it("needs a token at all", async () => {
    expect((await call(new MemoryStore(), "GET", `/v1/${MAILBOX}`)).status).toBe(401);
  });

  it("makes an unknown household look empty", async () => {
    const res = await call(new MemoryStore(), "GET", `/v1/${MAILBOX}`, { token: TOKEN });
    expect(await res.json()).toEqual({ parcels: [] });
  });

  it("rejects malformed ids", async () => {
    const store = new MemoryStore();
    expect((await call(store, "GET", "/v1/NOT-A-MAILBOX", { token: TOKEN })).status).toBe(400);
    expect((await put(store, "short")).status).toBe(400);
  });

  it("rejects parcels that are too large or empty", async () => {
    const store = new MemoryStore();
    expect((await put(store, DEVICE, TOKEN, new Uint8Array(MAX_BODY + 1))).status).toBe(413);
    expect((await put(store, DEVICE, TOKEN, new Uint8Array(0))).status).toBe(400);
  });

  it("caps the devices in a household", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < MAX_DEVICES; i++) expect((await put(store, i.toString(16).padStart(16, "0"))).status).toBe(204);
    expect((await put(store, "ffffffffffffffff")).status).toBe(409);
    // An existing device can still update.
    expect((await put(store, "0".repeat(16))).status).toBe(204);
  });

  it("removes one device, or the whole household", async () => {
    const store = new MemoryStore();
    await put(store);
    await put(store, "aaaaaaaaaaaaaaaa");
    expect((await call(store, "DELETE", `/v1/${MAILBOX}/${DEVICE}`, { token: TOKEN })).status).toBe(204);
    expect(await store.devices(MAILBOX)).toEqual(["aaaaaaaaaaaaaaaa"]);
    expect((await call(store, "DELETE", `/v1/${MAILBOX}`, { token: TOKEN })).status).toBe(204);
    expect(store.auth.has(MAILBOX)).toBe(false);
  });

  it("forgets households idle for 90 days", async () => {
    const store = new MemoryStore();
    const day = 86_400_000;
    await put(store, DEVICE, TOKEN, undefined, 0);
    await put(store, "aaaaaaaaaaaaaaaa", TOKEN, undefined, 50 * day);
    await expire(store, 120 * day);
    expect(await store.devices(MAILBOX)).toEqual(["aaaaaaaaaaaaaaaa"]);
    await expire(store, 200 * day);
    expect(store.auth.size).toBe(0);
  });

  it("answers browser preflight requests", async () => {
    const res = await call(new MemoryStore(), "OPTIONS", `/v1/${MAILBOX}`);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });
});
