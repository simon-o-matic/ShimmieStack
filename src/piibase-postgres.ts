import pg from 'pg'
import Format from 'pg-format'
import { PiiBaseType } from './event'
import { PostgresDbConfig } from './eventbase-postgres'
import { Logger } from './logger'
import { anonymiseObject } from './utils'
const { Pool } = pg

export class PiiBaseError extends Error {
    constructor(message: string) {
        super(message) // (1)
        this.name = 'EventbaseError' // (2)
    }
}

export default function PiiBase(config: PostgresDbConfig): PiiBaseType {
    if (!config.connectionString) {
        throw new Error('Missing DATABASE_URL environment variable.')
    }

    const defaultPoolConfig: PostgresDbConfig = {
        connectionTimeoutMillis: 5000, // wait 5 seconds before timeout on connect
    }

    const pool = new Pool({
        ...defaultPoolConfig,
        ...config,
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

    const updatePiiEventData = async (
        key: string,
        data: Record<string, any>
    ): Promise<void> => {
        const query = 'UPDATE pii_store SET Data = $1 WHERE Key = $2'

        await runQuery(query, [JSON.stringify(data), key])
        return Promise.resolve()
    }

    // Get a single pii value by the key (sequence num in event store)
    const getPiiData = async (
        key: string
    ): Promise<Record<string, any> | undefined> => {
        const query = `SELECT Key, Data FROM pii_store WHERE Key = $1`
        const eventRow = await runQuery(query, [key])
        if (!eventRow || !eventRow[0]) {
            return
        }
        return eventRow[0].Data
    }

    // Get all events as a record<Key,Data>
    // Get all events in the correct squence for replay
    const getPiiLookup = async (
        params: {
            keys?: string[], minSequenceNumber?: number
        } | undefined,
    ): Promise<Record<string, any>> => {
        let query = 'SELECT Key, Data FROM pii_store'
        if (params?.keys && params.keys.length > 0) {
            const keys = params.keys
            query = Format(
                'SELECT Key, Data FROM pii_store WHERE Key in (%L)',
                keys
            )
        }

        if (params?.minSequenceNumber !== undefined) {
            const minSequenceNumber = params.minSequenceNumber
            query = Format(
                'SELECT Key, Data FROM pii_store WHERE Key::integer >= %d',
                minSequenceNumber
            )
        }

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

    const anonymisePiiEventData = async (keys: string[]): Promise<void> => {
        const piiLookup = await getPiiLookup({ keys })

        for (const key of keys) {
            const entry = piiLookup[key]
            if (entry) {
                await updatePiiEventData(key, anonymiseObject(entry))
            }
        }

        return Promise.resolve()
    }

    return {
        addPiiEventData,
        anonymisePiiEventData,
        getPiiLookup,
        getPiiData,
        init,
        reset,
        shutdown,
    }
}
