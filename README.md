# telly-sync

The relay that keeps your place in sync across telly on Fire TV, Mac, LG TV and iPad.

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

## Develop

```bash
npm test                                              # relay tests
npx wrangler d1 migrations apply telly-sync --local
npm run dev                                           # http://localhost:8787
```

## Licence

GPL-3.0-only.
