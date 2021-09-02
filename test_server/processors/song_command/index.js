import Processor from '../../../src/processor';

import api from './song_api.js';
import SongCommands from './song_commands.js';
import SongModel from './song_model.js';
import songEvents from './song_events.js';

export default function (eventStore) {
    const songModel = new SongModel(eventStore);
    const songCommands = new SongCommands(eventStore, songModel);
    const theApi = new api(songCommands);

    return new Processor(
        'Song Command Processor',
        '/songs',
        theApi,
        songModel,
        songEvents
    );
}
