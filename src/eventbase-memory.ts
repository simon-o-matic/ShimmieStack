//
// An in-memory version of the event base. This is used for testing. No
// events survive a restart of the server.
//
import {
    Event,
    EventBaseType,
    EventToRecord,
    StoredEventResponse,
    StreamVersionError,
    StreamVersionMismatch,
} from './event'

export default function Eventbase(): EventBaseType {
    const events: Array<Event> = []
    let streamVersionIndex: Map<string, string> = new Map()

    const init = () => {
        return Promise.resolve()
    }
    const shutdown = () => {
        return Promise.resolve()
    }
    const reset = () => {
        events.length = 0
        streamVersionIndex = new Map()
        return Promise.resolve()
    }

    /** update the data at that position with new data */
    const updateEventData = (sequenceNumber: number, data: object) => {
        events[sequenceNumber].data = data
        return Promise.resolve()
    }

    /** remove one event at the position */
    const deleteEvent = (sequenceNumber: number) => {
        events.splice(sequenceNumber, 1)
        return Promise.resolve()
    }

    const addEvent = async (event: EventToRecord, streamVersionIds?: Record<string, string>): Promise<StoredEventResponse[]> => {
        const newEvent: Event = {
            ...event,
            sequencenum: events.length,
        }

        // if a stream versions are provided, check they matches the current version for the referenced stream
        if (streamVersionIds && Object.keys(streamVersionIds).length > 0) {
            const mismatchedVersions = Object.entries(streamVersionIds).reduce<StreamVersionMismatch[]>(
                (mistmatched, [streamId, versionId]) => {
                    const currentObjectVersionId = streamVersionIndex.get(streamId)

                    if (currentObjectVersionId && currentObjectVersionId !== versionId) {
                        mistmatched.push({
                            streamId,
                            expectedVersionId: versionId,
                            actualVersionId: currentObjectVersionId,
                        })
                    }
                    return mistmatched
                },
                [],
            )

            // Do we have any stream version mismatches?
            if (mismatchedVersions.length > 0) {
                throw new StreamVersionError('Version mismatch detected', mismatchedVersions)
            }
        }


        // when we update, we don't need to update all the referenced stream versions. Just this one.
        streamVersionIndex.set(newEvent.streamId, newEvent.streamVersionId)
        events.push(newEvent)

        return Promise.resolve([
            {
                streamId: newEvent.streamId,
                sequencenum: newEvent.sequencenum,
                logdate: new Date(newEvent.meta.date).toISOString(),
                type: newEvent.type,
                streamVersionId: newEvent.streamVersionId,
                data: newEvent.data,
                meta: newEvent.meta
            },
        ])
    }

    // Get all events in the correct squence for replay
    const getAllEventsInOrder = () => {
        return Promise.resolve(events)
    }

    return {
        addEvent,
        getAllEventsInOrder,
        init,
        reset,
        updateEventData,
        deleteEvent,
        shutdown,
    }
}
