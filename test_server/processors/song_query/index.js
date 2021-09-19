import songAPI from './song_api.js';
import SongModel from './song_model.js';

export default function (songStack) {
    const songModel = new SongModel(songStack);
    return songAPI(songModel);
}
