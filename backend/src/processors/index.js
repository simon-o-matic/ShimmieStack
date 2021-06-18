//
//
//
import SongCommandProcessor from './song_command';
import SongQueryProcessor from './song_query';

export default function (eventStore) {
    // ADD YOUR PROCESSORS HERE
    const songCommand = new SongCommandProcessor(eventStore);
    const songQuery = new SongQueryProcessor(eventStore);

    return { songQuery, songCommand };
}
