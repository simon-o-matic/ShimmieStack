import ShimmieTestStack from '../shimmieteststack'
import { Meta, TypedEvent } from '../event'
import { describe, expect, it } from '@jest/globals'

type CommandEventModels = {
    EXAMPLE_EVENT: {
        data: string
    },
}

type QueryEventModels = CommandEventModels

const testStack = ShimmieTestStack<CommandEventModels, QueryEventModels>()

const meta: Meta = {
    user: 'testguy',
    userAgent: 'blah',
    date: Date.now()
}

describe('Object Versioning', () => {
    it('should generate a unique object version on each recordEvent call', async () => {
        let recordedEvents: TypedEvent<'EXAMPLE_EVENT',CommandEventModels['EXAMPLE_EVENT']>[] = []
        testStack.subscribe('EXAMPLE_EVENT', (event) => {
            recordedEvents.push(event)
        })

        await testStack.recordEvent({
            streamId: 'exampleStreamId',
            eventName: 'EXAMPLE_EVENT',
            eventData: { data: 'something' },
            meta,
        })

        await testStack.recordEvent({
            streamId: 'exampleStreamId',
            eventName: 'EXAMPLE_EVENT',
            eventData: { data: 'something else' },
            meta,
        })


        expect(recordedEvents.length).toEqual(2)

        // does each event have its own unique versionid?
        const uniqueversionIds = new Set(recordedEvents.map(event => event.streamVersionId))
        expect([...uniqueversionIds].length).toEqual(recordedEvents.length)

    })
})