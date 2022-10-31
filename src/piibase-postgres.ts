import { PiiBaseType } from './event'
import pg from 'pg'
const { Pool } = pg
import { EventbaseError } from './eventbase-postgres'
import { Logger } from './logger'

export interface PiiBaseConfig {
    connectionString: string
}

export class PiiBaseError extends Error {
    constructor(message: string) {
        super(message) // (1)
        this.name = 'EventbaseError' // (2)
    }
}

export default function PiiBase(config: PiiBaseConfig): PiiBaseType {
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
        await createTable()
    }

    const reset = async () => {
        await dropTables()
        await createTable()
    }

    const shutdown = async () => {
        return
    }

    const addPiiEventData = async (
        key: string,
        data: Record<string, any>
    ): Promise<Record<string, any>> => {
        const query =
            'INSERT into pii_store(Key, Data) VALUES($1, $2) RETURNING Key, Data, logdate'

        const result = await runQuery(query, [key, JSON.stringify(data)])

        return result[0].data
    }

    // Get a single pii value by the key (sequence num in event store)
    const getPiiData = async (
        key: string
    ): Promise<Record<string, any> | undefined> => {
        const query = 'SELECT Key, Data FROM pii_store WHERE Key = $1'
        const eventRow = await runQuery(query, [key])
        if (!eventRow || !eventRow[0]) {
            return
        }
        return eventRow[0].Data
    }

    // Get all events as a record<Key,Data>
    const getPiiLookup = async (): Promise<Record<string, any>> => {
        const query = 'SELECT Key, Data FROM pii_store'
        const eventRows = await runQuery(query)
        const piiLookup: Record<string, any> = {}

        eventRows.forEach((eventRow: any) => {
            piiLookup[eventRow.key] = eventRow.data
        })

        return piiLookup
    }

    //
    //  Create the tables required for the event store.
    //
    const createTable = async () => {
        const queryString = `
        CREATE TABLE IF NOT EXISTS pii_store
        (
            Key varchar(127) NOT NULL,
            Data jsonb NOT NULL,
            LogDate timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (Key)
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
                    'Failed to setup piibase tables, trying again in 5 seconds',
                    err
                )
                await new Promise((resolve) => setTimeout(resolve, 5000))
            }
        }
        return res
    }

    const dropTables = async () => {
        const query = 'DROP TABLE IF EXISTS pii_store'
        try {
            return await runQuery(query)
        } catch (err: any) {
            throw new Error(`Error dropping database tables: ${err.message}`)
        }
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

    return {
        addPiiEventData,
        getPiiLookup,
        getPiiData,
        init,
        reset,
        shutdown,
    }
}
