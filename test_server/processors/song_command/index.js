//
//
//
import songApi from './song_api.js';
import SongCommands from './song_commands.js';
import SongModel from './song_model.js';

export default function (songStack) {
    const songModel = new SongModel(songStack);
    const songCommands = new SongCommands(songStack, songModel);
    return songApi(songCommands);
}
