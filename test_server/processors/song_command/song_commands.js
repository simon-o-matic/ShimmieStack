import { v4 as uuidv4 } from 'uuid';
import songEvents from './song_events.js';

export class DoesNotExistError extends Error {}

export default function SongCommands(eventStore, songModel) {
    // add a new song, only if the same one doesn't already exit
    const addSong = async (song) => {
        await eventStore.recordEvent(uuidv4(), songEvents.SONG_ADDED, song, {
            user: 'Travis. T.',
        });
    };

    // TODO: What to do if the song didn't exist?
    // TODO: handle don't have permissions
    const deleteSong = async (songId, meta) => {
        if (!songModel.getSong(songId)) {
            throw new DoesNotExistError();
        }

        await eventStore.recordEvent(songId, songEvents.SONG_DELETED, {}, meta);
    };
    return { addSong, deleteSong };
}
