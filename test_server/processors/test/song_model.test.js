import jest from 'jest-mock';
import { EventEmitter } from 'events';
import SongModel from '../song_command/song_model';
import songEvents from '../song_command/song_events.js';

// mock event store
const eventEmitter = new EventEmitter();
const mockStore = {
    subscribe: (e, f) => eventEmitter.on(e, f),
};

// mock actions to mock the eventStore
const mockEvents = {
    addSong: (id) => {
        eventEmitter.emit(songEvents.SONG_ADDED, {
            data: { title: 'i want to break free' },
            streamId: id,
        });
    },

    deleteSong: (id) => {
        eventEmitter.emit(songEvents.SONG_DELETED, { id });
    },

    updateSong: (id) => {
        eventEmitter.emit(songEvents.SONG_UPDATED, {
            streamId: id,
            data: { title: 'who stole the cookie' },
        });
    },
};

// todo: convert to jest.spyOn?
global.console = { warn: jest.fn(), log: () => {} };

const songModel = new SongModel(mockStore);

describe('When addings songs', () => {
    beforeEach(() => {
        songModel.empty();
    });
    it('the song is in the model', () => {
        expect(Object.keys(songModel.getSongs()).length).toBe(0);
        mockEvents.addSong(1);
        expect(Object.keys(songModel.getSongs()).length).toBe(1);
    });

    it('and its the same song', () => {
        expect(Object.keys(songModel.getSongs()).length).toBe(0);
        mockEvents.addSong(2);
        mockEvents.addSong(2);
        expect(Object.keys(songModel.getSongs()).length).toBe(1);
    });

    it('and its a different song', () => {
        expect(Object.keys(songModel.getSongs()).length).toBe(0);
        mockEvents.addSong(3);
        mockEvents.addSong(4);
        expect(Object.keys(songModel.getSongs()).length).toBe(2);
    });

    it('and the id is missing', () => {
        expect(Object.keys(songModel.getSongs()).length).toBe(0);
        mockEvents.addSong(null);
        expect(console.warn).toBeCalled();
        expect(Object.keys(songModel.getSongs()).length).toBe(0);
    });
});

describe('When deleting songs', () => {
    beforeEach(() => {
        songModel.empty();
    });

    it('the song is no longer the model', () => {
        expect(Object.keys(songModel.getSongs()).length).toBe(0);
        mockEvents.addSong(1);
        mockEvents.deleteSong(1);
        expect(Object.keys(songModel.getSongs()).length).toBe(0);
    });

    it('a different song is still in the model', () => {
        expect(Object.keys(songModel.getSongs()).length).toBe(0);
        mockEvents.addSong(1);
        mockEvents.deleteSong(2);
        expect(console.warn).toBeCalled();
        expect(Object.keys(songModel.getSongs()).length).toBe(1);
    });
});
