import Processor from '../processor';

import api from './song_api.js';
import SongCommand from './song_commands.js';
import SongModel from './song_model.js';

export default function (eventStore) {
    const songModel = new SongModel(eventStore);
    const songCommands = new SongCommand(eventStore, songModel);
    const theApi = new api(songCommands);

    return new Processor('Song Command Processor', '/songs', theApi, songModel);
}
