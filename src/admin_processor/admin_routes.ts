//
// The Admin API
//

// TODO: CHECK FOR ADMIN PERMISSIONS?

import { Router, Request, Response } from 'express'
import { AdminCommandsType } from './admin_commands'

export default function (adminCommands: AdminCommandsType): Router {
    const router = Router()

    // Only needs to be done ONCE in prod.
    router.post('/init', async (req: Request, res: Response) => {
        if (process.env.NODE_ENV != 'development') {
            return res.status(403).send({ error: 'nick off punk' })
        } else {
            await adminCommands.init()
            return res.status(200).send()
        }
    })

    router.post('/reset', async (req, res) => {
        if (process.env.NODE_ENV != 'development') {
            return res.status(403).send({ error: 'nick off punk' })
        } else {
            try {
                const rows = await adminCommands.reset()
                return res.status(200).send(rows)
            } catch (err: any) {
                return res.status(500).send({ error: err.message })
            }
        }
    })

    router.get('/events', async (req, res) => {
        try {
            const rows = await adminCommands.getEvents()
            return res.status(200).send({ events: rows })
        } catch (err: any) {
            return res.status(500).send({ error: err.message })
        }
    })

    router.get('/time', (req, res) => {
        return res.status(200).send({ time: adminCommands.time() })
    })

    router.get('/teapot', async (req, res) => {
        return res.send(
            "I'm a little teapot short and stout. This is my handle and this is my spout."
        )
    })

    router.get('/health', async (req, res) => {
        try {
            const events = await adminCommands.getEvents()

            res.send({
                status: 'healthy',
                version: process.env.APP_VERSION ?? 'DEV',
            })
        } catch (err: any) {
            res.status(503).json({
                message: 'Server is not yet ready to handle requests',
            })
        }
    })

    return router
}
