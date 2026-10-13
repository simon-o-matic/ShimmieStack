import { EventToRecord } from '../event'
import { prepareAddEventQuery } from '../queries'

// Values an attacker could plausibly get into an event (meta.userAgent comes
// straight from a request header). Each of these terminates a dollar-quoted
// literal or a single-quoted literal if it is interpolated unescaped.
const nastyStrings = [
    '$$',
    "'",
    '$tag$',
    'x$$; DROP TABLE eventlist; --',
    "x'; DROP TABLE eventlist; --",
    "$$, $$x$$, $$'{}'$$, $$T$$, $${}$$ RETURNING 1; DROP TABLE eventlist; SELECT $$",
]

const nastyMeta = {
    date: 11,
    user: { id: "o'brien", note: '$$' },
    userAgent: nastyStrings.join(' '),
}

const nastyEvent: EventToRecord = {
    streamId: 'stream$$id',
    streamVersionId: "v'1",
    type: 'Type$tag$',
    data: { payload: nastyStrings, nested: { quote: "'", dollars: '$$' } },
    meta: nastyMeta,
}

describe('prepareAddEventQuery', () => {
    describe.each([
        ['unchecked', undefined],
        ['checked', { 'other$$stream': "v'0", 'new-stream': undefined }],
    ])('%s write', (_name, streamVersionIds) => {
        it('never interpolates event values into the SQL text', () => {
            const { text, values } = prepareAddEventQuery(
                nastyEvent,
                streamVersionIds
            )

            expect(text).not.toContain('$$')
            // a bare quote is legitimately part of the SQL ('undefined'), so check the payloads
            for (const s of nastyStrings.filter((s) => s.length > 1)) {
                expect(text).not.toContain(s)
            }
            expect(text).not.toContain(nastyEvent.streamId)
            expect(text).not.toContain(nastyEvent.type)
            expect(text).not.toContain('DROP TABLE')
            // it is a single statement
            expect(text.trim().replace(/;$/, '')).not.toContain(';')
            // every value is passed as a positional parameter
            expect(values.length).toBeGreaterThanOrEqual(5)
            for (let i = 1; i <= values.length; i++) {
                expect(text).toContain(`$${i}`)
            }
            expect(text).not.toContain(`$${values.length + 1}`)
        })

        it('passes the event payload through unchanged as parameters', () => {
            const { values } = prepareAddEventQuery(nastyEvent, streamVersionIds)
            const [streamId, streamVersionId, data, type, meta] = values
            expect(streamId).toBe(nastyEvent.streamId)
            expect(streamVersionId).toBe(nastyEvent.streamVersionId)
            expect(type).toBe(nastyEvent.type)
            expect(JSON.parse(data)).toEqual(nastyEvent.data)
            expect(JSON.parse(meta)).toEqual(nastyEvent.meta)
        })
    })

    it('passes the stream/version pairs for a checked write as parallel arrays', () => {
        const { values } = prepareAddEventQuery(nastyEvent, {
            'other$$stream': "v'0",
            'new-stream': undefined,
        })
        expect(values.slice(5)).toEqual([
            ['other$$stream', 'new-stream'],
            ["v'0", null],
        ])
    })
})
