//
// Query side.
//
// Stores every Narrative in memory.

// In-mem representation
import songEvents from '../song_command/song_events';

export default function (eventStore) {
    let songs = {};

    // public methods
    const empty = () => {
        songs = {};
    };

    const getSong = (id) => {
        return songs[id];
    };

    const getSongs = () => {
        return songs;
    };

    // private maintainers

    const songAdded = (event) => {
        if (Object.keys(event.data).length == 0) {
            console.warn('Ignoring an empty model: ', event.streamId);
            return;
        }
        songs[event.streamId] = event.data;
    };

    const songDeleted = (event) => {
        delete songs[event.streamId];
    };

    const songUpdated = (event) => {};

    eventStore.subscribe(songEvents.SONG_ADDED, songAdded);
    eventStore.subscribe(songEvents.SONG_DELETED, songDeleted);
    eventStore.subscribe(songEvents.SONG_UPDATED, songUpdated);

    return { empty, getSong, getSongs };
}
