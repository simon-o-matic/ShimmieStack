//
// Also needs a Test for the postgress version
//
import { expect } from '@jest/globals'
import { v4 as uuid } from 'uuid'
import AdminProcessor from '../admin_processor'
import { authorizeApi, noAuthorization } from '../authorizers'
import MemoryEventBase from '../eventbase-memory'
import { Logger } from '../logger'
import ShimmieTestStack from '../shimmieteststack'

const testStack = ShimmieTestStack()
const memoryEventBase = MemoryEventBase()
testStack.mountTest(
    AdminProcessor(memoryEventBase, authorizeApi(noAuthorization))
)

describe('when calling the internal admin processors on an in-memory event base', () => {
    // Will this always be true???? Its kinda useless.
    it('/time should return the time', async () => {
        const response = await testStack.testGet({ path: '/time' })
        expect(response.status).toBe(200)
        const timeNow: Date = new Date()

        const returnedDate = new Date(response.body.time)
        expect(returnedDate.getDate()).toEqual(timeNow.getDate())
        expect(returnedDate.getHours()).toEqual(timeNow.getHours())
        expect(returnedDate.getMinutes()).toEqual(timeNow.getMinutes())
        expect(returnedDate.getSeconds() - timeNow.getSeconds() <= 1)
        Logger.log('test time: ' + returnedDate)
    })

    // Test the others...
})

const meta = {
    userAgent: 'chrome-agent',
    user: 'john',
    date: Date.now(),
}

const event = {
    data: { one: 'two' },
    streamId: '33ee',
    meta,
    streamVersionId: uuid(),
    type: 'sometype',
}

describe('when deleting an event', () => {
    // Will this always be true???? Its kinda useless.
    it('the event is deleted', async () => {
        memoryEventBase.addEvent(event)

        expect((await memoryEventBase.getEventsInOrder()).length).toBe(1)

        await testStack.testDelete({ path: '/events/0' })

        expect((await memoryEventBase.getEventsInOrder()).length).toBe(0)
    })
})

describe('when updating an event', () => {
    it('the event is update', async () => {
        memoryEventBase.addEvent(event)

        expect(
            (await memoryEventBase.getEventsInOrder())[0].data
        ).toStrictEqual({
            one: 'two',
        })

        await testStack.testPut({ path: '/events/0', body: { two: 'three' } })

        expect(
            (await memoryEventBase.getEventsInOrder())[0].data
        ).toStrictEqual({
            two: 'three',
        })
    })
})
