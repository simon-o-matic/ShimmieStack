//
// Command side song model.
//

import songEvents from './song_events.js';

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

    const songAdded = (songEvent) => {
        console.log('DDDDD', songEvent);
        const song = songEvent.data;
        song.id = songEvent.streamId;

        if (!song || !song.id) {
            console.warn('Song not valid when adding a new song to the model');
        } else if (songs[song.id]) {
            console.warn(
                'Asked to add a song that was already in the model',
                song.id
            );
        } else {
            songs[song.id] = song;
        }
    };

    const songDeleted = (song, meta) => {
        if (song && song.id) delete songs[song.id];
    };

    const songUpdated = (song, meta) => {
        if (song && song.id) songs[song.id] = song;
    };

    eventStore.subscribe(songEvents.SONG_ADDED, songAdded);
    eventStore.subscribe(songEvents.SONG_DELETED, songDeleted);
    eventStore.subscribe(songEvents.SONG_UPDATED, songUpdated);

    return { empty, getSong, getSongs };
}