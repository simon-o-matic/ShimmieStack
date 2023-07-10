//
// TODO: encapsulate the underlying database elsewhere
//
import pg from 'pg'
const { Pool } = pg
import { Event, EventBaseType, EventToRecord } from './event'
import { Logger } from './logger'

export interface EventConfig {
    connectionString: string
}

export class EventbaseError extends Error {
    constructor(message: string) {
        super(message) // (1)
        this.name = 'EventbaseError' // (2)
    }
}

export default function Eventbase(config: EventConfig): EventBaseType {
    if (!config.connectionString) {
        throw new Error('Missing DATABASE_URL environment variable.')
    }

    const pool = new Pool({
        connectionString: config.connectionString,
        connectionTimeoutMillis: 5000, // wait 5 seconds before timeout on connect
    })

    // called during start up to first connect to the database
    // TODO: retry to solve docker start up timing issue
    const init = async () => {
        await createTables()
    }

    const shutdown = async () => {
        return
    }

    const addEvent = async (event: EventToRecord) => {
        // todo add version number here
        const query =
            'INSERT into eventlist(StreamId, Data, Type, Meta) VALUES($1, $2, $3, $4) RETURNING SequenceNum, streamId, logdate, type'
        const values: string[] = [
            event.streamId,
            JSON.stringify(event.data),
            event.type,
            JSON.stringify(event.meta),
        ]
        return await runQuery(query, values)
    }

    // Get all events in the correct squence for replay
    const getAllEventsInOrder = async () => {
        const query = 'SELECT * FROM eventlist ORDER BY SequenceNum'
        return await runQuery(query)
    }

    /** TODO: work out what to do with PII data */
    const deleteEvent = async (sequenceNumber: number) => {
        const query = `DELETE FROM eventlist WHERE SequenceNum=${sequenceNumber}`
        await runQuery(query)
        return Promise.resolve()
    }

    const updateEventData = async (sequenceNumber: number, data: object) => {
        const query = `UPDATE eventlist SET Data=${data} WHERE SequenceNum=${sequenceNumber}`
        await runQuery(query)
        return Promise.resolve()
    }

    const reset = async () => {
        throw new Error("Not implemented")
        // await dropTables()
        // await createTables()
    }

    const runQuery = async (
        query: string,
        values: string[] | undefined = undefined
    ) => {
        try {
            const res = values
                ? await pool.query(query, values)
                : await pool.query(query)
            return res.rows
        } catch (err: any) {
            Logger.error(`Query error <${query}> [${values}]: ${err.message}`)
            throw err
        }
    }

    //
    //  Create the tables required for the event store.
    //
    const createTables = async () => {
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
        );`
        let retries = 0
        let res
        while (retries < 5) {
            try {
                res = await runQuery(queryString)
                break
            } catch (err: any) {
                retries++
                // sleep for 5 seconds
                Logger.log(
                    `Failed to setup eventbase tables, trying again in 5 seconds ${err}`
                )
                await new Promise((resolve) => setTimeout(resolve, 5000))
            }
        }
        return res
    }

    const dropTables = async () => {
        const query = 'DROP TABLE IF EXISTS eventlist'
        try {
            return await runQuery(query)
        } catch (err: any) {
            throw new Error(`Error dropping database tables: ${err.message}`)
        }
    }

    // filter out system tables
    // const showTables = () => {
    //     const query = `
    //         SELECT * FROM pg_catalog.pg_tables
    //         WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema';`;
    //     return runQuery(query);
    // };

    return {
        getAllEventsInOrder,
        addEvent,
        reset,
        deleteEvent,
        updateEventData,
        init,
        shutdown,
    }
}
