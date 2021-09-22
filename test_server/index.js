//
//
//
import ShimmieStack from 'shimmiestack';

import SongCommand from './processors/song_command';
import SongQuery from './processors/song_query';

// Set up the song stack
const songStack = ShimmieStack({
    EventbaseURL: process.env.DATABASE_URL,
    ServerPort: parseInt(process.env.SONG_PORT),
});

songStack.use((a, b, c) => {
    console.log('A BC ');
});

songStack
    .setApiVersion('/v1')
    .mountProcessor('Song Commands', '/songs', SongCommand(songStack))
    .mountProcessor('Song Queries', '/songs', SongQuery(songStack))
    .startup();

export default function (eventStore) {
    return [
        new SongCommandProcessor(eventStore),
        new SongQueryProcessor(eventStore),
    ];
}
