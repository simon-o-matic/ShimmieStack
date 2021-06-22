//
//
//

import express from 'express';
import { DoesNotExistError } from './song_commands';

const DUMMY_USER = 'Travis, T.';

class Song {
    constructor(song) {
        this.title = song.title;
        this.artist = song.artist;
        this.year = song.year;
    }
}

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
                user: DUMMY_USER,
            });
            res.status(201).json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/:id', async (req, res) => {
        const id = req.params.id;
        if (!id) {
            res.status(400).json({ error: 'missing id in the request' });
            return;
        }

        try {
            await songCommands.deleteSong(id, { user: DUMMY_USER });
            res.status(204);
        } catch (err) {
            if (err instanceof DoesNotExistError) {
                res.status(404).json({
                    error: "That song does not exist so can't be deleted",
                });
            } else {
                res.status(500).json({ error: err.message });
            }
        }
    });

    return router;
}
