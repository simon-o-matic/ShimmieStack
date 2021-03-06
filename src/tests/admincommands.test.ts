//
// Also needs a Test for the postgress version
//
import ShimmieTestStack from '../shimmieteststack'
import AdminProcessor from '../admin_processor'
import MemoryEventBase from '../eventbase-memory'
import { authorizeApi, noAuthorization } from '../authorizers'
//import Eventbase from '../eventbase-memory'

const testStack = ShimmieTestStack()
const memoryEventBase = MemoryEventBase()
testStack.mountTest(
    AdminProcessor(memoryEventBase, authorizeApi(noAuthorization))
)

describe('when calling the internal admin processors on an in-memory event base', () => {
    // Will this always be true???? Its kinda useless.
    it('/time should return the time', async () => {
        const response = await testStack.testGet('/time')
        expect(response.status).toBe(200)
        const timeNow: Date = new Date()

        const returnedDate = new Date(response.body.time)
        expect(returnedDate.getDate()).toEqual(timeNow.getDate())
        expect(returnedDate.getHours()).toEqual(timeNow.getHours())
        expect(returnedDate.getMinutes()).toEqual(timeNow.getMinutes())
        expect(returnedDate.getSeconds() - timeNow.getSeconds() <= 1)
        console.log('test time: ', returnedDate)
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
    type: 'sometype',
}

describe('when deleting an event', () => {
    // Will this always be true???? Its kinda useless.
    it('the event is deleted', async () => {
        memoryEventBase.addEvent(event)

        expect((await memoryEventBase.getAllEventsInOrder()).length).toBe(1)

        const response = await testStack.testDelete('/events/0', {})
        expect(response.status).toBe(200)

        expect((await memoryEventBase.getAllEventsInOrder()).length).toBe(0)
    })
})

describe('when updating an event', () => {
    it('the event is update', async () => {
        memoryEventBase.addEvent(event)

        expect(
            (await memoryEventBase.getAllEventsInOrder())[0].data
        ).toStrictEqual({
            one: 'two',
        })

        const response = await testStack.testPut('/events/0', { two: 'three' })
        expect(response.status).toBe(200)

        expect(
            (await memoryEventBase.getAllEventsInOrder())[0].data
        ).toStrictEqual({
            two: 'three',
        })
    })
})
