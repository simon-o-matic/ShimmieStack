//
// The Admin API
//

// TODO: CHECK FOR ADMIN PERMISSIONS

import { Router, Request, Response } from 'express';

export default function (adminCommands: any): Router {
    const router = Router();

    // Only needs to be done ONCE in prod.
    router.post(
        '/create_database_tables',
        async (req: Request, res: Response) => {
            if (process.env.NODE_ENV != 'development') {
                res.status(403).json({ error: 'nick off punk' });
            } else {
                res.status(200).json({
                    result: await adminCommands.createTables(),
                });
            }
        }
    );

    router.post('/drop_database_tables', async (req, res) => {
        if (process.env.NODE_ENV != 'development') {
            res.status(403).json({ error: 'nick off punk' });
        } else {
            try {
                const rows = await adminCommands.dropTables();
                res.status(200).json({ tables: rows.rows });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        }
    });

    router.get('/show_database_tables', async (req, res) => {
        res.status(200).json({ tables: await adminCommands.showTables() });
    });

    router.get('/events', async (req, res) => {
        try {
            const rows = await adminCommands.getEvents();
            res.status(200).json({ events: rows });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/mrwolf', async (req, res) => {
        res.status(200).json({ time: await adminCommands.mrWolf() });
    });

    router.get('/teapot', async (req, res) => {
        res.send(
            "I'm a little teapot short and stout. This is my handle and this is my spout."
        );
    });

    return router;
}
