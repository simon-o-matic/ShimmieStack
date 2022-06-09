import { StackType } from '../index'
import ShimmieTestStack from '../shimmieteststack'

const testStack = ShimmieTestStack()

const TestProcessor = (testStack: StackType) => {
    const router = testStack.getRouter()

    router.get('/whoami', (req, res) => {
        testStack.recordEvent('1', 'whoevent', { elvis: 'costello' }, {
            user: { id: 'johnny-come-lately' }, // this can be any
            userAgent: 'agent-johnny:GECKO-9.0',
        } as any)
        res.status(200).send({ me: 'shimmie' })
    })

    router.post('/:sid/stout', (req, res) => {
        testStack.recordEvent(req.params.sid, req.body.type, req.body.data, {
            user: { id: 'johnny-come-lately' }, // this can be any
            userAgent: 'agent-johnny:GECKO-9.0',
        } as any)
        res.status(200).send({ me: 'shimmie' })
    })

    router.post('/foo', (req, res) => {
        const data = req.body.foo
        if (data) return res.status(200).send({ foo: data })
        else return res.status(400).send({ error: 'Missing foo parameters' })
    })

    const returnHeaders = (req: any, res: any) => {
        res.status(200).json({ headers: req.headers, body: req.body })
    }
    router.post('/postonly-nobodyrequired', returnHeaders)

    router.get('/nobodyrequired', returnHeaders)
    router.post('/nobodyrequired', returnHeaders)
    router.put('/nobodyrequired', returnHeaders)
    router.delete('/nobodyrequired', returnHeaders)

    return router
}

testStack.mountTest(TestProcessor(testStack))

beforeEach(() => {
    jest.clearAllMocks()
})

describe('when calling testPost with empty body', () => {
    it('there should be no errors', async () => {
        const response = await testStack.testPost('/nobodyrequired', {})
        expect(response.status).toBe(200)
    })
})

describe('when calling posts that generate a history', () => {
    it('there should be history', async () => {
        const response = await testStack.testPost('/999/stout', {
            type: 'mary',
            data: { a: 7, b: 6 },
        })
        await testStack.testPost('/999/stout', {
            type: 'alice',
            data: { a: 77, b: 66 },
        })

        await testStack.testPost('/34sdfsT3/stout', {
            type: 'shirley',
            data: { a: 1, b: 22222 },
        })

        expect(testStack.getHistory('999')?.history.length).toBe(2)
        expect(testStack.getHistory('34sdfsT3')?.history.length).toBe(1)
    })
})

const authHeaderValue = 'Definitely real'

describe('when calling a POST with an auth header', () => {
    it('there should be no errors', async () => {
        const response = await testStack.testPost(
            '/nobodyrequired',
            {},
            { Authorization: authHeaderValue }
        )
        expect(response.status).toBe(200)
        const requestHeaders = response.body.headers
        expect(requestHeaders['authorization']).toBe(authHeaderValue)
    })
})

describe('when calling a PUT with an auth header', () => {
    it('there should be no errors', async () => {
        const response = await testStack.testPost(
            '/nobodyrequired',
            {},
            { Authorization: authHeaderValue }
        )
        expect(response.status).toBe(200)
        const requestHeaders = response.body.headers
        expect(requestHeaders['authorization']).toBe(authHeaderValue)
    })
})

describe('when calling a GET with an auth header', () => {
    it('there should be no errors', async () => {
        const response = await testStack.testPost(
            '/nobodyrequired',
            {},
            { Authorization: authHeaderValue }
        )
        expect(response.status).toBe(200)
        const requestHeaders = response.body.headers
        expect(requestHeaders['authorization']).toBe(authHeaderValue)
    })
})

describe('when calling a DELETE with an auth header', () => {
    it('there should be no errors', async () => {
        const response = await testStack.testPost(
            '/nobodyrequired',
            {},
            { Authorization: authHeaderValue }
        )
        expect(response.status).toBe(200)
        const requestHeaders = response.body.headers
        expect(requestHeaders['authorization']).toBe(authHeaderValue)
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
        const response = await testStack.testGet('/postonly-nobodyrequired')
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
