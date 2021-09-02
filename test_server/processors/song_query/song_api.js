//
// TODO Sort out rest verbs
//

import express from 'express';

export default function SongApi(songModel) {
    const router = express.Router();

    router.get('/', (req, res) => {
        res.status(200).json({ songs: JSON.stringify(songModel.getSongs()) });
    });

    router.get('/:id', (req, res) => {
        const id = req.params.id;

        if (!id) {
            res.sendStatus(400);
            return;
        }

        const song = songModel.getSong(id);

        if (!song) {
            res.sendStatus(404).json('No such song');
            return;
        }

        res.status(200).json({ song: JSON.stringify(song) });
    });

    return router;
}
