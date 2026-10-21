import { daily, handle, type Parcel, type Store } from "./relay";

interface Env {
  DB: D1Database;
}

/** D1 sometimes fails a query with a passing error (seen: "D1_ERROR: internal error"). */
const TRANSIENT = /internal error|reset|overloaded|network connection lost|storage caused object to be reset/i;

/**
 * Runs a query, trying twice more on a passing D1 error. Every query here is safe to repeat
 * (inserts ignore duplicates, the parcel write is an upsert, and the rest read or delete).
 */
export async function retry<T>(query: () => Promise<T>, attempts = 3, pauseMs = 50): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await query();
    } catch (e) {
      if (i >= attempts || !TRANSIENT.test(String((e as Error)?.message ?? e))) throw e;
      await new Promise((r) => setTimeout(r, pauseMs * i));
    }
  }
}

class D1Store implements Store {
  constructor(private db: D1Database) {}

  async claim(mailbox: string, auth: string) {
    await retry(() => this.db.prepare("INSERT OR IGNORE INTO mailboxes (id, auth) VALUES (?, ?)").bind(mailbox, auth).run());
    return (await this.authOf(mailbox)) ?? "";
  }

  async authOf(mailbox: string) {
    return retry(() => this.db.prepare("SELECT auth FROM mailboxes WHERE id = ?").bind(mailbox).first<string>("auth"));
  }

  async parcels(mailbox: string): Promise<Parcel[]> {
    const { results } = await retry(() =>
      this.db
        .prepare("SELECT device, body FROM parcels WHERE mailbox = ?")
        .bind(mailbox)
        .all<{ device: string; body: ArrayBuffer | number[] }>(),
    );
    return results.map((r) => ({ device: r.device, body: new Uint8Array(r.body) }));
  }

  async devices(mailbox: string) {
    const { results } = await retry(() => this.db.prepare("SELECT device FROM parcels WHERE mailbox = ?").bind(mailbox).all<{ device: string }>());
    return results.map((r) => r.device);
  }

  async put(mailbox: string, device: string, body: Uint8Array, day: number) {
    await retry(() =>
      this.db
        .prepare(
          "INSERT INTO parcels (mailbox, device, body, day) VALUES (?, ?, ?, ?) " +
            "ON CONFLICT (mailbox, device) DO UPDATE SET body = excluded.body, day = excluded.day",
        )
        .bind(mailbox, device, body, day)
        .run(),
    );
  }

  async remove(mailbox: string, device: string) {
    await retry(() => this.db.prepare("DELETE FROM parcels WHERE mailbox = ? AND device = ?").bind(mailbox, device).run());
  }

  async removeMailbox(mailbox: string) {
    await retry(() =>
      this.db.batch([
        this.db.prepare("DELETE FROM parcels WHERE mailbox = ?").bind(mailbox),
        this.db.prepare("DELETE FROM mailboxes WHERE id = ?").bind(mailbox),
      ]),
    );
  }

  async recordStats(day: number) {
    const active = (since: number, what: string) =>
      this.db.prepare(`SELECT COUNT(DISTINCT ${what}) AS n FROM parcels WHERE day >= ? AND day <= ?`).bind(since, day);
    const rows = await retry(() => this.db.batch<{ n: number }>([
      active(day, "mailbox"), active(day - 6, "mailbox"), active(day - 29, "mailbox"),
      active(day, "mailbox || device"), active(day - 6, "mailbox || device"), active(day - 29, "mailbox || device"),
      this.db.prepare("SELECT COUNT(*) AS n FROM mailboxes"),
    ]));
    const [h1, h7, h30, d1, d7, d30, total] = rows.map((r) => r.results[0]?.n ?? 0);
    await retry(() =>
      this.db.prepare("INSERT OR REPLACE INTO stats VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(day, h1, h7, h30, d1, d7, d30, total).run(),
    );
  }

  async expire(day: number) {
    await retry(() =>
      this.db.batch([
        this.db.prepare("DELETE FROM parcels WHERE day < ?").bind(day),
        this.db.prepare("DELETE FROM mailboxes WHERE id NOT IN (SELECT DISTINCT mailbox FROM parcels)"),
      ]),
    );
  }
}

export default {
  fetch(request: Request, env: Env) {
    return handle(request, new D1Store(env.DB));
  },
  async scheduled(_event: ScheduledController, env: Env) {
    await daily(new D1Store(env.DB));
  },
} satisfies ExportedHandler<Env>;
