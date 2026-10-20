# telly sync, version 1

telly keeps your place in sync across your own devices (Fire TV, Mac, LG TV, iPad) through a tiny relay. The relay only ever holds sealed boxes it cannot open.

## What is synced, and what never is

**Synced**, inside the encrypted parcel:

- Watch progress: the item key, for example `series/1234.mkv`, plus the position, the duration and when it was saved.
- Continue watching: a channel, film or episode id plus a time. A series entry also carries the series id.
- My List: the key, for example `film:4567`, and whether it's on the list.

**Never synced or stored:** the provider address, username or password; playlist URLs; titles, names or artwork; anything else about you. This holds even in hashed form.

- Everything is keyed by your provider's own ids, so linked devices must use the same provider. Each device signs in to your provider separately, and the relay never learns which provider that is.
- Clients must drop any key or id that is not short and plain: `^[a-z]{1,8}[/:][A-Za-z0-9._-]{1,40}$` for keys and `^[A-Za-z0-9._-]{1,40}$` for ids. This keeps URLs out. M3U playlists use the stream URL as the id, so M3U items are never synced.

## Link code

- **Format:** 16 characters from Crockford's base32 alphabet (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), giving 80 random bits. It's shown as `XXXX-XXXX-XXXX-XXXX`.
- **Normalising:** before use, the code is uppercased, spaces and dashes are removed, `O` becomes `0`, and `I` and `L` become `1`.
- **Who knows it:** the code is the only secret. It is shown only on your devices, and it never leaves them.

### Linking by QR code

A device can show the code as a QR code holding `telly://sync?code=<code>`. It adds `&relay=<percent-encoded address>` only when it uses a relay other than telly's own. Devices with a camera read the link and confirm with the user before linking. The link carries the code, so it is shown only on the device's own screen.

## Keys

The keys come from HKDF-SHA256 with:
- input key material: the normalised code as UTF-8;
- salt: `telly-sync v1` (UTF-8);
- output length: 32 bytes;
- the info string listed for each key below.

| Name    | info      | Use |
|---------|-----------|-----|
| mailbox | `mailbox` | First 16 bytes, as lowercase hex (32 characters): the relay address of the household. |
| key     | `key`     | The AES-256-GCM key for parcels. |
| auth    | `auth`    | Sent as `Authorization: Bearer <base64url, no padding>`. The relay keeps only its SHA-256. |

Each install also picks a random **device id**: 8 bytes, as lowercase hex (16 characters).

## Parcel

Each device writes one parcel, which holds its whole current state.

```json
{
  "v": 1,
  "at": 1760000000000,
  "progress": { "series/1234.mkv": [600000, 2700000, 1760000000000] },
  "history":  [ { "kind": "series", "series": "88", "id": "1234", "at": 1760000000000 },
                { "kind": "film", "id": "4567", "at": 1759990000000 },
                { "kind": "live", "id": "301", "at": 1759900000000 },
                { "kind": "film", "id": "999", "at": 1759800000000, "removed": true } ],
  "list":     { "film:4567": [1760000000000, true], "live:12": [1759000000000, false] },
  "cleared":  0
}
```

- All times are milliseconds since 1970.
- `progress` maps a key to `[position, duration, saved at]`.
- `history` holds one entry per slot. The slots are `live`, `film:<id>` and `series:<series>`.
  - `removed: true` means the entry was taken out of Continue watching.
- `list` maps a My List key to `[changed at, on the list]`.
- `cleared` is when watch progress was last cleared on any device, or 0 if never. Progress and history saved at or before then are dropped, on every device. My List is kept.
- Removals (`removed`, and `false` in `list`) are kept for 90 days, so they reach the other devices.
- Limits: at most 2,000 progress entries, 40 history entries and 2,000 list entries. The newest are kept.

### Sealing

- The envelope is: `0x01 ‖ nonce (12 random bytes) ‖ AES-256-GCM(key, nonce, UTF-8 JSON, aad)`.
- The aad is `telly-sync v1|<mailbox>|<device>` (UTF-8). This stops the relay swapping parcels between devices or households without detection.

### Merging

When a device syncs, it combines its own state with every other device's parcel.
- For each key or slot, the newest `at` wins, and a removal is just a newer entry. On a tie, the device's own entry wins.
- `cleared` takes the latest value, and then anything at or before it is dropped.

## Relay API

The base URL is configurable (for example `https://telly-sync.example.workers.dev`). Every request needs the bearer token.

| Request | Result |
|---------|--------|
| `GET /v1/{mailbox}` | `200` and `{"parcels":[{"device":"…","body":"<base64>"}]}`. An unknown mailbox gives an empty list. |
| `PUT /v1/{mailbox}/{device}` | The body is the sealed parcel (at most 256 KiB). Returns `204`. The first write creates the mailbox and fixes its token. |
| `DELETE /v1/{mailbox}/{device}` | Removes one device's parcel. Returns `204`. |
| `DELETE /v1/{mailbox}` | Removes the whole household. Returns `204`. |

- **Errors:** `401` for a wrong token, `400` for a bad id, `413` for a body that's too large, `409` if the household already has 12 devices.
- **What the relay keeps:**
  - the mailbox id and the SHA-256 of its token;
  - each device id with its sealed parcel;
  - the **day** each parcel was last written.
- **What it never keeps:** request logs, IP addresses or times of day.
- **Daily totals for the operator:** how many households and devices synced in the last 1, 7 and 30 days, and the number of households. These are counts only; they say nothing about any household or device.
- **Expiry:** parcels not written for 90 days are deleted, then empty mailboxes.

Devices sync when telly opens or comes back to the front, and after playback stops. They never sync during playback.

## Test vector

Every client must reproduce these values:

| Field | Value |
|-------|-------|
| code | `0123456789ABCDEF` |
| mailbox | `964c34622b2ead29bde1300eddb81273` |
| key (hex) | `b98184ea929152cda7eb1b420ea2d4445b5c01aa84480b86670365cb2310586e` |
| auth | `U4UwJNTeVMR0DU0Bem7LRlBoeCR4UAL9ouKh7CuGXjQ` |
| device | `00112233aabbccdd` |
| nonce (hex) | `000102030405060708090a0b` |
| plaintext | `{"v":1}` |
| sealed (hex) | `01000102030405060708090a0b8c30ca4029013ae61434a3351cb312ca06d33a229d9dd9` |
