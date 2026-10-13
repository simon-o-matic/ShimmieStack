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
import { withObjectLock } from './utils'

export default function Eventbase(): EventBaseType {
    const events: Array<Event> = []
    let streamVersionIndex: Map<string, string> = new Map()
    let objectLocks: Set<string> = new Set()

    const init = () => {
        return Promise.resolve()
    }
    const shutdown = () => {
        return Promise.resolve()
    }
    const reset = () => {
        events.length = 0
        streamVersionIndex = new Map()
        objectLocks = new Set()
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

    const addEvent = async (
        event: EventToRecord,
        streamVersionIds?: Record<string, string | undefined>
    ): Promise<StoredEventResponse> => {
        // assign the sequence number and append. Called inside the object lock
        // for checked writes so the version check and the append are atomic.
        const appendEvent = (): Event => {
            const newEvent: Event = {
                ...event,
                sequencenum: events.length,
            }
            // when we update, we don't need to update all the referenced stream versions. Just this one.
            streamVersionIndex.set(newEvent.streamId, newEvent.streamVersionId)
            events.push(newEvent)
            return newEvent
        }

        let newEvent: Event | undefined

        // if a stream versions are provided, check they matches the current version for the referenced stream
        if (streamVersionIds && Object.keys(streamVersionIds).length > 0) {
            await withObjectLock(
                objectLocks,
                Object.keys(streamVersionIds),
                async () => {
                    const mismatchedVersions = Object.entries(
                        streamVersionIds
                    ).reduce<StreamVersionMismatch[]>(
                        (mistmatched, [streamId, versionId]) => {
                            const currentObjectVersionId =
                                streamVersionIndex.get(streamId)

                            if (
                                currentObjectVersionId &&
                                currentObjectVersionId !== versionId
                            ) {
                                mistmatched.push({
                                    streamId,
                                    expectedVersionId: versionId,
                                    actualVersionId: currentObjectVersionId,
                                })
                            }
                            return mistmatched
                        },
                        []
                    )

                    // Do we have any stream version mismatches?
                    if (mismatchedVersions.length > 0) {
                        throw new StreamVersionError(
                            'Version mismatch detected',
                            mismatchedVersions
                        )
                    }

                    newEvent = appendEvent()
                }
            )
        } else {
            newEvent = appendEvent()
        }

        if (!newEvent) {
            throw new Error('Unexpected error occurred. Unable to add event to stream.')
        }

        return Promise.resolve({
            streamId: newEvent.streamId,
            sequencenum: newEvent.sequencenum,
            logdate: new Date(newEvent.meta.date).toISOString(),
            type: newEvent.type,
            streamVersionId: newEvent.streamVersionId,
            data: newEvent.data,
            meta: newEvent.meta,
        })
    }

    // Get all events in the correct squence for replay. minSequenceNumber is inclusive.
    const getEventsInOrder = async (minSequenceNumber?: number) => {
        return Promise.resolve(
            minSequenceNumber !== undefined
                ? events.filter(
                      (event) => event.sequencenum >= minSequenceNumber
                  )
                : events
        )
    }

    const getEventsInOrderStream = async function* (minSequenceNumber = 0) {
        for (const event of events) {
            if (event.sequencenum >= minSequenceNumber) {
                yield event
            }
        }
    }

    const anonymiseEvents = async (streamId: string) => {
        events
            .filter((event) => {
                return event.streamId === streamId
            })
            .forEach((event) => {
                event.meta.piiAnonymised = true
            })

        return Promise.resolve()
    }

    /** Get all events for corresponding stream IDs */
    const getEventsByStreamIds = async (streamIds: string[], type?: string) => {
        return Promise.resolve(
            events.filter((event) => {
                // need to handle those mish mash keys in profileKahuna?
                return (
                    streamIds.includes(event.streamId) &&
                    (type ? event.type === type : true)
                )
            })
        )
    }

    // -1 when the log is empty, matching the postgres eventbase
    const getLatestSequenceNumber = () => {
        return Promise.resolve(
            events.length > 0 ? events[events.length - 1].sequencenum : -1
        )
    }

    return {
        addEvent,
        anonymiseEvents,
        deleteEvent,
        getEventsByStreamIds,
        getEventsInOrder,
        getEventsInOrderStream,
        init,
        reset,
        shutdown,
        updateEventData,
        getLatestSequenceNumber,
    }
}
