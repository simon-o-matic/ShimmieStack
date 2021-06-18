//
// The Admin API
//

import express from 'express';
import expressAsyncErrors from 'express-async-errors'; // patches express

const router = express.Router();

// TODO: CHECK FOR ADMIN PERMISSIONS

export default function (adminCommands) {
    // Only needs to be done ONCE in prod.
    router.post('/create_database_tables', async (req, res) => {
        if (process.env.NODE_ENV != 'development') {
            res.status(403).json({ error: 'nick off punk' });
        } else {
            res.status(200).json({
                result: await adminCommands.createTables(),
            });
        }
    });

    router.post('/drop_database_tables', async (req, res) => {
        if (process.env.NODE_ENV != 'development') {
            console.log('Permission denied');
            res.status(403).json({ error: 'nick off punk' });
        } else {
            console.log('Well, not much left of that then is there?');
            try {
                const rows = await adminCommands.dropTables();
                res.status(200).json({ tables: rows.rows });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        }
    });

    router.get('/show_database_tables', async (req, res) => {
        res.status(200).json({ tables: await adminCommands.showTables() });
    });

    router.get('/events', async (req, res) => {
        try {
            const rows = await adminCommands.getAllEventsInOrder();
            res.status(200).json({ events: rows });
        } catch (err) {
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

    // HOW DOES THIS WORK?
    router.use((err, req, res, next) => {
        console.log('OMG 2! Custom error handler!', err);
        next(err);
    });

    return router;
}
