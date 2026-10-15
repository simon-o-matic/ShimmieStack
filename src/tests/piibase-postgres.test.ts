/**
 * Unit tests for the Postgres PII base with the pg Pool mocked out, so they
 * run without a database. The point of interest is which SQL (if any) a given
 * getPiiLookup call issues.
 */
import { Meta } from '../event'
import EventBase from '../eventbase-memory'
import EventStore from '../eventstore'
import PiiBase from '../piibase-postgres'

const mockQuery = jest.fn<Promise<{ rows: any[] }>, [string, ...any[]]>()

jest.mock('pg', () => ({
    __esModule: true,
    default: {
        Pool: jest.fn().mockImplementation(() => ({
            // resolved lazily so the hoisted factory never touches mockQuery
            query: (...args: [string, ...any[]]) => mockQuery(...args),
        })),
        types: { setTypeParser: jest.fn() },
    },
}))

describe('PiiBase (postgres) getPiiLookup', () => {
    const piiBase = PiiBase({ connectionString: 'postgres://mocked' })

    beforeEach(() => {
        mockQuery.mockReset()
        mockQuery.mockResolvedValue({ rows: [] })
    })

    it('returns an empty lookup and issues no query for an empty key list', async () => {
        const lookup = await piiBase.getPiiLookup({ keys: [] })

        expect(lookup).toEqual({})
        expect(mockQuery).not.toHaveBeenCalled()
    })

    it('filters by the given keys and builds the lookup from the rows', async () => {
        mockQuery.mockResolvedValue({
            rows: [
                { key: '7', data: { email: 'a@example.com' } },
                { key: '9', data: { email: 'b@example.com' } },
            ],
        })

        const lookup = await piiBase.getPiiLookup({ keys: ['7', '9'] })

        expect(mockQuery).toHaveBeenCalledTimes(1)
        const sql = mockQuery.mock.calls[0][0]
        expect(sql).toMatch(/WHERE Key in \('7',\s*'9'\)/)
        expect(lookup).toEqual({
            '7': { email: 'a@example.com' },
            '9': { email: 'b@example.com' },
        })
    })

    it('still reads the whole store when no filter is given (replay path)', async () => {
        await piiBase.getPiiLookup()

        expect(mockQuery).toHaveBeenCalledTimes(1)
        expect(mockQuery.mock.calls[0][0]).toBe('SELECT Key, Data FROM pii_store')
    })

    it('filters by minSequenceNumber when given', async () => {
        await piiBase.getPiiLookup({ minSequenceNumber: 42 })

        expect(mockQuery).toHaveBeenCalledTimes(1)
        expect(mockQuery.mock.calls[0][0]).toMatch(/Key::integer >= 42/)
    })
})

describe('EventStore reading PII through the postgres PII base', () => {
    // A tiny fake pii_store behind the mocked pool: INSERTs are remembered and
    // SELECTs return what was inserted, so the lookup has the real row shape
    // ({ key, data }) the eventstore must cope with.
    const rows = new Map<string, any>()
    const piiBase = PiiBase({ connectionString: 'postgres://mocked' })
    const eventBase = EventBase()
    const eventStore = EventStore<{ SIGNED_UP: { email: string; plan: string } }, any>({
        eventbase: eventBase,
        piiBase,
        options: { initialised: true },
    })
    const meta: Meta = {
        user: { id: 'tester' },
        replay: false,
        date: 1_700_000_000_000,
        userAgent: 'test agent',
    }

    beforeAll(async () => {
        await eventBase.init()
        eventStore.subscribe('SIGNED_UP', () => {})
    })

    beforeEach(async () => {
        rows.clear()
        await eventBase.reset()
        mockQuery.mockReset()
        mockQuery.mockImplementation(async (sql: string, values?: any[]) => {
            if (sql.startsWith('INSERT into pii_store')) {
                const [key, json] = values as string[]
                const data = JSON.parse(json)
                rows.set(key, data)
                return { rows: [{ key, data }] }
            }
            if (sql.startsWith('SELECT Key, Data FROM pii_store')) {
                return {
                    rows: [...rows].map(([key, data]) => ({ key, data })),
                }
            }
            throw new Error(`unexpected sql in test: ${sql}`)
        })
    })

    it('getEvents({ withPii: true }) merges the PII rows into the events', async () => {
        await eventStore.recordEvent({
            streamId: 'u1',
            eventName: 'SIGNED_UP',
            eventData: { email: 'pii@example.com', plan: 'gold' },
            streamVersionIds: 'STREAM_VERSIONING_DISABLED',
            meta,
            piiFields: ['email'],
        })

        const [withoutPii] = await eventStore.getEvents({ withPii: false })
        expect(withoutPii.data).toEqual({ plan: 'gold' })

        const [withPii] = await eventStore.getEvents({ withPii: true })
        expect(withPii.data).toEqual({ email: 'pii@example.com', plan: 'gold' })
    })

    it('getStreamHistory merges the PII rows into the history entries', async () => {
        await eventStore.recordEvent({
            streamId: 'u1',
            eventName: 'SIGNED_UP',
            eventData: { email: 'pii@example.com', plan: 'gold' },
            streamVersionIds: 'STREAM_VERSIONING_DISABLED',
            meta,
            piiFields: ['email'],
        })

        const history = await eventStore.getStreamHistory(['u1'])
        expect(history[0].data).toEqual({ email: 'pii@example.com', plan: 'gold' })
    })
})
