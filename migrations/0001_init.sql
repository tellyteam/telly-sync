-- One row per household: its id and the SHA-256 of its token. Nothing else.
CREATE TABLE mailboxes (
  id TEXT PRIMARY KEY,
  auth TEXT NOT NULL
);

-- One sealed parcel per device, and the day (days since 1970) it was last written, for expiry.
CREATE TABLE parcels (
  mailbox TEXT NOT NULL,
  device TEXT NOT NULL,
  body BLOB NOT NULL,
  day INTEGER NOT NULL,
  PRIMARY KEY (mailbox, device)
);

CREATE INDEX parcels_day ON parcels (day);
