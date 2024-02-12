//

import { EventBusRedisPubsubOptions } from './event-bus-redis-pubsub'

export interface UserMeta {
    userAgent: string
    user: any
    date?: number // Here because the Wizard already passes it in. It shouldn't
}

export interface Meta extends UserMeta {
    replay?: boolean
    date: number
    hasPii?: boolean
    emittedAt?: number
    eventBusDelayMs?: number
}

export type PiiFields = string[]
export type TypedEventHandler<EventName, EventType> = (
    event: TypedEvent<EventName, EventType>
) => void
export type EventHandler = (event: Event) => void

type BaseEvent = {
    streamId: string // a unique identifier for all related events
    streamVersionId: string // a version id for the object the stream represents
    meta: Meta // the metadata associated with this event
    sequencenum: number // the ordered event number
    logdate?: string // when was the event logged
}

export type EventToRecord = Omit<Event, 'sequencenum'>

export const WILDCARD_TYPE = '*'
export const GLOBAL_CHANNEL = 'STACK_GLOBAL'

export type Event = BaseEvent & {
    data: object
    type: string
}

export type TypedEvent<EventName, EventType> = BaseEvent & {
    type: EventName
    data: EventType
}

/**
 * Deprecated type definition without event name -> event type checks for
 * backwards compatibility.
 */
export type TypedEventDep<EventType> = TypedEvent<string, EventType>

/** What comes back after adding a new event to the event log */
export type StoredEventResponse<EventName = string, EventType = any> =
    | TypedEvent<EventName, EventType>
    | Event

/**
 * The interface event buses must match to be used as a drop in
 */
export interface EventBusType {
    on: (type: string, callback: (...args: any[]) => void) => void
    emit: (type: string, event: Event) => void
    getLastEmittedSeqNum: () => number
    getLastHandledSeqNum: () => number
    reset: () => void
}

export type EventBusOptions = EventBusRedisPubsubOptions

/**  The error type thrown when object versions don't match */
export class StreamVersionError extends Error {
    public details: StreamVersionMismatch[]
    constructor(msg: string, details: StreamVersionMismatch[]) {
        super(msg)
        this.details = details
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, StreamVersionError.prototype)
    }
}

/**  The error type thrown when object versions don't match */
export class ObjectLockedError extends Error {
    constructor(msg: string) {
        super(msg)
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, ObjectLockedError.prototype)
    }
}

/**  The details of a stream version mismatch */
export interface StreamVersionMismatch {
    streamId: string
    expectedVersionId: string | undefined
    actualVersionId: string
}

export interface EventBaseType {
    /**  put a new event on the event stream */
    addEvent: (
        event: EventToRecord,
        streamVersionIds?: Record<string, string | undefined>
    ) => Promise<StoredEventResponse>
    /** get events from the start to the end (for replay) optionally provide a starting point */
    getEventsInOrder: (minSequenceNumber?: number) => Promise<Event[]>
    /** Get all events for corresponding stream IDs */
    getEventsByStreamIds: (streamIds: string[]) => Promise<Event[] | undefined>
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
    /** record some PII in the PII store */
    addPiiEventData: (key: string, data: any) => Promise<any>
    /** get a single pii record if it exists */
    getPiiData: (key: string) => Promise<Record<string, any> | undefined>
    /** get all pii records */
    getPiiLookup: () => Promise<Record<string, any>>
    /** anonymise data in rows with the provided keys */
    anonymisePiiEventData: (keys: string[]) => Promise<void>
    /**  prepare the piibase */
    init: () => Promise<void>
    /** clear out all the data */
    reset: () => Promise<void>
    /** clean up any anything in the pii base */
    shutdown: () => Promise<void>
}
