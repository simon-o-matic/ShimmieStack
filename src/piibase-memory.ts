//
// An in-memory version of the pii base. This is used for testing. No
// events survive a restart of the server.
//
import { PiiBaseType } from './event'
import { anonymiseObject } from './utils'

export default function PiiBase(): PiiBaseType {
    let piiData: Map<string, any> = new Map()

    const init = () => {
        return Promise.resolve()
    }

    const reset = () => {
        piiData = new Map()
        return Promise.resolve()
    }

    const shutdown = () => {
        return Promise.resolve()
    }

    const addPiiEventData = async (
        key: string,
        data: Record<string, any>,
    ): Promise<Record<string, any>> => {
        piiData.set(key, data)

        return Promise.resolve(data)
    }

    // Get all events in the correct squence for replay
    const getPiiData = async (
        key: string,
    ): Promise<Record<string, any> | undefined> => {
        if (piiData.has(key)) {
            return piiData.get(key)
        }

        return Promise.resolve(undefined)
    }

    // Get pii records keyed by sequence number, as a plain object so the
    // shape matches the Postgres implementation and the PiiBaseType contract.
    const getPiiLookup = async (
        params: {
            keys?: string[], minSequenceNumber?: number
        } | undefined,
    ): Promise<Record<string, any>> => {
        // An explicit empty key list means "nothing to look up", matching the
        // Postgres implementation rather than returning every record.
        if (params?.keys !== undefined && params.keys.length === 0) {
            return Promise.resolve({})
        }

        let entries = [...piiData]

        if (params?.keys && params.keys.length > 0) {
            const keys = params.keys
            entries = entries.filter(([key]) => keys.includes(key))
        } else if (params?.minSequenceNumber !== undefined) {
            const minSeq = params.minSequenceNumber
            entries = entries.filter(([key]) => parseInt(key) >= minSeq)
        }

        return Promise.resolve(Object.fromEntries(entries))
    }

    const anonymisePiiEventData = async (keys: string[]): Promise<void> => {
        const piiLookup = await getPiiLookup({ keys })
        for (const key of keys) {
            const entry = piiLookup[key]
            if (entry) {
                piiData.set(key, anonymiseObject(entry))
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
