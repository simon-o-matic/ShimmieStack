//
// Also needs a Test for the postgress version
//
import ShimmieTestStack from '../shimmieteststack'
import AdminProcessor from '../admin_processor'
import MemoryEventBase from '../eventbase-memory'
import { authorizeApi, noAuthorization } from '../authorizers'

const testStack = ShimmieTestStack()

testStack.mountTest(AdminProcessor(MemoryEventBase(), authorizeApi(noAuthorization)))

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
        expect((returnedDate.getSeconds() - timeNow.getSeconds()) <= 1 )
        console.log('test time: ', returnedDate)
    })

    // Test reset and getAll
})
