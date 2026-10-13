import { EventToRecord, ObjectLockedError } from '../event'
import { fetchMatchStreamVersionsQuery, prepareAddEventQuery } from '../queries'
import { withObjectLock } from '../utils'

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

        it('should release the lock if an error is thrown in the block', async () => {
            try {
                await withObjectLock(objectLocks, ['foo'], async () => {
                    expect(objectLocks.has('foo')).toBeTruthy()
                    throw new Error('Something happened oh no!')
                })
            } catch (e: any) {
                expect(e instanceof ObjectLockedError).toBeFalsy()
                expect(e.message).toEqual('Something happened oh no!')
            }

            // should release the lock once outside the wrapper
            expect(objectLocks.has('foo')).toBeFalsy()
        })
    })

    describe('query formatter', () => {
        const event: EventToRecord = {
            streamId: 'abc123',
            streamVersionId: '10',
            meta: {
                date: 11,
                user: 'exampleUser',
                hasPii: false,
                replay: false,
                userAgent: 'exampleAgent',
            },
            data: { Foo: 'Bar' },
            type: 'ExampleEventType',
        }
        const expectedEventValues = [
            'abc123',
            '10',
            '{"Foo":"Bar"}',
            'ExampleEventType',
            '{"date":11,"user":"exampleUser","hasPii":false,"replay":false,"userAgent":"exampleAgent"}',
        ]

        it('should correctly format for unchecked events', () => {
            const { text, values } = prepareAddEventQuery(event)
            expect(text)
                .toEqual(`insert into eventlist (StreamId, StreamVersionId, Data, Type, Meta)
select $1::text, $2::text, $3::jsonb, $4::text, $5::jsonb
RETURNING sequenceNum, streamId, StreamVersionId, logdate, type, Data;`)
            expect(values).toEqual(expectedEventValues)
        })

        it('should correctly format for checked events', () => {
            const { text, values } = prepareAddEventQuery(event, {
                exampleStream1: '1',
                exampleStream2: '2',
            })

            expect(text).toContain(
                'FROM unnest($6::text[], $7::text[]) AS pairs(stream_id, stream_version_id)'
            )
            expect(text).toContain(
                'select $1::text, $2::text, $3::jsonb, $4::text, $5::jsonb'
            )
            expect(text).toContain(
                'HAVING COUNT(*) = (SELECT COUNT(*) FROM stream_version_pairs)'
            )
            expect(text).toContain(
                'RETURNING SequenceNum, streamId, StreamVersionId, logdate, type, Data;'
            )
            expect(values).toEqual([
                ...expectedEventValues,
                ['exampleStream1', 'exampleStream2'],
                ['1', '2'],
            ])
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
