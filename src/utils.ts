// grab all required object locks, and release them after the callback has executed.
import { ObjectLockedError } from './event'

export const withObjectLock = async (
    objectLocks: Set<string>,
    streamIds: string[],
    callback: () => Promise<void>
): Promise<void> => {
    // keep track of the locks this call has
    const localLocks = []
    try {
        for (const streamId of streamIds) {
            if (objectLocks.has(streamId)) {
                throw new ObjectLockedError(
                    `Lock for ${streamId} already in use.`
                )
            }
            objectLocks.add(streamId)
            localLocks.push(streamId)
        }
        return await callback()
    } finally {
        // release them
        for (const streamId of localLocks) {
            objectLocks.delete(streamId)
        }
    }
}

export const ANONYMISED_STRING = ''
export const ANONYMISED_NUM = 0
/** Take any form of data and anonymise any fields to strip PII. This assumes
 * all strings and numbers are created equal. (e.g. won't change emails into
 * fake emails - should we?)
 * Recursively updates objects and arrays
 */
export const anonymiseObject = (data: any): any => {
    if (typeof data === 'string') {
        return ANONYMISED_STRING
    } else if (typeof data === 'number') {
        return ANONYMISED_NUM
    } else if (Array.isArray(data)) {
        return data.map(anonymiseObject)
    } else if (typeof data === 'object') {
        const anonymisedObject: any = {}
        for (const key in data) {
            anonymisedObject[key] = anonymiseObject(data[key])
        }
        return anonymisedObject
    } else {
        // if it gets past all the above type checks just return the original? make it undefined? what we wanna do here
        return data
    }
}
