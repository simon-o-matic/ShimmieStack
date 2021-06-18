import songModel from '../song_query/song_model';

class DoesNotExistError extends Error {}

export default function SongCommand(eventStore, songModel) {
    // add a new song, only if the same one doesn't already exit
    const addSong = (song) => {
        console.log('TODO where to put event names!');
        eventStore.recordEvent('some id', 'event_add_song', song, {
            user: 'Travis. T.',
        });
        if (!songModel.getSong(song.name)) eventStore.addSong(song);
    };

    // TODO: What to do if the song didn't exist?
    // TODO: handle don't have permissions
    const deleteSong = (songId, meta) => {
        if (!songModel.getSong(songId)) {
            throw new DoesNotExistError();
        }
        eventStore.recordEvent('some id', 'event_delete_song', songId, meta);
    };
    return { addSong, deleteSong };
}

/*
return eventStore.recordEvent(
        narrative.uuid,
        NarrativeEventTypes.CREATE_NARRATIVE,
        narrative,
        meta
    );
*/
