# Changelog

## 2.2.0

### Fixed

- `getHistory` / `getStreamHistory` with no matching events (an empty id list,
  unknown ids, or a `type` filter that matches nothing) now returns an empty
  history without consulting the PII base. Previously the empty event list was
  turned into `getPiiLookup({ keys: [] })`.
- `getPiiLookup({ keys: [] })` now returns an empty lookup without querying,
  on both the Postgres and in-memory PII bases. On Postgres the empty key list
  used to fall through to a bare `SELECT Key, Data FROM pii_store`, loading the
  entire PII table into the caller's heap.

- The in-memory PII base now returns a plain object from `getPiiLookup`, as
  the `PiiBaseType` contract declares and as the Postgres base already did.
  It used to return a `Map`, so `getStreamHistory`, `replayEvents` and
  `replayEventsStreamed` (which index the lookup by key) never merged PII back
  in when running on the memory base. The one call site that assumed a `Map`,
  `getEvents({ withPii: true })`, now indexes by key too; against the Postgres
  base it would previously have thrown.
- Both replay paths skipped the PII merge for sequence number 0 because the
  guard tested the number for truthiness. Postgres numbers from 1 so this only
  showed on the in-memory event base, where the first event is 0.

### Added

- Each `EventHistory` entry now carries `sequenceNum`, the event's position in
  the event store. `date` is caller-supplied and millisecond-resolution, so
  events recorded together usually share one value; sort by
  `(date, sequenceNum)` for a stable order. Existing fields are unchanged.

### Notes

- The Postgres `eventlist` table is indexed on `StreamId` only. A typed read
  (`getHistory(ids, type)`) still reads every row of each stream and filters
  by `Type` afterwards, so for the database it costs the same as an untyped
  read of the same streams. A `(StreamId, Type)` composite index would need
  a migration run outside `init()`, since `CREATE INDEX CONCURRENTLY` cannot
  run inside the implicit transaction `createTables` executes in.
