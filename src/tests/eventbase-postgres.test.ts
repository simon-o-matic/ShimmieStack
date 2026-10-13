/**
 * Integration tests for the Postgres event base. They need a real database
 * and are skipped unless SHIMMIE_TEST_DATABASE_URL is set, e.g.
 *
 *   SHIMMIE_TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/postgres npx jest eventbase-postgres
 *
 * The database is wiped (eventbase.reset()) so point it at a throwaway one.
 */
import { EventBaseType, EventToRecord, Meta, StreamVersionError } from '../event'
import pg from 'pg'
import EventBase from '../eventbase-postgres'
import {
    dropSchema,
    isolatedConnectionString,
    testDatabaseUrl,
} from './postgres-test-helpers'

const describeWithPostgres = testDatabaseUrl ? describe : describe.skip
const schema = 'shimmie_test_eventbase'

const meta: Meta = {
    user: 'testguy',
    userAgent: 'blah',
    date: Date.now(),
}

const nastyStrings = [
    '$$',
    "'",
    '$tag$',
    'x$$; DROP TABLE eventlist; --',
    "x'; DROP TABLE eventlist; --",
    "$$, $$x$$, $$'{}'$$, $$T$$, $${}$$ RETURNING 1; DROP TABLE eventlist; SELECT $$",
]

const nastyEvent: EventToRecord = {
    streamId: 'stream$$id',
    streamVersionId: "v'1",
    type: 'Type$tag$',
    data: { payload: nastyStrings, nested: { quote: "'", dollars: '$$' } },
    meta: {
        date: 11,
        user: { id: "o'brien", note: '$$' },
        userAgent: nastyStrings.join(' '),
    },
}

describeWithPostgres('Postgres Eventbase', () => {
    let eventBase: EventBaseType
    let connectionString: string

    beforeAll(async () => {
        connectionString = await isolatedConnectionString(schema)
        eventBase = EventBase({
            connectionString,
            // let jest exit without waiting for idle pooled connections
            allowExitOnIdle: true,
        })
        await eventBase.init()
    })

    beforeEach(async () => {
        await eventBase.reset()
    })

    afterAll(async () => {
        await eventBase.shutdown()
        await dropSchema(schema)
    })

    describe.each([
        ['unchecked', undefined],
        ['checked', { 'stream$$id': undefined, 'other$$stream': undefined }],
    ])('%s write of hostile data', (_name, streamVersionIds) => {
        it('round-trips the event unchanged and injects nothing', async () => {
            const stored = await eventBase.addEvent(nastyEvent, streamVersionIds)
            expect(stored.sequencenum).toBeGreaterThan(0)

            const events = await eventBase.getEventsInOrder()
            expect(events).toHaveLength(1)
            // column names come back lower-cased from postgres
            const row: any = events[0]
            expect(row.streamid).toBe(nastyEvent.streamId)
            expect(row.streamversionid).toBe(nastyEvent.streamVersionId)
            expect(row.type).toBe(nastyEvent.type)
            expect(row.data).toEqual(nastyEvent.data)
            expect(row.meta).toEqual(nastyEvent.meta)

            // the table survived, and there is still exactly one row in it
            expect(await eventBase.getLatestSequenceNumber()).toBe(
                stored.sequencenum
            )
        })
    })

    describe('checked write', () => {
        it('still signals a version mismatch with an empty result', async () => {
            await eventBase.addEvent({
                ...nastyEvent,
                streamId: 'S1',
                streamVersionId: 'V1',
                meta,
            })
            await expect(
                eventBase.addEvent(
                    { ...nastyEvent, streamId: 'S1', streamVersionId: 'V2', meta },
                    { S1: 'V0' }
                )
            ).rejects.toBeInstanceOf(StreamVersionError)
            expect(await eventBase.getEventsInOrder()).toHaveLength(1)
        })

        it('succeeds when every expected version matches', async () => {
            await eventBase.addEvent({
                ...nastyEvent,
                streamId: 'S1',
                streamVersionId: 'V1',
                meta,
            })
            await eventBase.addEvent(
                { ...nastyEvent, streamId: 'S1', streamVersionId: 'V2', meta },
                { S1: 'V1', S2: undefined }
            )
            expect(await eventBase.getEventsInOrder()).toHaveLength(2)
        })
    })
})
