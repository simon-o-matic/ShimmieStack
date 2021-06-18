//
// Command side song model.
//

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
        songs[event.id] = event.data;
    };

    const songDeleted = (event) => {
        delete songs[event.id];
    };

    const songUpdated = (event) => {
        sondAdded(event);
    };

    eventStore.subscribe('songAddedEvent', songAdded);
    eventStore.subscribe('songDeleted', songDeleted);
    eventStore.subscribe('songUpdated', songUpdated);

    return { empty, getSong, getSongs };
}
