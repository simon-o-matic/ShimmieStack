import { catchAllErrorHandler, EventHistory, StackType } from '../index'
import ShimmieTestStack from '../shimmieteststack'
import { expect, jest } from '@jest/globals'
import { Meta } from '../event'

type ExampleEventV1 = { payload: string, meta: any, min: number }
type ExampleEventV2 = { data: string, meta: any, min: number }
type SimpleExampleEvent = { data: string}
type ExampleEvent = ExampleEventV2

type RecordModels = {
    EXAMPLE_EVENT: ExampleEvent,
    SIMPLE_EXAMPLE_EVENT: SimpleExampleEvent,
    WHO_AM_I_EVENT: { elvis: string },
}

type SubscribeModels = {
    EXAMPLE_EVENT: ExampleEventV1 | ExampleEventV2,
    SIMPLE_EXAMPLE_EVENT: SimpleExampleEvent,
    WHO_AM_I_EVENT: { elvis: string },
}

const testStack = ShimmieTestStack<RecordModels, SubscribeModels>()

const TestProcessor = (testStack: StackType<RecordModels, SubscribeModels>) => {
    const router = testStack.getRouter()

    router.get('/whoami', async (req, res) => {
        await testStack.recordUncheckedEvent({
                streamId: '1',
                eventName: 'WHO_AM_I_EVENT',
                eventData: { elvis: 'costello' },
                meta: {
                    user: { id: 'johnny-come-lately' }, // this can be any
                    userAgent: 'agent-johnny:GECKO-9.0',
                    date: Date.now(),
                }
            },
        )
        return res.status(200).send({ me: 'shimmie' })
    })

    const throw500 = async () => {
        throw new Error('something went wrong (correctly) have a 500')
    }

    router.get('/throw-500', throw500)
    router.put('/throw-500', throw500)
    router.post('/throw-500', throw500)
    router.delete('/throw-500', throw500)

    router.post('/:sid/golden-girls', async (req, res) => {
        await testStack.recordUncheckedEvent({
            streamId: req.params.sid,
            eventName: req.body.type,
            eventData: req.body.data,
            meta: {
                user: { id: 'johnny-come-lately' }, // this can be any
                userAgent: 'agent-johnny:GECKO-9.0',
                date: Date.now(),
            },
        })
        return res.status(200).send({ me: 'shimmie' })
    })

    router.post('/foo', (req, res) => {
        const data = req.body.foo
        if (data) return res.status(200).send({ foo: data })
        else return res.status(400).send({ error: 'Missing foo parameters' })
    })

    const returnRequestDetails = (req: any, res: any) => {
        return res.status(200).json({ headers: req.headers, body: req.body, queryParams: req.params })
    }
    router.post('/postonly-nobodyrequired', returnRequestDetails)

    router.get('/nobodyrequired', returnRequestDetails)
    router.post('/nobodyrequired', returnRequestDetails)
    router.put('/nobodyrequired', returnRequestDetails)
    router.delete('/nobodyrequired', returnRequestDetails)

    return router
}

testStack.mountTest(TestProcessor(testStack))

testStack.use(catchAllErrorHandler)

beforeEach(() => {
    jest.clearAllMocks()
})

describe('when calling testPost with empty body', () => {
    it('there should be no errors', async () => {

        const requestOptions = {
            path: '/nobodyrequired',
            headers: {"example-header": "value1"},
            queryParams: {"example-param-$%#":'val2'}
        }
        const postResponse = await testStack.testPost(requestOptions)

        expect(postResponse.status).toEqual(200)
        expect(postResponse.body.headers).toEqual(expect.objectContaining({ ...requestOptions.headers }))

        const getResponse = await testStack.testGet(requestOptions)

        expect(getResponse.status).toEqual(200)
        expect(getResponse.body.headers).toEqual(expect.objectContaining({ ...requestOptions.headers }))
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
            const types = history.map((histEl: EventHistory<SubscribeModels>) => {
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
            fail('history wasn\'t build')
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
                headers: { Authorization: authHeaderValue },
            },
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
        const response = await testStack.testGet({ path: '/whoami' })
        expect(response.body.me).toBe('shimmie')
        expect(testStack.recordUncheckedEvent).toBeCalledTimes(1)
    })
})

describe('when calling /whoami', () => {
    it('there should be two events in the database when two are recorded', async () => {
        testStack.subscribe(
            'SIMPLE_EXAMPLE_EVENT',
            (e) => {
            }
        )
        const meta: Meta = {
            user: {},
            replay: false,
            date: 123,
            userAgent: 'test agent',
        }
        await testStack.recordUncheckedEvents([{
            streamId: 'streamid',
            eventName: 'SIMPLE_EXAMPLE_EVENT',
            eventData: { data: 'blah' },
            meta,
        }, {
            streamId: 'streamid',
            eventName: 'SIMPLE_EXAMPLE_EVENT',
            eventData: { data: 'blah2' },
            meta,
        }])

        expect(testStack.getHistory('streamid')?.history.length).toEqual(2)
    })
})

describe('when posting to /foo ', () => {
    it('the request body parameter should be returned', async () => {
        const response = await testStack.testPost({ path: '/foo', body: { foo: 'boo' } })
        expect(response.body.foo).toBe('boo')
    })

    it('without a parameter there should be an error', async () => {
        await testStack.testPost({
            path: '/foo',
            body: { xoo: 'xoo' },
            expectedResponseCode: 400,
        })
    })
})


describe('When an API returns a 500', () => {
    describe('GET', () => {
        it('the response should contain an error object, and not throw if expected response code is 500', async () => {
            const response = await testStack.testGet(
                { path: '/throw-500', expectedResponseCode: 500 },
            )
            expect(response.body).toEqual({ 'error': 'Something went wrong' })
            expect(response.status).toEqual(500)
        })

        it('the response should throw on mismatched http status code', async () => {
            try {
                await testStack.testGet(
                    { path: '/throw-500', expectedResponseCode: 200 },
                )
                expect(fail('Should throw on the call above due to incorrect response code'))
            } catch (e: any) {
                expect(e.body).toEqual({ 'error': 'Something went wrong' })
                expect(e.status).toEqual(500)
            }
        })
    })

    describe('PUT', () => {

        it('the response should contain an error object, and not throw if expected response code is 500', async () => {
            const response = await testStack.testPut(
                { path: '/throw-500', expectedResponseCode: 500 },
            )
            expect(response.body).toEqual({ 'error': 'Something went wrong' })
            expect(response.status).toEqual(500)
        })

        it('the response should throw on mismatched http status code', async () => {
            try {
                await testStack.testPut(
                    { path: '/throw-500', expectedResponseCode: 200 },
                )
                expect(fail('Should throw on the call above due to incorrect response code'))
            } catch (e: any) {
                expect(e.body).toEqual({ 'error': 'Something went wrong' })
                expect(e.status).toEqual(500)
            }
        })
    })

    describe('POST', () => {

        it('the response should contain an error object, and not throw if expected response code is 500', async () => {
            const response = await testStack.testPost(
                { path: '/throw-500', expectedResponseCode: 500 },
            )
            expect(response.body).toEqual({ 'error': 'Something went wrong' })
            expect(response.status).toEqual(500)
        })

        it('the response should throw on mismatched http status code', async () => {
            try {
                await testStack.testPost(
                    { path: '/throw-500', expectedResponseCode: 200 },
                )
                expect(fail('Should throw on the call above due to incorrect response code'))
            } catch (e: any) {
                expect(e.body).toEqual({ 'error': 'Something went wrong' })
                expect(e.status).toEqual(500)
            }
        })
    })

    describe('DELETE', () => {

        it('the response should contain an error object, and not throw if expected response code is 500', async () => {
            const response = await testStack.testDelete(
                { path: '/throw-500', expectedResponseCode: 500 },
            )
            expect(response.body).toEqual({ 'error': 'Something went wrong' })
            expect(response.status).toEqual(500)
        })

        it('the response should throw on mismatched http status code', async () => {
            try {
                await testStack.testDelete(
                    { path: '/throw-500', expectedResponseCode: 200 },
                )
                expect(fail('Should throw on the call above due to incorrect response code'))
            } catch (e: any) {
                expect(e.body).toEqual({ 'error': 'Something went wrong' })
                expect(e.status).toEqual(500)
            }
        })
    })

    describe('depricated syntax', () => {
        describe('GET', () => {
            it('the response should contain an error object, and not throw if expected response code is 500', async () => {
                const response = await testStack.testGet({path: '/throw-500', expectedResponseCode: 500})
                expect(response.body).toEqual({ 'error': 'Something went wrong' })
            })
        })

        describe('PUT', () => {

            it('the response should contain an error object, and not throw if expected response code is 500', async () => {
                const response = await testStack.testPut({path: '/throw-500', expectedResponseCode: 500})
                expect(response.body).toEqual({ 'error': 'Something went wrong' })
            })
        })

        describe('POST', () => {

            it('the response should contain an error object, and not throw if expected response code is 500', async () => {
                const response = await testStack.testPost({path: '/throw-500', expectedResponseCode: 500})
                expect(response.body).toEqual({ 'error': 'Something went wrong' })
            })
        })

        describe('DELETE', () => {

            it('the response should contain an error object, and not throw if expected response code is 500', async () => {
                const response = await testStack.testDelete({path: '/throw-500', expectedResponseCode: 500})
                expect(response.body).toEqual({ 'error': 'Something went wrong' })
            })
        })
    })
})
