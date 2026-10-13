import { Meta, ObjectLockedError, StreamVersionError } from '../event'
import EventBase from '../eventbase-memory'

const eventBase = EventBase()

const meta: Meta = {
    user: 'testguy',
    userAgent: 'blah',
    date: Date.now(),
}

describe('Eventbase', () => {
    beforeEach(async () => {
        await eventBase.reset()
        await eventBase.addEvent({
            streamId: 'EXAMPLE_STREAM_1',
            data: { foo: 'bar' },
            type: 'EXAMPLE_EVENT_TYPE',
            streamVersionId: 'V1',
            meta,
        })
        await eventBase.addEvent({
            streamId: 'EXAMPLE_STREAM_1',
            data: { foo: 'bar too' },
            type: 'EXAMPLE_EVENT_TYPE',
            streamVersionId: 'V2',
            meta,
        })

        await eventBase.addEvent({
            streamId: 'EXAMPLE_STREAM_2',
            data: { foo: 'bar' },
            type: 'EXAMPLE_EVENT_TYPE',
            streamVersionId: 'V1',
            meta,
        })
        await eventBase.addEvent({
            streamId: 'EXAMPLE_STREAM_2',
            data: { foo: 'bar' },
            type: 'EXAMPLE_EVENT_TYPE',
            streamVersionId: 'V2',
            meta,
        })
    })
    // Will this always be true???? Its kinda useless.
    describe('When adding an event', () => {
        it('should succeed if a valid object is provided, without a version id', async () => {
            await eventBase.addEvent({
                streamId: 'EXAMPLE_STREAM_1',
                data: { foo: 'bar' },
                type: 'EXAMPLE_EVENT_TYPE',
                streamVersionId: 'V1',
                meta,
            })
        })

        it('should succeed if provided the most up to date versionId as an input', async () => {
            const streamId = 'EXAMPLE_STREAM_1'
            const expectedVersion = 'V2'
            await eventBase.addEvent(
                {
                    streamId,
                    data: { foo: 'bar' },
                    type: 'EXAMPLE_EVENT_TYPE',
                    streamVersionId: 'V3',
                    meta,
                },
                {
                    [streamId]: expectedVersion,
                }
            )
        })

        it('should fail if provided any out of date versionId as an input', async () => {
            // trying to write events based on outdated info. Should fail.
            const streamId = 'EXAMPLE_STREAM_1'
            const expectedVersionStream1 = 'V1'
            const streamId2 = 'EXAMPLE_STREAM_2'
            const expectedVersionStream2 = 'V1'

            try {
                await eventBase.addEvent(
                    {
                        streamId,
                        data: { foo: 'bar' },
                        type: 'EXAMPLE_EVENT_TYPE',
                        streamVersionId: 'V2',
                        meta,
                    },
                    {
                        [streamId]: expectedVersionStream1,
                        [streamId2]: expectedVersionStream2,
                    }
                )
                expect(fail('Should throw before this line'))
            } catch (e: any) {
                expect(e instanceof StreamVersionError)
                expect(e.details).toEqual([
                    {
                        actualVersionId: 'V2',
                        expectedVersionId: 'V1',
                        streamId: 'EXAMPLE_STREAM_1',
                    },
                    {
                        actualVersionId: 'V2',
                        expectedVersionId: 'V1',
                        streamId: 'EXAMPLE_STREAM_2',
                    },
                ])
            }
        })
    })

    describe('getLatestSequenceNumber', () => {
        it('returns -1 on a cold, empty event base instead of throwing', async () => {
            const emptyBase = EventBase()
            expect(await emptyBase.getLatestSequenceNumber()).toBe(-1)
        })

        it('returns -1 after a reset', async () => {
            await eventBase.reset()
            expect(await eventBase.getLatestSequenceNumber()).toBe(-1)
        })

        it('returns the sequence number of the last event', async () => {
            const events = await eventBase.getEventsInOrder()
            expect(await eventBase.getLatestSequenceNumber()).toBe(
                events[events.length - 1].sequencenum
            )
        })
    })

    describe('getEventsInOrder', () => {
        it('returns every event when replaying from 0', async () => {
            const all = await eventBase.getEventsInOrder()
            expect(all).toHaveLength(4)
            const fromZero = await eventBase.getEventsInOrder(0)
            expect(fromZero).toEqual(all)
        })

        it('treats minSequenceNumber as inclusive, like getEventsInOrderStream', async () => {
            const all = await eventBase.getEventsInOrder()
            const min = all[2].sequencenum

            const fromMin = await eventBase.getEventsInOrder(min)
            expect(fromMin.map((e) => e.sequencenum)).toEqual([
                all[2].sequencenum,
                all[3].sequencenum,
            ])

            const streamed = []
            for await (const e of eventBase.getEventsInOrderStream(min)) {
                streamed.push(e)
            }
            expect(streamed).toEqual(fromMin)
        })

        it('returns nothing past the last event', async () => {
            const latest = await eventBase.getLatestSequenceNumber()
            expect(await eventBase.getEventsInOrder(latest + 1)).toEqual([])
        })
    })

    describe('concurrent checked writes', () => {
        it('lets exactly one of two writes against the same version through', async () => {
            const streamId = 'EXAMPLE_STREAM_1'
            const write = (streamVersionId: string) =>
                eventBase.addEvent(
                    { streamId, data: {}, type: 'EXAMPLE_EVENT_TYPE', streamVersionId, meta },
                    { [streamId]: 'V2' }
                )

            // Start the second write at every point in the first write's
            // microtask timeline, so a window between the version check and
            // the append cannot hide anywhere.
            for (let ticks = 0; ticks <= 6; ticks++) {
                await eventBase.reset()
                await eventBase.addEvent({ streamId, data: {}, type: 'EXAMPLE_EVENT_TYPE', streamVersionId: 'V1', meta })
                await eventBase.addEvent({ streamId, data: {}, type: 'EXAMPLE_EVENT_TYPE', streamVersionId: 'V2', meta })

                const first = write('V3a')
                for (let i = 0; i < ticks; i++) {
                    await Promise.resolve()
                }
                const second = write('V3b')

                const results = await Promise.allSettled([first, second])
                const fulfilled = results.filter((r) => r.status === 'fulfilled')
                const rejected = results.filter((r) => r.status === 'rejected')

                expect(fulfilled).toHaveLength(1)
                expect(rejected).toHaveLength(1)
                const reason = (rejected[0] as PromiseRejectedResult).reason
                expect(
                    reason instanceof StreamVersionError ||
                        reason instanceof ObjectLockedError
                ).toBe(true)

                const events = await eventBase.getEventsInOrder()
                expect(events).toHaveLength(3)
                expect(events.map((e) => e.sequencenum)).toEqual([0, 1, 2])
            }
        })

        it('rejects a write against a stale version with StreamVersionError once the first has landed', async () => {
            const streamId = 'EXAMPLE_STREAM_1'
            await eventBase.addEvent(
                { streamId, data: {}, type: 'EXAMPLE_EVENT_TYPE', streamVersionId: 'V3', meta },
                { [streamId]: 'V2' }
            )
            await expect(
                eventBase.addEvent(
                    { streamId, data: {}, type: 'EXAMPLE_EVENT_TYPE', streamVersionId: 'V3b', meta },
                    { [streamId]: 'V2' }
                )
            ).rejects.toBeInstanceOf(StreamVersionError)
        })
    })
})
