# Changelog

## 2.2.1

### Fixed

- `ShimmieTestStack` now serves supertest requests from one HTTP server bound
  explicitly to `127.0.0.1` on an ephemeral port. It used to hand supertest a
  bare express app, which makes supertest call `app.listen(0)` per request: a
  wildcard bind that macOS will satisfy with a port another process already
  holds on the loopback address, so the request lands on that process instead
  (stray 401/404/405 responses from desktop apps) or never answers, leaving
  the per-request server open so jest cannot exit. Consumers that patched
  `net.Server.prototype.listen` in their jest setup to work around this can
  remove the patch.

### Added

- `ShimmieTestStack.serverAddress()` resolves to the bound address, and
  `ShimmieTestStack.shutdown()` closes the server. Both are optional: the
  server and its sockets are unref'd, so a stack created at module scope and
  never shut down does not keep the jest process alive.

## 2.2.0

### Security

- Postgres `addEvent` interpolated event values with `pg-format %s` inside
  dollar-quoted literals, so a `$$` in event data or meta (such as a request's
  user agent) could terminate the literal and inject SQL. Every value now
  travels as a positional parameter, and the version-checked write is a single
  statement taking its stream/version pairs via `unnest()`.

### Fixed

- Postgres `getLatestSequenceNumber` cast `max(sequencenum)` to `int`, which
  fails once the bigserial passes 2^31. The cast is dropped, and an empty
  table now returns -1 (documented on `EventBaseType`, matching the memory
  base) instead of leaking `NULL`.
- Memory event base: `getLatestSequenceNumber` threw on an empty log (crashing
  cold start), `getEventsInOrder(0)` returned only the last event so replay
  from 0 dropped history, and `addEvent` assigned the sequence number outside
  the lock so two concurrent checked writes against one version could both
  land. All three fixed; a shared contract test now runs against both bases.
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
