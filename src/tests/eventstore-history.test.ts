/**
 * getStreamHistory read-path behaviour:
 *  - no events (no ids, unknown ids, or a type that matches nothing) returns []
 *    and never consults the PII base
 *  - every entry carries the event's sequenceNum so same-date events can be
 *    ordered downstream
 */
import { Meta } from '../event'
import EventBase from '../eventbase-memory'
import EventStore from '../eventstore'
import PiiBase from '../piibase-memory'

type RecordModels = {
    APPLIED: { amount: number }
    REJECTED: { reason: string }
    SIGNED_UP: { email: string; plan: string }
}

const eventBase = EventBase()
const piiBase = PiiBase()
const eventStore = EventStore<RecordModels, any>({
    eventbase: eventBase,
    piiBase,
    options: { initialised: true },
})

const sharedDate = 1_700_000_000_000
const meta: Meta = {
    user: { id: 'tester' },
    replay: false,
    date: sharedDate,
    userAgent: 'test agent',
}

const record = <E extends keyof RecordModels>(
    streamId: string,
    eventName: E,
    eventData: RecordModels[E]
) =>
    eventStore.recordEvent({
        streamId,
        eventName,
        eventData,
        streamVersionIds: 'STREAM_VERSIONING_DISABLED',
        meta,
    })

beforeAll(async () => {
    await eventBase.init()
    await piiBase.init()
    eventStore.subscribe('APPLIED', () => {})
    eventStore.subscribe('REJECTED', () => {})
    eventStore.subscribe('SIGNED_UP', () => {})
})

beforeEach(async () => {
    await eventBase.reset()
    await piiBase.reset()
})

afterAll(async () => {
    await eventBase.shutdown()
    await piiBase.shutdown()
})

describe('getStreamHistory when there are no matching events', () => {
    let piiSpy: jest.SpiedFunction<typeof piiBase.getPiiLookup>

    beforeEach(() => {
        piiSpy = jest.spyOn(piiBase, 'getPiiLookup')
    })

    afterEach(() => {
        piiSpy.mockRestore()
    })

    it('returns [] for an empty id list without touching the PII base', async () => {
        await record('s1', 'APPLIED', { amount: 1 })

        expect(await eventStore.getStreamHistory([])).toEqual([])
        expect(piiSpy).not.toHaveBeenCalled()
    })

    it('returns [] for unknown ids without touching the PII base', async () => {
        await record('s1', 'APPLIED', { amount: 1 })

        expect(await eventStore.getStreamHistory(['nope'])).toEqual([])
        expect(piiSpy).not.toHaveBeenCalled()
    })

    it('returns [] when the type filter matches nothing, without touching the PII base', async () => {
        await record('s1', 'APPLIED', { amount: 1 })

        expect(await eventStore.getStreamHistory(['s1'], 'REJECTED')).toEqual(
            []
        )
        expect(piiSpy).not.toHaveBeenCalled()
    })

    it('asks the PII base only for the sequence numbers of the matched events', async () => {
        await record('s1', 'APPLIED', { amount: 1 })
        await record('s2', 'APPLIED', { amount: 2 })

        const history = await eventStore.getStreamHistory(['s2'])

        expect(history).toHaveLength(1)
        expect(piiSpy).toHaveBeenCalledTimes(1)
        expect(piiSpy).toHaveBeenCalledWith({
            keys: [history[0].sequenceNum.toString()],
        })
    })
})

describe('getStreamHistory entries', () => {
    it('carry the stored sequenceNum alongside the existing fields', async () => {
        await record('s1', 'REJECTED', { reason: 'too slow' })
        await record('s1', 'APPLIED', { amount: 5 })

        const [stored] = await eventStore.getEvents({ withPii: false })
        const history = await eventStore.getStreamHistory(['s1'])

        expect(history).toHaveLength(2)
        expect(history[0]).toEqual({
            streamId: 's1',
            type: 'REJECTED',
            date: sharedDate,
            user: meta.user,
            data: { reason: 'too slow' },
            sequenceNum: stored.sequencenum,
        })
        expect(history[1].sequenceNum).toBeGreaterThan(history[0].sequenceNum)
    })

    it('let same-date events be ordered by (date desc, sequenceNum desc)', async () => {
        // A reject-then-apply pair recorded with one shared timestamp.
        await record('s1', 'REJECTED', { reason: 'first attempt' })
        await record('s1', 'APPLIED', { amount: 9 })

        const history = await eventStore.getStreamHistory(['s1'])
        expect(history.every((h) => h.date === sharedDate)).toBe(true)

        const newestFirst = [...history].sort(
            (a, b) => b.date - a.date || b.sequenceNum - a.sequenceNum
        )
        expect(newestFirst.map((h) => h.type)).toEqual(['APPLIED', 'REJECTED'])
    })
})

describe('getStreamHistory with PII', () => {
    it('merges the PII fields back into the entry data', async () => {
        await eventStore.recordEvent({
            streamId: 'u1',
            eventName: 'SIGNED_UP',
            eventData: { email: 'pii@example.com', plan: 'gold' },
            streamVersionIds: 'STREAM_VERSIONING_DISABLED',
            meta,
            piiFields: ['email'],
        })

        // the event store itself must not hold the pii
        const [stored] = await eventStore.getEvents({ withPii: false })
        expect(stored.data).toEqual({ plan: 'gold' })
        expect(stored.meta.hasPii).toBe(true)

        const history = await eventStore.getStreamHistory(['u1'])
        expect(history).toHaveLength(1)
        expect(history[0].data).toEqual({
            email: 'pii@example.com',
            plan: 'gold',
        })
        expect(history[0].sequenceNum).toBe(stored.sequencenum)
    })

    it('leaves data as stored when the PII record is missing', async () => {
        await eventStore.recordEvent({
            streamId: 'u1',
            eventName: 'SIGNED_UP',
            eventData: { email: 'pii@example.com', plan: 'gold' },
            streamVersionIds: 'STREAM_VERSIONING_DISABLED',
            meta,
            piiFields: ['email'],
        })
        await piiBase.reset()

        const history = await eventStore.getStreamHistory(['u1'])
        expect(history[0].data).toEqual({ plan: 'gold' })
    })
})

describe('replay with PII', () => {
    const replayed = async (
        replay: () => Promise<number>
    ): Promise<Record<string, any>[]> => {
        const seen: Record<string, any>[] = []
        eventStore.subscribe('SIGNED_UP', (event) => {
            if (event.meta.replay) {
                seen.push(event.data)
            }
        })
        await eventStore.recordEvent({
            streamId: 'u1',
            eventName: 'SIGNED_UP',
            eventData: { email: 'pii@example.com', plan: 'gold' },
            streamVersionIds: 'STREAM_VERSIONING_DISABLED',
            meta,
            piiFields: ['email'],
        })
        await replay()
        return seen
    }

    it('replayEvents re-emits events with their PII merged back in', async () => {
        const seen = await replayed(() => eventStore.replayEvents())
        expect(seen).toEqual([{ email: 'pii@example.com', plan: 'gold' }])
    })

    it('replayEventsStreamed re-emits events with their PII merged back in', async () => {
        const seen = await replayed(() => eventStore.replayEventsStreamed())
        expect(seen).toEqual([{ email: 'pii@example.com', plan: 'gold' }])
    })
})
