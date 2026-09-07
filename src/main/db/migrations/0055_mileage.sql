-- A mileage log: business trips, claimed at the CRA per-kilometre rate.
--
-- IMPORTANT: raw SQL — the CamelCasePlugin does NOT translate identifiers here. snake_case only.
--
-- Trips are recorded, not posted. The claim is worked out from the whole year's trips at once,
-- because the rate steps down after the first 5,000 km — so what a trip is worth depends on every
-- trip before it, and a per-trip journal entry written at entry time would be wrong for any trip
-- that later turns out to sit past the step.
--
-- Posting happens on demand: journal_entry_id is set once a period's claim has been booked, which
-- is also what stops the same trips being claimed twice.
CREATE TABLE mileage_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_date TEXT NOT NULL,
  kilometres REAL NOT NULL,
  purpose TEXT NOT NULL,
  -- Free text: most small businesses have one or two vehicles and naming them is enough.
  vehicle TEXT,
  start_location TEXT,
  end_location TEXT,
  -- Set once this trip has been included in a posted claim. Null means unclaimed.
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_mileage_trips_date ON mileage_trips(trip_date);
CREATE INDEX idx_mileage_trips_claimed ON mileage_trips(journal_entry_id);
