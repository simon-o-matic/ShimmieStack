import { jest } from '@jest/globals'
import cookieParser from 'cookie-parser'
import express, { Router } from 'express'
import superrequest, { SuperTest, Test } from 'supertest'

import Eventbase from './eventbase-memory'
import PiiBase from './piiBase-memory'
import ShimmieStack, { StackType } from './index'

/** Some extra convenience functions for ease testing */
interface ShimmieTestStackType extends StackType {
    mountTest: (router: Router, mountpoint?: string) => void
    testGet: (
        path: string,
        headers?: Record<string, string>
    ) => Promise<superrequest.Response>
    testPost: (
        path: string,
        body: object,
        headers?: Record<string, string>
    ) => Promise<superrequest.Response>
    testPut: (
        path: string,
        body: object,
        headers?: Record<string, string>
    ) => Promise<superrequest.Response>
    testDelete: (
        path: string,
        headers?: Record<string, string>
    ) => Promise<superrequest.Response>
    use: (a: any) => any
}

export default function ShimmieTestStack(
    defaultAuthHeaderValue?: string,
    usePiiBase: boolean = false,
): ShimmieTestStackType {
    const authHeaderValue = defaultAuthHeaderValue
    const app = express()
    app.use(express.json())
    app.use(cookieParser())

    const prepareRequest =
        (method: string) =>
        (path: string, headers?: Record<string, string>, withAuth = true) => {
            const req = (superrequest(app) as any)[method](path)

            if (authHeaderValue && withAuth) {
                req.set("'Authorization'", `Bearer ${authHeaderValue}`)
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

    /** the test stack usese the in-memory event store */
    const memoryBase = Eventbase()

    /** the test stack usese the in-memory pii store */
    const piiBase = usePiiBase ? PiiBase() : undefined

    /** our inner actal shimmie stack that we control access to for tests */
    const testStack = ShimmieStack(
        {
            ServerPort: 9999 /* ignored because the express server is never started */,
            enforceAuthorization: false
        },
        memoryBase,
        piiBase
    )

    // Mount al the test processors at the root for ease of local testing.
    const mountTest = (router: Router, mountpoint: string = '/') => {
        app.use(mountpoint, router)
    }

    /** Get helper that uses supertest to hook into the express route to make the actual call */
    const testGet = async (path: string, headers?: Record<string, string>) => {
        return await methods.get(path, headers)
    }

    /** Post helper that uses supertest to hook into the express route to make the actual call */
    const testPost = async (
        path: string,
        body: object,
        headers?: Record<string, string>
    ) => {
        return await methods.post(path, headers).send(body)
    }

    /** Put helper that uses supertest to hook into the express route to make the actual call */
    const testPut = async (
        path: string,
        body: object,
        headers?: Record<string, string>
    ) => {
        return await methods.put(path, headers).send(body)
    }

    /** Delete helper that uses supertest to hook into the express route to make the actual call */
    const testDelete = async (
        path: string,
        headers?: Record<string, string>
    ) => {
        return await methods.delete(path, headers)
    }

    // Allow passthrough to the actal function, but also let testers count calls
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
        use: (a: any) => app.use(a),
    }
}
