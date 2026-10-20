-- Daily totals for the operator: counts only, nothing that identifies a household or device.
-- Written once a day by the scheduled clean-up; kept after the households themselves expire.
CREATE TABLE stats (
  day INTEGER PRIMARY KEY,       -- days since 1970 (UTC), the day the totals describe
  households_1d INTEGER NOT NULL,
  households_7d INTEGER NOT NULL,
  households_30d INTEGER NOT NULL,
  devices_1d INTEGER NOT NULL,
  devices_7d INTEGER NOT NULL,
  devices_30d INTEGER NOT NULL,
  households_total INTEGER NOT NULL
);
