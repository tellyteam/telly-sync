# telly-sync

The relay that keeps your place in sync across telly on [Android TV and Fire TV](https://github.com/tellyteam/telly-android), [iPad and Mac](https://github.com/tellyteam/telly-apple) and [LG TVs](https://github.com/tellyteam/telly-lg).

It's a mailbox for sealed boxes:
- Each device encrypts its progress, Continue watching and My List with a key derived from a link code. The relay never sees the code.
- Each device uploads its box, and fetches everyone else's.
- The relay can't open the boxes. It never receives your provider login, titles or anything about you, and it keeps no logs.
- Boxes not updated for 90 days are deleted.

[PROTOCOL.md](PROTOCOL.md) has the exact format, so anyone can check what is stored.

## Run your own

You need a free Cloudflare account. The relay fits easily in the free plan: a household makes a few hundred requests a day, and the free plan allows 100,000.

```bash
npm install
npx wrangler login
npx wrangler d1 create telly-sync     # paste the database_id it prints into wrangler.jsonc
npm run deploy
```

Wrangler prints your relay's address, for example `https://telly-sync.<your-subdomain>.workers.dev`. In each telly app, enter that address under Settings → Sync → Relay before linking.

## Usage figures

Once a day the relay saves totals, never anything about a household: how many households and devices synced in the last 1, 7 and 30 days. To see them, open the Cloudflare dashboard → Storage & Databases → D1 → telly-sync → Console, and run:

```sql
SELECT date(day * 86400, 'unixepoch') AS date, households_1d, households_7d, households_30d,
       devices_1d, devices_7d, devices_30d, households_total
FROM stats ORDER BY day DESC LIMIT 30;
```

## Develop

```bash
npm test                                              # relay tests
npx wrangler d1 migrations apply telly-sync --local
npm run dev                                           # http://localhost:8787
```

## Licence

telly is free for personal, non-commercial use under the [PolyForm Noncommercial License 1.0.0](LICENSE). Commercial use, including running it as or within a paid service, or bundling telly with a paid service, needs permission: ask through GitHub.
