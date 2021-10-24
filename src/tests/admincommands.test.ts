//
// Also needs a Test for the postgress version
//
import ShimmieTestStack from '../shimmieteststack'
import AdminProcessor from '../admin_processor'
import MemoryEventBase from '../eventbase-memory'

const testStack = ShimmieTestStack()

testStack.mountTest(AdminProcessor(MemoryEventBase()))

describe('when calling the internal admin processors on an in-memory event base', () => {
    // Will this always be true???? Its kinda useless.
    it('/time should return the time', async () => {
        const response = await testStack.testGet('/time')
        expect(response.status).toBe(200)
        expect(response.body.time).toEqual(Date())
        console.log('test time: ', response.body.time)
    })

    // Test reset and getAll
})
