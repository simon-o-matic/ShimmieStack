import cookieParser from 'cookie-parser'
import express, { Router } from 'express'
import superrequest from 'supertest'

import Eventbase from './eventbase-memory'
import ShimmieStack, { StackType } from './index'

/** Some extra convenience functions for ease testing */
interface ShimmieTestStackType extends StackType {
    mountTest: (router: Router) => void
    testGet: (path: string) => Promise<superrequest.Response>
    testPost: (path: string, body: object) => Promise<superrequest.Response>
}

export default function ShimmieTestStack(): ShimmieTestStackType {
    const app = express()
    app.use(express.json())
    app.use(cookieParser())

    /** the test stack usese the in-memory event store */
    const memoryBase = Eventbase()

    /** our inner actal shimmie stack that we control access to for tests */
    const testStack = ShimmieStack(
        {
            ServerPort: 9999 /* ignored because the express server is never started */,
        },
        memoryBase
    )

    // Mount al the test processors at the root for ease of local testing.
    const mountTest = (router: Router) => {
        app.use('/', router)
    }

    /** Get helper that uses supertest to hook into the express route to make the actual call */
    const testGet = async (path: string) => {
        return await superrequest(app).get(path)
    }

    /** Get helper that uses supertest to hook into the express route to make the actual call */
    const testPost = async (path: string, body: object) => {
        return await superrequest(app).post(path).send(body)
    }

    // Allow passthrough to the actal function, but also let testers count calls
    jest.spyOn(testStack, 'recordEvent')

    // the actual shimmie stack, plus our extras
    return { ...testStack, mountTest, testGet, testPost }
}
