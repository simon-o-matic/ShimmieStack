/**
 * A query to safely add an event.
 * It checks the version pairs entered at call time, with the max versions for a stream in the DB
 * It returns the rows that were inserted, if no rows inserted then versions are out of date so the request needs
 * to be retried once this server has more up to date events
 */
import Format from 'pg-format'
import { EventToRecord } from './event'

export const prepareAddEventQuery = (event: EventToRecord, streamVersionIds?: Record<string, string|undefined>): string => {
    // streamVersionIds ? Format(addEventVersionCheckedQuery, newEvent, streamVersionIds) :
    return streamVersionIds ?
        Format(addEventVersionCheckedQuery, Object.entries(streamVersionIds), event.streamId, event.streamVersionId, event.data, event.type, event.meta) :
        Format(addEventVersionUncheckedQuery, event.streamId, event.streamVersionId, event.data, event.type, event.meta)
}

export const fetchMatchStreamVersionsQuery = (streamIds: string[]): string => {
    return Format(selectMaxStreamVersions, streamIds)
}

const addEventVersionUncheckedQuery = `insert into eventlist (StreamId, StreamVersionId, Data, Type, Meta)
select $$%s$$, $$%s$$, $$%s$$, $$%s$$, $$%s$$
RETURNING sequenceNum, streamId, StreamVersionId, logdate, type, Data;`


const addEventVersionCheckedQuery = `
DROP TABLE IF EXISTS tmp_stream_version_pairs;
-- Ensure we are working from a clean slate with out temp table
CREATE TEMPORARY TABLE IF NOT EXISTS tmp_stream_version_pairs
(
    stream_id        text NOT NULL,
    stream_version_id text NULL,
    PRIMARY KEY (stream_id)
);

-- Insert the streamId, version pairs the caller has decided to act using
INSERT INTO tmp_stream_version_pairs (stream_id, stream_version_id)
VALUES %L;

with max_db_stream_versions as (
    SELECT DISTINCT ON (el.StreamId) el.SequenceNum, el.StreamId, el.StreamVersionId
    FROM eventlist el
             JOIN tmp_stream_version_pairs s on el.StreamId = s.stream_id
    ORDER BY el.StreamId, el.SequenceNum DESC
)
-- Insert the new event
insert
into eventlist (StreamId, StreamVersionId, Data, Type, Meta)
select $$%s$$, $$%s$$, $$%s$$, $$%s$$, $$%s$$
-- Only if this subquery returns us a result
where exists(
          -- Select out the count of streamId, and streamVersionIds that match between
          -- 'maxDbStreamVersion' (DB current state) and 'tmp_stream_version_pairs' (User entered state)
              SELECT COUNT(*)
              FROM tmp_stream_version_pairs svp
                       LEFT JOIN max_db_stream_versions mv ON svp.stream_id = mv.StreamId
                   -- Coalesce mv.streamVersionId -> svp.StreamVersionId, This handles the first version for a new stream
                   -- If the versionId is NULL in both the DB and SVP, we coalesce to the string 'undefined' to make sure they match as null != null in sql 
              WHERE COALESCE(svp.stream_version_id,'undefined') = COALESCE(mv.StreamVersionId, svp.stream_version_id,'undefined')
                    -- Only return something if the user entered count matches the matched count. (IE All versions match)
              HAVING COUNT(*) = (SELECT COUNT(*) FROM tmp_stream_version_pairs)
          )
    FOR UPDATE
RETURNING SequenceNum, streamId, StreamVersionId, logdate, type, Data;`


const selectMaxStreamVersions = `
SELECT DISTINCT ON (el.StreamId) el.SequenceNum, el.StreamId, el.StreamVersionId
FROM eventlist el
WHERE el.StreamId in (%L)
ORDER BY el.StreamId, el.SequenceNum DESC`

export const createEventListTableQuery = `
CREATE TABLE IF NOT EXISTS eventlist
(
    SequenceNum     bigserial   NOT NULL,
    StreamId        text        NOT NULL,
    StreamVersionId text        NOT NULL,
    Data            jsonb       NOT NULL,
    Type            text        NOT NULL,
    Meta            jsonb       NOT NULL,
    LogDate         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (SequenceNum),
    UNIQUE (StreamId, StreamVersionId)
);

-- create an index on streamId for quick versioning lookups
CREATE INDEX IF NOT EXISTS streamId_idx ON eventlist (StreamId);
`