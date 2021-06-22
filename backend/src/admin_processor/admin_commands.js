//
// TODO:  move all the datbase features to the eventbase file!
//

// @eventbase The admin commands can call the database directly. No other
//            command processors are allowed direct access to ti.
//
export default function AdminCommands(eventStore, eventbase) {
    const createTables = async () => {
        return await eventbase.createTables();
    };

    const dropTables = async () => {
        return await eventbase.dropTables();
    };

    // Whats the time, Mr. Wolf?
    const mrWolf = async () => {
        const rows = await eventbase.mrWolf();
        return rows[0].now;
    };

    // filter out system tables
    const showTables = async () => {
        return eventbase.showTables();
    };

    const getEvents = async () => {
        return eventbase.getAllEventsInOrder();
    };

    return { showTables, mrWolf, dropTables, createTables, getEvents };
}
