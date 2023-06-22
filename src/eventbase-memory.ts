//
// An in-memory version of the event base. This is used for testing. No
// events survive a restart of the server.
//
import { Event, EventBaseType, EventToRecord, StoredEventResponse } from './event'

export default function Eventbase(): EventBaseType {
    const events: Array<Event> = []

    const init = () => {
        return Promise.resolve()
    }
    const shutdown = () => {
        return Promise.resolve()
    }
    const reset = () => {
        events.length = 0
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

    const addEvent = async (event: EventToRecord): Promise<StoredEventResponse[]> => {
        const newEvent: Event = {
            ...event,
            sequencenum: events.length
        }

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
