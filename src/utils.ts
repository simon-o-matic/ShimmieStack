// grab all required object locks, and release them after the callback has executed.
import { ObjectLockedError } from './event'

export const withObjectLock = async (
    objectLocks: Set<string>,
    streamIds: string[],
    callback: () => Promise<void>,
): Promise<void> => {
    // keep track of the locks this call has
    const localLocks = []
    try {
        for (const streamId of streamIds) {
            if (objectLocks.has(streamId)) {
                throw new ObjectLockedError(`Lock for ${streamId} already in use.`)
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