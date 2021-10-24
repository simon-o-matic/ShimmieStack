import { StackType } from '../index'
import ShimmieTestStack from '../shimmieteststack'

const testStack = ShimmieTestStack()

const whoHandler = jest.fn()

const TestProcessor = (testStack: StackType) => {
    const router = testStack.getRouter()

    testStack.subscribe('whoevent', whoHandler)
    router.get('/whoami', (req, res) => {
        testStack.recordEvent('1', 'whoevent', { elvis: 'costello' }, {} as any)
        res.status(200).send({ me: 'shimmie' })
    })
    return router
}

testStack.mountTest(TestProcessor(testStack))

describe('when calling /whoami', () => {
    it('the current user should be returned', async () => {
        const response = await testStack.testGet('/whoami')
        expect(response.status).toBe(200)
        expect(response.body.me).toBe('shimmie')
        expect(testStack.recordEvent).toBeCalledTimes(1)
    })
})
