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

    router.post('/foo', (req, res) => {
        const data = req.body.foo
        if (data) return res.status(200).send({ foo: data })
        else return res.status(400).send({ error: 'Missing foo parameters' })
    })

    router.post('/nobodyrequired', (req, res) => {
        res.status(200)
        res.send()
    })

    return router
}

testStack.mountTest(TestProcessor(testStack))

describe('when calling testPost with empty body', () => {
    it('there should be no errors', async () => {
        const response = await testStack.testPost('/nobodyrequired', {})
        expect(response.status).toBe(200)
    })
})

describe('when calling non existant end point ', () => {
    it('with GET should be 404', async () => {
        const response = await testStack.testGet('/doesnotexist')
        expect(response.status).toBe(404)
    })
})

describe('when calling non existant end point ', () => {
    it('with GET should be 404', async () => {
        const response = await testStack.testPost('/doesnotexist', {})
        expect(response.status).toBe(404)
    })
})

describe('when calling an end point of the wrong type ', () => {
    it('with GET should be 404', async () => {
        const response = await testStack.testGet('/nobodyrequired')
        expect(response.status).toBe(404)
    })
})

describe('when calling /whoami', () => {
    it('the current user should be returned', async () => {
        const response = await testStack.testGet('/whoami')
        expect(response.status).toBe(200)
        expect(response.body.me).toBe('shimmie')
        expect(testStack.recordEvent).toBeCalledTimes(1)
    })
})

describe('when posting to /foo ', () => {
    it('the request body parameter should be returned', async () => {
        const response = await testStack.testPost('/foo', { foo: 'boo' })
        expect(response.status).toBe(200)
        expect(response.body.foo).toBe('boo')
    })

    it('without a parameter there should be an error', async () => {
        const response = await testStack.testPost('/foo', { xoo: 'boo' })
        expect(response.status).toBe(400)
    })
})
