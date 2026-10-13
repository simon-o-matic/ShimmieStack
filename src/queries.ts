/**
 * A query to safely add an event.
 * It checks the version pairs entered at call time, with the max versions for a stream in the DB
 * It returns the rows that were inserted, if no rows inserted then versions are out of date so the request needs
 * to be retried once this server has more up to date events
 */
import Format from 'pg-format'
import { EventToRecord } from './event'

/** A query and its positional parameters, ready for pg's `query(text, values)` */
export interface PreparedQuery {
    text: string
    values: any[]
}

/**
 * Event data and meta are attacker-influenced (meta.userAgent typically comes
 * straight from a request header) so they are never interpolated into the SQL
 * text; every value travels as a positional parameter.
 */
export const prepareAddEventQuery = (event: EventToRecord, streamVersionIds?: Record<string, string|undefined>): PreparedQuery => {
    const eventValues = [
        event.streamId,
        event.streamVersionId,
        JSON.stringify(event.data),
        event.type,
        JSON.stringify(event.meta),
    ]

    if (!streamVersionIds) {
        return { text: addEventVersionUncheckedQuery, values: eventValues }
    }

    // the streamId/version pairs the caller has decided to act using, as two parallel arrays
    const pairs = Object.entries(streamVersionIds)
    return {
        text: addEventVersionCheckedQuery,
        values: [
            ...eventValues,
            pairs.map(([streamId]) => streamId),
            pairs.map(([, versionId]) => versionId ?? null),
        ],
    }
}

export const fetchMatchStreamVersionsQuery = (streamIds: string[]): string => {
    return Format(selectMaxStreamVersions, streamIds)
}

const addEventVersionUncheckedQuery = `insert into eventlist (StreamId, StreamVersionId, Data, Type, Meta)
select $1::text, $2::text, $3::jsonb, $4::text, $5::jsonb
RETURNING sequenceNum, streamId, StreamVersionId, logdate, type, Data;`


const addEventVersionCheckedQuery = `
-- The streamId, version pairs the caller has decided to act using
with stream_version_pairs as (
    SELECT stream_id, stream_version_id
    FROM unnest($6::text[], $7::text[]) AS pairs(stream_id, stream_version_id)
),
max_db_stream_versions as (
    SELECT DISTINCT ON (el.StreamId) el.SequenceNum, el.StreamId, el.StreamVersionId
    FROM eventlist el
             JOIN stream_version_pairs s on el.StreamId = s.stream_id
    ORDER BY el.StreamId, el.SequenceNum DESC
)
-- Insert the new event
insert
into eventlist (StreamId, StreamVersionId, Data, Type, Meta)
select $1::text, $2::text, $3::jsonb, $4::text, $5::jsonb
-- Only if this subquery returns us a result
where exists(
          -- Select out the count of streamId, and streamVersionIds that match between
          -- 'maxDbStreamVersion' (DB current state) and 'stream_version_pairs' (User entered state)
              SELECT COUNT(*)
              FROM stream_version_pairs svp
                       LEFT JOIN max_db_stream_versions mv ON svp.stream_id = mv.StreamId
                   -- Coalesce mv.streamVersionId -> svp.StreamVersionId, This handles the first version for a new stream
                   -- If the versionId is NULL in both the DB and SVP, we coalesce to the string 'undefined' to make sure they match as null != null in sql 
              WHERE COALESCE(svp.stream_version_id,'undefined') = COALESCE(mv.StreamVersionId, svp.stream_version_id,'undefined')
                    -- Only return something if the user entered count matches the matched count. (IE All versions match)
              HAVING COUNT(*) = (SELECT COUNT(*) FROM stream_version_pairs)
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
