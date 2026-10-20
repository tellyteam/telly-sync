import { expire, handle, type Parcel, type Store } from "./relay";

interface Env {
  DB: D1Database;
}

class D1Store implements Store {
  constructor(private db: D1Database) {}

  async claim(mailbox: string, auth: string) {
    await this.db.prepare("INSERT OR IGNORE INTO mailboxes (id, auth) VALUES (?, ?)").bind(mailbox, auth).run();
    return (await this.authOf(mailbox)) ?? "";
  }

  async authOf(mailbox: string) {
    return this.db.prepare("SELECT auth FROM mailboxes WHERE id = ?").bind(mailbox).first<string>("auth");
  }

  async parcels(mailbox: string): Promise<Parcel[]> {
    const { results } = await this.db
      .prepare("SELECT device, body FROM parcels WHERE mailbox = ?")
      .bind(mailbox)
      .all<{ device: string; body: ArrayBuffer | number[] }>();
    return results.map((r) => ({ device: r.device, body: new Uint8Array(r.body) }));
  }

  async devices(mailbox: string) {
    const { results } = await this.db.prepare("SELECT device FROM parcels WHERE mailbox = ?").bind(mailbox).all<{ device: string }>();
    return results.map((r) => r.device);
  }

  async put(mailbox: string, device: string, body: Uint8Array, day: number) {
    await this.db
      .prepare(
        "INSERT INTO parcels (mailbox, device, body, day) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT (mailbox, device) DO UPDATE SET body = excluded.body, day = excluded.day",
      )
      .bind(mailbox, device, body, day)
      .run();
  }

  async remove(mailbox: string, device: string) {
    await this.db.prepare("DELETE FROM parcels WHERE mailbox = ? AND device = ?").bind(mailbox, device).run();
  }

  async removeMailbox(mailbox: string) {
    await this.db.batch([
      this.db.prepare("DELETE FROM parcels WHERE mailbox = ?").bind(mailbox),
      this.db.prepare("DELETE FROM mailboxes WHERE id = ?").bind(mailbox),
    ]);
  }

  async expire(day: number) {
    await this.db.batch([
      this.db.prepare("DELETE FROM parcels WHERE day < ?").bind(day),
      this.db.prepare("DELETE FROM mailboxes WHERE id NOT IN (SELECT DISTINCT mailbox FROM parcels)"),
    ]);
  }
}

export default {
  fetch(request: Request, env: Env) {
    return handle(request, new D1Store(env.DB));
  },
  async scheduled(_event: ScheduledController, env: Env) {
    await expire(new D1Store(env.DB));
  },
} satisfies ExportedHandler<Env>;
