//
// TODO:  move all the datbase features to the eventbase file!
//

export default function AdminCommands(eventstore, eventbase) {
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

    return { showTables, mrWolf, dropTables, createTables };
}
