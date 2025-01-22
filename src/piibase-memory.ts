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

    // Get all events in the correct squence for replay
    const getPiiLookup = async (
        params: {
            keys?: string[], minSequenceNumber?: number
        } | undefined,
    ): Promise<Record<string, any>> => {

        if (params?.keys && params?.keys.length > 0) {
            const keys = params.keys
            return Promise.resolve(
                new Map(
                    [...piiData].filter(([key, value]) => keys.includes(key)),
                ),
            )
        }
        if (params?.minSequenceNumber !== undefined) {
            const minSeq = params.minSequenceNumber
            return Promise.resolve(
                new Map(
                    [...piiData].filter(([key, value]) => parseInt(key) >= minSeq),
                ),
            )
        }

        return Promise.resolve(piiData)
    }

    const anonymisePiiEventData = async (keys: string[]): Promise<void> => {
        const piiLookup = await getPiiLookup({ keys })
        for (const key of keys) {
            const entry = piiLookup.get(key)
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
