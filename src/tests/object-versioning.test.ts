import ShimmieTestStack from '../shimmieteststack'
import { Meta, TypedEvent } from '../event'
import { describe, expect, it } from '@jest/globals'

type RecordModels = {
    EXAMPLE_EVENT: {
        data: string
    },
}

type SubscribeModels = RecordModels

const testStack = ShimmieTestStack<RecordModels, SubscribeModels>()

const meta: Meta = {
    user: 'testguy',
    userAgent: 'blah',
    date: Date.now()
}

describe('Object Versioning', () => {
    it('should generate a unique object version on each recordEvent call', async () => {
        let recordedEvents: TypedEvent<'EXAMPLE_EVENT',RecordModels['EXAMPLE_EVENT']>[] = []
        testStack.subscribe('EXAMPLE_EVENT', (event) => {
            recordedEvents.push(event)
        })

        await testStack.recordEvent({
            streamId: 'exampleStreamId',
            eventName: 'EXAMPLE_EVENT',
            eventData: { data: 'something' },
            streamVersionIds: {'streamId': undefined},
            meta,
        })

        await testStack.recordEvent({
            streamId: 'exampleStreamId',
            eventName: 'EXAMPLE_EVENT',
            eventData: { data: 'something else' },
            streamVersionIds: {'streamId': recordedEvents[0]?.streamVersionId},
            meta,
        })


        expect(recordedEvents.length).toEqual(2)

        // does each event have its own unique versionid?
        const uniqueversionIds = new Set(recordedEvents.map(event => event.streamVersionId))
        expect([...uniqueversionIds].length).toEqual(recordedEvents.length)

    })
})