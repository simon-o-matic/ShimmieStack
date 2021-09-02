//
//
//
import SongCommandProcessor from './song_command';
import SongQueryProcessor from './song_query';

export default function (eventStore) {
    return [
        new SongCommandProcessor(eventStore),
        new SongQueryProcessor(eventStore),
    ];
}
