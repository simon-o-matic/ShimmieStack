//
// TODO:  move all the datbase features to the eventbase file!
//

import { EventBaseType, Event } from '../event'

export interface AdminCommandsType {
    time: () => string
    reset: () => Promise<void>
    init: () => Promise<void>
    getEvents: () => Promise<Event[]>
    deleteEvent: (sequenceNumber: number) => Promise<void>
    updateEventData: (sequenceNumber: number, data: object) => Promise<void>
}

// @eventbase The admin commands can call the database directly. No other
//            command processors are allowed direct access to it.
//
export default function AdminCommands(
    eventbase: EventBaseType
): AdminCommandsType {
    const init = async () => {
        return await eventbase.init()
    }

    const reset = async () => {
        return await eventbase.reset()
    }

    // Get the server local time
    const time = () => {
        return Date()
    }

    const getEvents = async () => {
        return eventbase.getEventsInOrder()
    }

    const deleteEvent = async (sequenceNumber: number) => {
        return eventbase.deleteEvent(sequenceNumber)
    }

    const updateEventData = async (sequenceNumber: number, data: object) => {
        return eventbase.updateEventData(sequenceNumber, data)
    }

    return { time, reset, init, getEvents, deleteEvent, updateEventData }
}
