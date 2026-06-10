import express from 'express'
import { Server } from 'http'
import { startApiListener } from '../index'

// Port 0 = OS-assigned ephemeral port, so the suite never collides with
// other listeners (or parallel test runs).
describe('startApiListener keep-alive configuration', () => {
    let server: Server

    afterEach(() => {
        server?.close()
    })

    it('defaults keepAliveTimeout above the ALB 60s idle timeout', async () => {
        server = await startApiListener(express(), 0)

        expect(server.keepAliveTimeout).toBe(65_000)
        // Node requires headersTimeout > keepAliveTimeout or sockets are
        // reaped before the keep-alive window is reachable.
        expect(server.headersTimeout).toBe(66_000)
        expect(server.listening).toBe(true)
    })

    it('honours a configured keepAliveTimeoutMs', async () => {
        server = await startApiListener(express(), 0, 120_000)

        expect(server.keepAliveTimeout).toBe(120_000)
        expect(server.headersTimeout).toBe(121_000)
    })
})
