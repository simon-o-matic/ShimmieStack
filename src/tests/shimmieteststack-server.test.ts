/**
 * ShimmieTestStack must serve supertest from its own server bound to
 * 127.0.0.1. Handing supertest a bare express app makes it call app.listen(0)
 * per request, a wildcard bind that macOS can satisfy with a port another
 * process already holds on the loopback address, so the request goes to that
 * process instead. These tests look at the socket the request arrived on.
 *
 * Run this file with --detectOpenHandles: with the stack never shut down
 * (the third block) jest must still exit cleanly.
 */
import { Router } from 'express'
import ShimmieTestStack from '../shimmieteststack'

type Models = { NOTHING: Record<string, never> }

const socketInfoRouter = () => {
    const router = Router()
    router.get('/socket', (req, res) => {
        res.status(200).json({
            localAddress: req.socket.localAddress,
            localPort: req.socket.localPort,
            host: req.headers.host,
        })
    })
    router.post('/echo', (req, res) => {
        res.status(200).json(req.body)
    })
    return router
}

describe('the test stack server', () => {
    const stack = ShimmieTestStack<Models, Models>()
    stack.mountTest(socketInfoRouter())

    afterAll(async () => {
        await stack.shutdown()
    })

    it('binds to 127.0.0.1, not the wildcard address', async () => {
        const address = await stack.serverAddress()

        expect(address.address).toBe('127.0.0.1')
        expect(address.family).toBe('IPv4')
        expect(address.port).toBeGreaterThan(0)
    })

    it('serves requests on that bound port', async () => {
        const address = await stack.serverAddress()
        const res = await stack.testGet({ path: '/socket' })

        expect(res.body.localAddress).toBe('127.0.0.1')
        expect(res.body.localPort).toBe(address.port)
        expect(res.body.host).toBe(`127.0.0.1:${address.port}`)
    })

    it('uses one port for every request rather than a fresh server each time', async () => {
        const first = await stack.testGet({ path: '/socket' })
        const second = await stack.testGet({ path: '/socket' })
        const third = await stack.testPost({
            path: '/echo',
            body: { hello: 'there' },
        })

        expect(second.body.localPort).toBe(first.body.localPort)
        expect(third.body).toEqual({ hello: 'there' })
    })

    it('the first request can be issued before the server has finished binding', async () => {
        // a brand new stack: listen(0, host) is still resolving when we call
        const fresh = ShimmieTestStack<Models, Models>()
        fresh.mountTest(socketInfoRouter())
        try {
            const res = await fresh.testGet({ path: '/socket' })
            expect(res.body.localAddress).toBe('127.0.0.1')
        } finally {
            await fresh.shutdown()
        }
    })
})

describe('shutting the test stack down', () => {
    it('closes the server so later requests are refused', async () => {
        const stack = ShimmieTestStack<Models, Models>()
        stack.mountTest(socketInfoRouter())
        const before = await stack.testGet({ path: '/socket' })
        expect(before.status).toBe(200)

        await stack.shutdown()

        await expect(stack.testGet({ path: '/socket' })).rejects.toBeDefined()
    })

    it('is safe to call twice', async () => {
        const stack = ShimmieTestStack<Models, Models>()
        await stack.shutdown()
        await expect(stack.shutdown()).resolves.toBeUndefined()
    })
})

describe('a stack that is never shut down', () => {
    // Mirrors how consumers use it: created at module scope, no afterAll.
    const stack = ShimmieTestStack<Models, Models>()
    stack.mountTest(socketInfoRouter())

    it('does not hold the process open (checked by --detectOpenHandles)', async () => {
        const res = await stack.testGet({ path: '/socket' })
        expect(res.status).toBe(200)
    })
})
