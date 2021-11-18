import { PiiBaseType } from './event';
import { Client } from 'pg'

export interface PiiBaseConfig {
    connectionString: string
}

export default function PiiBase(config: PiiBaseConfig): PiiBaseType {
    if (!config.connectionString) {
        throw new Error('Missing DATABASE_URL environment variable.')
    }

    const connection = new Client({
        connectionString: config.connectionString,
    })

    // called during start up to first connect to the database
    // TODO: retry to solve docker start up timing issue
    const init = async () => {
        await connection.connect()
        await createTable()
    }

    const reset = async () => {
        await dropTables()
        await createTable()
    }

    const shutdown = async () => {
        await connection.end()
    }

    const addPiiEventData = async (key: string, data: Record<string,any>): Promise<Record<string,any>> => {
        const query =
            'INSERT into pii_store(Key, Data) VALUES($1, $2) RETURNING Key, Data, logdate'

        const result = await runQuery(query, [key, JSON.stringify(data)])

        return result[0].data
    };

    // Get a single pii value by the key (sequence num in event store)
    const getPiiData = async (key: string): Promise<Record<string,any> | undefined> => {
        const query = 'SELECT Key, Data FROM pii_store WHERE Key = $1'
        const eventRow = await runQuery(query, [key])
        if(!eventRow || !eventRow[0]){
            return
        }
        return eventRow[0].Data
    };

    // Get all events as a record<Key,Data>
    const getPiiLookup = async (): Promise<Record<string,any>> => {
        const query = 'SELECT Key, Data FROM pii_store'
        const eventRows = await runQuery(query)
        const piiLookup: Record<string,any> = {};

        eventRows.forEach((eventRow) => {
            piiLookup[eventRow.Key] = eventRow.Data
        })

        return piiLookup
    };

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

        return runQuery(queryString)
    }

    const dropTables = () => {
        const query = 'DROP TABLE IF EXISTS pii_store'
        try {
            return runQuery(query)
        } catch (err: any) {
            throw new Error(`Error dropping database tables: ${err.message}`)
        }
    }

    const runQuery = async (
        query: string,
        values: string[] | undefined = undefined
    ) => {
        try {
            if (values) {
                return (await connection.query(query, values)).rows
            } else {
                return (await connection.query(query)).rows
            }
        } catch (err: any) {
            console.error(`Query error <${query}> [${values}]: ${err.message}`)
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
    };
}
