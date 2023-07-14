import { withObjectLock } from '../utils'
import { EventToRecord, ObjectLockedError } from '../event'
import { fetchMatchStreamVersionsQuery, prepareAddEventQuery } from '../queries'

describe('Utils', () => {
    describe('withObjectLock', () => {
        let objectLocks = new Set<string>()
        beforeEach(async () => {
            objectLocks.clear()
            objectLocks.add('bar')
        })
        it('Should throw when any stream is locked', async () => {
            try {
                await withObjectLock(objectLocks, ['foo', 'bar'], async () => {
                    expect(fail('Should fail attempting to get a lock'))
                })
            } catch (e) {
                expect(e instanceof ObjectLockedError).toBeTruthy()
            }
        })

        it('should succeed when object is not locked', async () => {
            await withObjectLock(objectLocks, ['foo'], async () => {
                expect(objectLocks.has('foo')).toBeTruthy()
                expect(objectLocks.has('bar')).toBeTruthy()
            })
            // should release the lock once outside the wrapper
            expect(objectLocks.has('foo')).toBeFalsy()
        })

        it(
            'should release the lock if an error is thrown in the block',
            async () => {
                try {
                    await withObjectLock(
                        objectLocks,
                        ['foo'],
                        async () => {
                            expect(objectLocks.has('foo')).toBeTruthy()
                            throw new Error('Something happened oh no!')
                        },
                    )
                } catch (e: any) {
                    expect(e instanceof ObjectLockedError).toBeFalsy()
                    expect(e.message).toEqual('Something happened oh no!')
                }

                // should release the lock once outside the wrapper
                expect(objectLocks.has('foo')).toBeFalsy()
            })
    })

    describe('query formatter', () => {
        it('should correctly format for unchecked events', () => {

            const event: EventToRecord = {
                'streamId': 'abc123',
                'streamVersionId': '10',
                'meta': {
                    'date': 11,
                    'user': 'exampleUser',
                    'hasPii': false,
                    'replay': false,
                    'userAgent': 'exampleAgent',
                },
                'data': { 'Foo': 'Bar' },
                'type': 'ExampleEventType',
            }

            const sql = prepareAddEventQuery(event)
            expect(sql).toEqual(`insert into eventlist (StreamId, StreamVersionId, Data, Type, Meta)
select 'abc123', '10', '{"Foo":"Bar"}', 'ExampleEventType', '{"date":11,"user":"exampleUser","hasPii":false,"replay":false,"userAgent":"exampleAgent"}'
RETURNING sequenceNum, streamId, StreamVersionId, logdate, type;`)
        })

        it('should correctly format for checked events', () => {

            const event: EventToRecord = {
                'streamId': 'abc123',
                'streamVersionId': '10',
                'meta': {
                    'date': 11,
                    'user': 'exampleUser',
                    'hasPii': false,
                    'replay': false,
                    'userAgent': 'exampleAgent',
                },
                'data': { 'Foo': 'Bar' },
                'type': 'ExampleEventType',
            }

            const sql = prepareAddEventQuery(event, {
                exampleStream1: '1',
                exampleStream2: '2',
            })

            expect(sql).toEqual(`
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
VALUES ('exampleStream1', '1'), ('exampleStream2', '2');

with max_db_stream_versions as (
    SELECT DISTINCT ON (el.StreamId) el.SequenceNum, el.StreamId, el.StreamVersionId
    FROM eventlist el
             JOIN tmp_stream_version_pairs s on el.StreamId = s.stream_id
    ORDER BY el.StreamId, el.SequenceNum DESC
)
-- Insert the new event
insert
into eventlist (StreamId, StreamVersionId, Data, Type, Meta)
select 'abc123', '10', '{"Foo":"Bar"}', 'ExampleEventType', '{"date":11,"user":"exampleUser","hasPii":false,"replay":false,"userAgent":"exampleAgent"}'
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
RETURNING SequenceNum, streamId, StreamVersionId, logdate, type;`)
        })
    })

    it('should correctly format query to select max version for provided streams', () => {
        const sql = fetchMatchStreamVersionsQuery(['abc123', '321bca'])
        expect(sql).toEqual(`
SELECT DISTINCT ON (el.StreamId) el.SequenceNum, el.StreamId, el.StreamVersionId
FROM eventlist el
WHERE el.StreamId in ('abc123','321bca')
ORDER BY el.StreamId, el.SequenceNum DESC`)
    })
})