import { StackType } from '../index'
import ShimmieTestStack from '../shimmieteststack'
import { expect, jest } from '@jest/globals'

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

    router.post('/:sid/golden-girls', (req, res) => {
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
        const response = await testStack.testPost({ path: '/nobodyrequired' })
    })
})

describe('when calling posts that generate a history', () => {
    it('there should be history', async () => {
        await testStack.testPost({
            path: '/999/golden-girls',
            body: {
                type: 'mary',
                data: { a: 7, b: 6 },
            },
        })
        await testStack.testPost({
            path: '/999/golden-girls',
            body: {
                type: 'alice',
                data: { a: 77, b: 66 },
            },
        })
        await testStack.testPost({
            path: '/34sdfsT3/golden-girls',
            body: {
                type: 'shirley',
                data: { a: 1, b: 22222 },
            },
        })

        expect(testStack.getHistory('999')?.history.length).toBe(2)
        expect(testStack.getHistory('34sdfsT3')?.history.length).toBe(1)
    })
})

describe('when merging histories of multiple source ids', () => {
    it('should combine all history of given ids', async () => {
        await testStack.testPost({
            path: '/111/golden-girls',
            body: {
                type: 'abigail',
                data: { a: 1 },
            },
        })
        await testStack.testPost({
            path: '/222/golden-girls',
            body: {
                type: 'barb',
                data: { a: 2 },
            },
        })
        expect(testStack.getHistory(['111', '222'])?.history).toHaveLength(2)
    })
    it('should return history in the order the events occured', async () => {
        await testStack.testPost({
            path: '/333/golden-girls', body: {
                type: 'cheryl',
                data: { a: 3 },
            },
        })
        await testStack.testPost({
            path: '/555/golden-girls', body: {
                type: 'dolores',
                data: { a: 4 },
            },
        })
        await testStack.testPost({
            path: '/333/golden-girls', body: {
                type: 'eugenie',
                data: { a: 5 },
            },
        })
        await testStack.testPost({
            path: '/333/golden-girls', body: {
                type: 'frances',
                data: { a: 6 },
            },
        })
        await testStack.testPost({
            path: '/444/golden-girls', body: {
                type: 'gertrude',
                data: { a: 7 },
            },
        })

        const history = testStack.getHistory(['333', '444', '555'])?.history
        if (history) {
            const types = history.map((histEl) => {
                return histEl.type
            })
            expect(types).toEqual([
                'cheryl',
                'dolores',
                'eugenie',
                'frances',
                'gertrude',
            ])
        } else {
            fail("history wasn't build")
        }
    })
})

const authHeaderValue = 'Definitely real'

describe('when calling a POST with an auth header', () => {
    it('there should be no errors', async () => {
        const response = await testStack.testPost({
            path: '/nobodyrequired',
            headers: { Authorization: authHeaderValue },
        })
        const requestHeaders = response.body.headers
        expect(requestHeaders['authorization']).toBe(authHeaderValue)
    })
})

describe('when calling a PUT with an auth header', () => {
    it('there should be no errors', async () => {
        const response = await testStack.testPut({
            path: '/nobodyrequired',
            headers: { Authorization: authHeaderValue },
        })
        const requestHeaders = response.body.headers
        expect(requestHeaders['authorization']).toBe(authHeaderValue)
    })
})

describe('when calling a GET with an auth header', () => {
    it('there should be no errors', async () => {
        const response = await testStack.testGet({
            path: '/nobodyrequired',
            headers: { Authorization: authHeaderValue },
        })
        const requestHeaders = response.body.headers
        expect(requestHeaders['authorization']).toBe(authHeaderValue)
    })
})

describe('when calling a DELETE with an auth header', () => {
    it('there should be no errors', async () => {
        const response = await testStack.testPost({
                path: '/nobodyrequired',
                headers: { Authorization: authHeaderValue }
            }
        )
        const requestHeaders = response.body.headers
        expect(requestHeaders['authorization']).toBe(authHeaderValue)
    })
})

describe('when calling non existant end point ', () => {
    it('with GET should be 404', async () => {
        await testStack.testGet({
            path: '/doesnotexist',
            expectedResponseCode: 404,
        })
    })
})

describe('when calling non existant end point ', () => {
    it('with GET should be 404', async () => {
        await testStack.testPost({
            path: '/doesnotexist',
            expectedResponseCode: 404,
        })
    })
})

describe('when calling an end point of the wrong type ', () => {
    it('with GET should be 404', async () => {
        await testStack.testGet({
            path: '/doesnotexist',
            expectedResponseCode: 404,
        })
    })
})

describe('when calling /whoami', () => {
    it('the current user should be returned', async () => {
        const response = await testStack.testGet({path:'/whoami'})
        expect(response.body.me).toBe('shimmie')
        expect(testStack.recordEvent).toBeCalledTimes(1)
    })
})

describe('when posting to /foo ', () => {
    it('the request body parameter should be returned', async () => {
        const response = await testStack.testPost({path:'/foo', body:{ foo: 'boo' }})
        expect(response.body.foo).toBe('boo')
    })

    it('without a parameter there should be an error', async () => {
        await testStack.testPost({
            path:'/foo',
            body:{ xoo: 'boo' },
            expectedResponseCode: 400
        })
    })
})
