import cookieParser from 'cookie-parser'
import express, { Router } from 'express'
import http from 'http'
import { AddressInfo } from 'net'
import supertest from 'supertest'

import { authorizeApi, noAuthorization } from './authorizers'
import { EventBaseType } from './event'
import Eventbase from './eventbase-memory'
import ShimmieStack, { StackType } from './index'
import PiiBase from './piibase-memory'

/** Some extra convenience functions for ease testing */

// A record<string, any> with the Auth key autocomplete/type defined.
export type TestRequestHeaders = Record<string, any> & {
    Authorization?: string
}

// A base set of inputs for a test request
export interface TestRequestParams {
    path: string
    headers?: TestRequestHeaders
    expectedResponseCode?: number
}

// The above test request, but with a body. If T is provided, the body is typed to it.
export type TestRequestWithBodyParams<T = any> = TestRequestParams & {
    body?: T
}

export interface ShimmieTestStackType<
    RecordModels extends Record<string, any>,
    SubscribeModels extends Record<string, any>,
> extends StackType<RecordModels, SubscribeModels> {
    mountTest: (router: Router, mountpoint?: string) => void
    testGet: (params: TestRequestParams) => Promise<supertest.Response>
    testPost: (params: TestRequestWithBodyParams) => Promise<supertest.Response>
    testPut: (params: TestRequestWithBodyParams) => Promise<supertest.Response>
    testDelete: (params: TestRequestParams) => Promise<supertest.Response>
    use: (a: any) => any
    /** The address the test stack's HTTP server is bound to (always
     *  127.0.0.1 and an ephemeral port). Resolves once the server is
     *  listening. */
    serverAddress: () => Promise<AddressInfo>
    /** Close the test stack's HTTP server. Optional: the server never keeps
     *  the process alive on its own, so jest exits either way. */
    shutdown: () => Promise<void>
}

// allow indexed function lookup by name
type SuperTester = supertest.SuperTest<supertest.Test> & Record<string, any>

export default function ShimmieTestStack<
    RecordModels extends Record<string, any>,
    SubscribeModels extends Record<string, any>,
>(
    defaultAuthHeaderValue?: string,
    usePiiBase: boolean = false,
    eventBase?: EventBaseType
): ShimmieTestStackType<RecordModels, SubscribeModels> {
    const authHeaderValue = defaultAuthHeaderValue
    const app = express()
    app.use(express.json())
    app.use(cookieParser())

    // One server for the whole test stack, bound explicitly to the loopback
    // address. Handing supertest a bare express app makes it call
    // app.listen(0) per request: a wildcard bind that macOS will happily
    // satisfy with a port another process already holds on 127.0.0.1, so the
    // request lands on that process instead (or never answers, and the
    // per-request server is never closed, so jest cannot exit). supertest
    // leaves a server that is already listening alone.
    //
    // The server and its sockets are unref'd so an idle stack never keeps the
    // process alive: consumers create the stack at module scope and most
    // never call shutdown. An in-flight request is kept alive by the client
    // side, so unref'ing the server side loses nothing.
    const server = http.createServer(app)
    server.unref()
    server.on('connection', (socket) => socket.unref())
    const listening = new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject)
            resolve()
        })
    })
    // listen(0, host) resolves the host asynchronously, so address() is null
    // until then and supertest would start its own wildcard server. Every
    // request waits for this first.
    let shutDown = false
    const serverReady = async (): Promise<http.Server> => {
        if (shutDown) {
            // after close() address() is null again and supertest would
            // start its own wildcard server; refuse instead
            throw new Error('ShimmieTestStack has been shut down')
        }
        await listening
        return server
    }

    const prepareRequest =
        (method: 'post' | 'get' | 'put' | 'delete') =>
        ({
            path,
            headers,
            withAuth = true,
            queryParams,
        }: {
            path: string
            headers?: Record<string, string>
            withAuth?: boolean
            queryParams?: Record<string, any>
        }): supertest.Test => {
            const req: supertest.Test = supertest(server)[method](path)

            if (authHeaderValue && withAuth) {
                req.set("'Authorization'", `Bearer ${authHeaderValue}`)
            }

            if (queryParams) {
                if (['GET', 'HEAD'].includes(method)) {
                    req.query(queryParams)
                } else {
                    console.warn(
                        'Super test only allows query params on GET and HEAD requests'
                    )
                }
            }

            if (headers) {
                Object.entries(headers).map((header) =>
                    req.set(header[0], header[1])
                )
            }

            return req
        }

    const methods = {
        post: prepareRequest('post'),
        get: prepareRequest('get'),
        put: prepareRequest('put'),
        delete: prepareRequest('delete'),
    }

    /** the test stack uses either a provided event base or an in-memory event base */
    const memoryBase = eventBase ?? Eventbase()

    /** the test stack usese the in-memory pii store */
    const piiBase = usePiiBase ? PiiBase() : undefined

    /** our inner actual shimmie stack that we control access to for tests */
    const testStack = ShimmieStack<RecordModels, SubscribeModels>(
        {
            ServerPort: 9999 /* ignored because the express server is never started */,
            enforceAuthorization: false,
        },
        memoryBase,
        authorizeApi(noAuthorization), // authorize admin apis with no auth for the test
        piiBase
    )

    // Mount al the test processors at the root for ease of local testing.
    const mountTest = (router: Router, mountpoint: string = '/') => {
        app.use(mountpoint, router)
    }

    /** Get helper that uses supertest to hook into the express route to make the actual call */
    const testGet = async ({
        path,
        headers,
        expectedResponseCode,
    }: TestRequestParams): Promise<supertest.Response> => {
        await serverReady()
        return new Promise<supertest.Response>((resolve, reject) => {
            methods
                .get({ path, headers })
                .expect(expectedResponseCode ?? 200)
                .end((err: any, res: supertest.Response) =>
                    err ? reject(res) : resolve(res)
                )
        })
    }

    /** Post helper that uses supertest to hook into the express route to make the actual call */
    const testPost = async ({
        path,
        headers,
        expectedResponseCode,
        body,
    }: TestRequestWithBodyParams): Promise<supertest.Response> => {
        await serverReady()
        return new Promise<supertest.Response>((resolve, reject) => {
            methods
                .post({ path, headers })
                .expect(expectedResponseCode ?? 200)
                .send(body ?? {})
                .end((err: any, res: supertest.Response) =>
                    err ? reject(res) : resolve(res)
                )
        })
    }

    /** Put helper that uses supertest to hook into the express route to make the actual call */
    const testPut = async ({
        path,
        headers,
        expectedResponseCode,
        body,
    }: TestRequestWithBodyParams): Promise<supertest.Response> => {
        await serverReady()
        return new Promise<supertest.Response>((resolve, reject) => {
            methods
                .put({ path, headers })
                .expect(expectedResponseCode ?? 200)
                .send(body ?? {})
                .end((err: any, res: supertest.Response) =>
                    err ? reject(res) : resolve(res)
                )
        })
    }

    /** Delete helper that uses supertest to hook into the express route to make the actual call */
    const testDelete = async ({
        path,
        headers,
        expectedResponseCode,
    }: TestRequestParams): Promise<supertest.Response> => {
        await serverReady()
        return new Promise<supertest.Response>((resolve, reject) => {
            return methods
                .delete({ path, headers })
                .expect(expectedResponseCode ?? 200)
                .end((err: any, res: supertest.Response) =>
                    err ? reject(res) : resolve(res)
                )
        })
    }

    // Allow passthrough to the actal function, but also let testers count calls
    // Disable Webstorm inspection for this line as it doesnt recognise the 2 input version of spyon
    // noinspection TypeScriptValidateTypes
    jest.spyOn(testStack, 'recordEvent')
    // noinspection TypeScriptValidateTypes
    jest.spyOn(testStack, 'recordEvents')
    // noinspection TypeScriptValidateTypes
    jest.spyOn(testStack, 'recordUncheckedEvent')
    // noinspection TypeScriptValidateTypes
    jest.spyOn(testStack, 'recordUncheckedEvents')

    // the actual shimmie stack, plus our extras. User overrides the one in the underlying
    // ShimmieStack
    return {
        ...testStack,
        mountTest,
        testGet,
        testPost,
        testPut,
        testDelete,
        use: (a: any) => app.use(a),
        restart: async () => {
            testStack.restart()
            jest.clearAllMocks()
            jest.clearAllTimers()
        },
        serverAddress: async () => {
            await listening
            return server.address() as AddressInfo
        },
        shutdown: async () => {
            shutDown = true
            // wait for a still-pending bind, or close() would run before the
            // handle exists and the bind would then reopen the server
            await listening.catch(() => undefined)
            // Drop idle keep-alive sockets too, otherwise close() waits for
            // them to time out.
            server.closeAllConnections()
            await new Promise<void>((resolve) =>
                server.close(() => resolve())
            )
            testStack.shutdown()
        },
    }
}
