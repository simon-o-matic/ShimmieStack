//
// TODO: encapsulate the underlying database elsewhere
//
import pg from 'pg'
import { EventBaseType, EventToRecord, StoredEventResponse, StreamVersionError, StreamVersionMismatch } from './event'
import { Logger } from './logger'
import { fetchMatchStreamVersionsQuery, prepareAddEventQuery, createEventListTableQuery } from './queries'

const { Pool } = pg

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
        return await createTables()
    }

    const shutdown = async () => {
        return
    }

    const addEvent = async (event: EventToRecord, streamVersionIds?: Record<string, string|undefined>): Promise<StoredEventResponse> => {
        // prepare and parameterised the addEvent query based on whether streamVersionIds were provided or not.
        const query = prepareAddEventQuery(event, streamVersionIds)
        const results: StoredEventResponse[] = await runQuery(query)

        // if we get no result we didnt manage to record an event but the query succeeded, this is a version failure
        if(!results || results.length === 0){
            if(!streamVersionIds){
                Logger.error("Something unexpected happened. We shouldn't be in here without checking versions")
                throw new Error("Unexpcted error occured. Unable to add event to stream.")
            }
            // running a second query is bad, but we didnt successfully write anyway so its probably fine
            const mismatchedVersionDbResult = await runQuery(fetchMatchStreamVersionsQuery(Object.keys(streamVersionIds)))
            if(!mismatchedVersionDbResult || mismatchedVersionDbResult.length < 1){
                throw Error("Sopmething went wrong. Unable to fetch details about db mismatch")
            }
            // lets get some info out about the failure
            const mismatchedVersions: StreamVersionMismatch[] = mismatchedVersionDbResult
                .reduce((mismatched: StreamVersionMismatch[],version: {
                        "streamid": string,
                        "StreamVersionId": string
                }) => {
                    if(version.StreamVersionId !== streamVersionIds[version.streamid]){
                        mismatched.push({
                            streamId: version.streamid,
                            expectedVersionId: streamVersionIds[version.streamid] ?? 'Unknown',
                            actualVersionId: version.streamid,
                        })
                    }
                    return mismatched
                }, [])

            Logger.error(`Version mismatch detected: ${JSON.stringify(mismatchedVersions)}`)
            throw new StreamVersionError('Version mismatch detected: ', mismatchedVersions)
        }

        return results[0]
    }

    // Get all events in the correct squence for replay
    const getEventsInOrder = async (seqNum?: number) => {
        const query = seqNum !== undefined ? 'SELECT * FROM eventlist WHERE SequenceNum >= ${seqNum} ORDER BY SequenceNum' : 'SELECT * FROM eventlist ORDER BY SequenceNum'
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
        const env = process.env.NODE_ENV
        if (!env || !['development', 'test'].includes(env)) {
            throw new Error(`Eventbase reset Not implemented for env: ${env}`)
        }
        await dropTables()
        return await createTables()
    }

    const runQuery = async (
        query: string,
        values: string[] | undefined = undefined
    ) => {
        try {
            const res = values
                ? await pool.query(query, values)
                : await pool.query(query)
            // was it a multi statement query?
            // if so return the last result
            if(Array.isArray(res)){
                return res[res.length - 1]?.rows
            }
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
        const queryString = createEventListTableQuery
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
        getEventsInOrder,
        addEvent,
        reset,
        deleteEvent,
        updateEventData,
        init,
        shutdown,
    }
}
