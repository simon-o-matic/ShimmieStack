//

export interface UserMeta {
    userAgent: string
    user: any
    date?: number // Here because the Wizard already passes it in. It shouldn't
}

export interface Meta extends UserMeta {
    replay?: boolean
    date: number
    hasPii?: boolean
}

export type PiiFields = string[]
export type TypedEventHandler<EventName, EventType> = (event: TypedEvent<EventName, EventType>) => void
export type EventHandler = (event: Event) => void
export type EventName = string
export type StreamId = string
export type EventData = object

type BaseEvent = {
    streamId: StreamId
    meta: Meta
    sequencenum?: number
    logdate?: string
}

export type Event = BaseEvent & {
    data: EventData,
    type: string
}

export type TypedEvent<EventName, EventType> = BaseEvent & {
    type: EventName
    data: EventType,
}

/**
 * Deprecated type definition without event name -> event type checks for
 * backwards compatibility.
 */
export type TypedEventDep<EventType> = TypedEvent<string, EventType>

// export type TypedEvent<T> = BaseEvent & {
//     data: EventData,
//     type: T
// }

/** What comes back after adding a new event to the event log */
export interface StoredEventResponse {
    sequencenum: number
    logdate: number
    type: string
}

export interface EventBaseType {
    /**  put a new event on the event stream */
    addEvent: (event: Event) => Promise<any>
    /** get all the events from the start to the end (for replay) */
    getAllEventsInOrder: () => Promise<Event[]>
    /** update a single event with new data (no other fields). Protect this in production */
    updateEventData: (sequenceNumber: number, data: object) => Promise<void>
    /** delete a single event by sequence number. Protect this in production */
    deleteEvent: (sequenceNumber: number) => Promise<void>
    /** set up the event base */
    init: () => Promise<void>
    /** clear out all the events */
    reset: () => Promise<void>
    /** clean up any event base */
    shutdown: () => Promise<void>
}

export interface PiiBaseType {
    // record some PII in the PII store
    addPiiEventData(key: string, data: any): Promise<any>

    // get a single pii record if it exists
    getPiiData(key: string): Promise<Record<string, any> | undefined>

    // get all pii records
    getPiiLookup(): Promise<Record<string, any>>

    // prepare the piibase
    init(): Promise<void>

    /** clear out all the data */
    reset: () => Promise<void>

    /** clean up any anything in the pii base */
    shutdown: () => Promise<void>
}
