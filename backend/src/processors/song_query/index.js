import Processor from '../processor';

import songAPI from './song_api.js';
import SongModel from './song_model.js';

export default function (eventStore) {
    const songModel = new SongModel(eventStore);
    const apiRouter = new songAPI(songModel);

    return new Processor(
        'Song Query Processor',
        '/songs',
        apiRouter,
        songModel
    );
}
