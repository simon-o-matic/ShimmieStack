//
//
//

import express from 'express';

const DUMMY_USER = 'Travis, T.';

export default function (songCommands) {
    const router = express.Router();

    // create a new song
    router.post('/', async (req, res) => {
        let song;
        try {
            song = new Song(req.body);
        } catch (err) {
            res.status(400).json({ error: err.message });
            return;
        }

        try {
            const result = await songCommands.addSong(song, {
                owner: DUMMY_USER,
            });
            res.status(201).json(result);
        } catch (err) {
            console.error(err.message);
            res.status(500).json({
                error: 'Something went wrong. Soz bro.',
            });
        }
    });

    router.delete('/:id', async (req, res) => {
        const id = req.params.id;

        if (!id) {
            res.sendStatus(400, 'missing id in the request');
            return;
        }

        try {
            await songCommands.deleteSong(id);
            res.sendStatus(204);
        } catch (err) {
            if (typeof err === 'DoesNotExistError')
                res.sendStatus(404).json({
                    error: "That song does not exist so can't be deleted",
                });
            else res.sendStatus(500).json({ error: err.message });
        }
    });

    return router;
}
