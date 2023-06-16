import cookieParser from 'cookie-parser'
import express, { Router } from 'express'
import supertest from 'supertest'

import Eventbase from './eventbase-memory'
import PiiBase from './piibase-memory'
import ShimmieStack, { StackType } from './index'
import { authorizeApi, noAuthorization } from './authorizers'
import 'express-async-errors'

/** Some extra convenience functions for ease testing */

// A record<string, any> with the Auth key autocomplete/type defined.
export type TestRequestHeaders = Record<string, any> & {
    Authorization: string,
}

// A base set of inputs for a test request
export interface TestRequestParams {
    path: string,
    headers?: TestRequestHeaders,
    expectedResponseCode?: number
}

// The above test request, but with a body. If T is provided, the body is typed to it.
export type TestRequestWithBodyParams<T = any> = TestRequestParams & {
    body?: T,
}


export interface ShimmieTestStackType<CommandEventModels extends Record<string, any>,
    QueryEventModels extends Record<string, any> >
    extends StackType<CommandEventModels,
        QueryEventModels> {
    mountTest: (router: Router, mountpoint?: string) => void
    testGet: (
        params: TestRequestParams,
    ) => Promise<supertest.Response>
    testPost: (
        params: TestRequestWithBodyParams,
    ) => Promise<supertest.Response>
    testPut: (
        params: TestRequestWithBodyParams,
    ) => Promise<supertest.Response>
    testDelete: (
        params: TestRequestParams,
    ) => Promise<supertest.Response>
    /** Deprecated test GET function. Use testGet() instead**/
    testGetDep: (
        path: string,
        headers?: Record<string, string>
    ) => Promise<supertest.Response>
    /** Deprecated test Post function. Use testPost() instead**/
    testPostDep: (
        path: string,
        body: object,
        headers?: Record<string, string>
    ) => Promise<supertest.Response>
    /** Deprecated test Put function. Use testPut() instead**/
    testPutDep: (
        path: string,
        body: object,
        headers?: Record<string, string>
    ) => Promise<supertest.Response>
    /** Deprecated test DELETE function. Use testDelete() instead**/
    testDeleteDep: (
        path: string,
        headers?: Record<string, string>
    ) => Promise<supertest.Response>
    use: (a: any) => any
}

// allow indexed function lookup by name
type SuperTester = supertest.SuperTest<supertest.Test> & Record<string, any>

export default function ShimmieTestStack<
    CommandEventModels extends Record<string, any>,
    QueryEventModels extends Record<string, any>
    >(
    defaultAuthHeaderValue?: string,
    usePiiBase: boolean = false,
): ShimmieTestStackType<CommandEventModels,
    QueryEventModels> {
    const authHeaderValue = defaultAuthHeaderValue
    const app = express()
    app.use(express.json())
    app.use(cookieParser())

    const prepareRequest =
        (method: string) =>
            (path: string, headers?: Record<string, string>, withAuth = true): supertest.Test => {
                const req: supertest.Test = (supertest(app) as SuperTester)[method](path)

                if (authHeaderValue && withAuth) {
                    req.set('\'Authorization\'', `Bearer ${authHeaderValue}`)
                }

                if (headers) {
                    Object.entries(headers).map((header) =>
                        req.set(header[0], header[1]),
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

    /** the test stack usese the in-memory event store */
    const memoryBase = Eventbase()

    /** the test stack usese the in-memory pii store */
    const piiBase = usePiiBase ? PiiBase() : undefined

    /** our inner actual shimmie stack that we control access to for tests */
    const testStack = ShimmieStack<CommandEventModels,
        QueryEventModels>(
        {
            ServerPort: 9999 /* ignored because the express server is never started */,
            enforceAuthorization: false,
        },
        memoryBase,
        authorizeApi(noAuthorization), // authorize admin apis with no auth for the test
        piiBase,
    )

    // Mount al the test processors at the root for ease of local testing.
    const mountTest = (router: Router, mountpoint: string = '/') => {
        app.use(mountpoint, router)
    }

    /** Get helper that uses supertest to hook into the express route to make the actual call */
    const testGet = async (
        {
            path,
            headers,
            expectedResponseCode,
        }: TestRequestParams
    ): Promise<supertest.Response> => {
        return new Promise<supertest.Response>((resolve, reject) => {
            methods.get(path, headers).expect(expectedResponseCode ?? 200).end((err: any, res: supertest.Response) => {
                resolve(res)
            })
        })
    }

    /** Post helper that uses supertest to hook into the express route to make the actual call */
    const testPost = async (
        {
            path,
            headers,
            expectedResponseCode,
            body,
        }: TestRequestWithBodyParams
    ): Promise<supertest.Response> => {
        return new Promise<supertest.Response>((resolve, reject) => {
            methods.post(path, headers).expect(expectedResponseCode ?? 200).send(body ?? {}).end((err: any, res: supertest.Response) => {
                resolve(res)
            })
        })
    }

    /** Put helper that uses supertest to hook into the express route to make the actual call */
    const testPut = async (
        {
            path,
            headers,
            expectedResponseCode,
            body,
        }: TestRequestWithBodyParams
    ): Promise<supertest.Response> => {
        return new Promise<supertest.Response>((resolve, reject) => {
            methods.put(path, headers).expect(expectedResponseCode ?? 200).send(body ?? {}).end((err: any, res: supertest.Response) => {
                resolve(res)
            })
        })
    }

    /** Delete helper that uses supertest to hook into the express route to make the actual call */
    const testDelete = async (
        {
            path,
            headers,
            expectedResponseCode,
        }: TestRequestParams
    ): Promise<supertest.Response> => {
        return new Promise<supertest.Response>((resolve, reject) => {
            return methods.delete(path, headers).expect(expectedResponseCode ?? 200).end((err: any, res: supertest.Response) => {
                resolve(res)
            })
        })
    }


    /** Deprecated */
    const testGetDep = async (
        path: string,
        headers?: Record<string, string>
    ): Promise<supertest.Response> => {
        return new Promise<supertest.Response>((resolve, reject) => {
            methods.get(path, headers).expect(200).end((err: any, res: supertest.Response) => {
                resolve(res)
            })
        })
    }

    /** Deprecated */
    const testPostDep = async (
        path: string,
        body: object,
        headers?: Record<string, string>
    ): Promise<supertest.Response> => {
        return new Promise<supertest.Response>((resolve, reject) => {
            methods.post(path, headers).expect(200).send(body).end((err: any, res: supertest.Response) => {
                resolve(res)
            })
        })
    }

    /** Deprecated */
    const testPutDep = async (
        path: string,
        body: object,
        headers?: Record<string, string>
    ): Promise<supertest.Response> => {
        return new Promise<supertest.Response>((resolve, reject) => {
            methods.put(path, headers).expect(200).send(body).end((err: any, res: supertest.Response) => {
                resolve(res)
            })
        })
    }

    /** Deprecated */
        // todo wrap in a try/catch
    const testDeleteDep = async (
        path: string,
        headers?: Record<string, string>
    ): Promise<supertest.Response> => {
        return new Promise<supertest.Response>((resolve, reject) => {
            return methods.delete(path, headers).expect(200).end((err: any, res: supertest.Response) => {
                resolve(res)
            })
        })
    }

    // Allow passthrough to the actal function, but also let testers count calls
    // Disable Webstorm inspection for this line as Jest does weird shit with generics
    // noinspection TypeScriptValidateTypes
    jest.spyOn(testStack, 'recordEvent')

    // the actual shimmie stack, plus our extras. User overrides the one in the underlying
    // ShimmieStack
    return {
        ...testStack,
        mountTest,
        testGet,
        testPost,
        testPut,
        testDelete,
        testGetDep,
        testPostDep,
        testPutDep,
        testDeleteDep,
        use: (a: any) => app.use(a),
    }
}
