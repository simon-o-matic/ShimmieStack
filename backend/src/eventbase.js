//
// TODO: encapsulate the underlying database elsewhere
//

// HACK to use require in es6.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const pg = require('pg');
const { Client } = pg;

export default function Eventbase(ConnectionString) {
    if (!ConnectionString) {
        throw new Error('Missing DATABASE_URL environment variable.');
    } else {
        console.log('Eventbase connection string: ', ConnectionString);
    }

    const connection = new Client({
        connectionString: ConnectionString,
    });

    // called during start up to first connect to the database
    // TODO: retry to solve docker start up timing issue
    const connect = async () => {
        await connection.connect();
    };

    const close = async () => {
        await connection.end();
    };

    const addEvent = (event) => {
        const query =
            'INSERT into eventlist(StreamId, Data, Type, Meta) VALUES($1, $2, $3, $4) RETURNING SequenceNum, streamId, logdate, type';
        const values = [
            event.streamId,
            JSON.stringify(event.data),
            event.type,
            JSON.stringify(event.meta),
        ];
        return runQuery(query, values);
    };

    // Get all events in the correct squence for replay
    const getAllEventsInOrder = () => {
        const query = 'SELECT * FROM eventlist ORDER BY SequenceNum';
        return runQuery(query);
    };

    const runQuery = async (query, values = null) => {
        try {
            if (values) {
                return (await connection.query(query, values)).rows;
            } else {
                return (await connection.query(query)).rows;
            }
        } catch (err) {
            console.log(`Query error <${query}> [${values}]: ${err.message}`);
            throw err;
        }
    };

    //
    //  Create the tables required for the event store.
    //
    const createTables = () => {
        const queryString = `
        CREATE TABLE IF NOT EXISTS eventlist
        (
            SequenceNum bigserial NOT NULL,
            StreamId text NOT NULL,
            Data jsonb NOT NULL,
            Type text NOT NULL,
            Meta jsonb NOT NULL,
            LogDate timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (SequenceNum)
        );`;

        try {
            return runQuery(queryString);
        } catch (err) {
            console.error('Error creating eventlist database tables: ', err);
            return err;
        }
    };

    const dropTables = () => {
        const query = 'DROP TABLE IF EXISTS eventlist';
        try {
            return runQuery(query);
        } catch (err) {
            throw new Error(`Error dropping database tables: ${err.message}`);
        }
    };

    // Whats the time, Mr. Wolf?
    const mrWolf = async () => {
        const rows = await runQuery('select now()');
        return rows[0].now;
    };

    // filter out system tables
    const showTables = () => {
        const query = `
            SELECT * FROM pg_catalog.pg_tables 
            WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema';`;
        return runQuery(query);
    };

    return {
        getAllEventsInOrder,
        runQuery,
        connect,
        close,
        addEvent,
        mrWolf,
        showTables,
        createTables,
        dropTables,
    };
}
