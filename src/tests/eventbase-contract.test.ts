/**
 * The behaviour every event base must share, run against each implementation.
 * The postgres run is skipped unless SHIMMIE_TEST_DATABASE_URL points at a
 * throwaway database (see eventbase-postgres.test.ts).
 *
 * Contract:
 *  - getLatestSequenceNumber() is -1 when the event base is empty
 *  - minSequenceNumber is INCLUSIVE for getEventsInOrder and getEventsInOrderStream
 *    (eventstore replays from lastHandledSequenceNumber + 1, which relies on this)
 *  - both read paths return the same events in the same order
 */
import { EventBaseType, Meta } from '../event'
import MemoryEventBase from '../eventbase-memory'
import PostgresEventBase from '../eventbase-postgres'
import {
    dropSchema,
    isolatedConnectionString,
    testDatabaseUrl,
} from './postgres-test-helpers'

const postgresSchema = 'shimmie_test_contract'

const meta: Meta = {
    user: 'testguy',
    userAgent: 'blah',
    date: Date.now(),
}

const implementations: Array<[string, () => Promise<EventBaseType>]> = [
    ['memory', async () => MemoryEventBase()],
]
if (testDatabaseUrl) {
    implementations.push([
        'postgres',
        async () =>
            PostgresEventBase({
                connectionString: await isolatedConnectionString(postgresSchema),
                allowExitOnIdle: true,
            }),
    ])
}

const collect = async <T>(stream: AsyncGenerator<T>): Promise<T[]> => {
    const out: T[] = []
    for await (const item of stream) {
        out.push(item)
    }
    return out
}

describe.each(implementations)('Eventbase contract (%s)', (name, factory) => {
    let eventBase: EventBaseType

    beforeAll(async () => {
        eventBase = await factory()
        await eventBase.init()
    })

    beforeEach(async () => {
        await eventBase.reset()
    })

    afterAll(async () => {
        await eventBase.shutdown()
        if (name === 'postgres') {
            await dropSchema(postgresSchema)
        }
    })

    const addEvents = async (count: number) => {
        const stored = []
        for (let i = 0; i < count; i++) {
            stored.push(
                await eventBase.addEvent({
                    streamId: 'STREAM',
                    streamVersionId: `V${i}`,
                    type: 'EVENT',
                    data: { i },
                    meta,
                })
            )
        }
        return stored
    }

    it('reports -1 as the latest sequence number when empty', async () => {
        expect(await eventBase.getLatestSequenceNumber()).toBe(-1)
        expect(await eventBase.getEventsInOrder()).toEqual([])
        expect(await collect(eventBase.getEventsInOrderStream())).toEqual([])
        expect(await collect(eventBase.getEventsInOrderStream(0))).toEqual([])
    })

    it('reports the last stored sequence number as the latest', async () => {
        const stored = await addEvents(3)
        expect(await eventBase.getLatestSequenceNumber()).toBe(
            stored[2].sequencenum
        )
    })

    it('returns every event, in order, when reading from 0 or from nothing', async () => {
        const stored = await addEvents(4)
        const expected = stored.map((e) => e.sequencenum)

        const seqs = (events: { sequencenum: number }[]) =>
            events.map((e) => e.sequencenum)

        expect(seqs(await eventBase.getEventsInOrder())).toEqual(expected)
        expect(seqs(await eventBase.getEventsInOrder(0))).toEqual(expected)
        expect(seqs(await collect(eventBase.getEventsInOrderStream()))).toEqual(expected)
        expect(seqs(await collect(eventBase.getEventsInOrderStream(0)))).toEqual(expected)
    })

    it('treats minSequenceNumber as inclusive on both read paths', async () => {
        const stored = await addEvents(4)
        const min = stored[1].sequencenum
        const expected = stored.slice(1).map((e) => e.sequencenum)

        const inOrder = await eventBase.getEventsInOrder(min)
        const streamed = await collect(eventBase.getEventsInOrderStream(min))

        expect(inOrder.map((e) => e.sequencenum)).toEqual(expected)
        expect(streamed).toEqual(inOrder)
    })

    it('replaying from latest + 1 yields nothing', async () => {
        await addEvents(2)
        const next = (await eventBase.getLatestSequenceNumber()) + 1
        expect(await eventBase.getEventsInOrder(next)).toEqual([])
        expect(await collect(eventBase.getEventsInOrderStream(next))).toEqual([])
    })
})
