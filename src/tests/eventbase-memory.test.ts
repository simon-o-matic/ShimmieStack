import { Meta, StreamVersionError } from '../event'
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
})
