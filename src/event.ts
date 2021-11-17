//

export type Meta = {
    replay: boolean;
    user: any;
    date: number;
    userAgent: string;
    hasPii?: boolean;
};

export type PiiFields = Set<string>;
export type EventHandler = (event: Event) => void;
export type EventName = string;
export type StreamId = string;
export type EventData = object;

export type Event = {
    streamId: StreamId;
    data: EventData;
    type: string;
    meta: Meta;
    SequenceNum?: number;
};

/** What comes back after adding a new event to the event log */
export interface StoredEventResponse {
    sequenceNumber: number;
    logdate: number;
    type: string;
}

export interface EventBaseType {
    /**  put a new event on the event stream */
    addEvent: (event: Event) => Promise<any>;
    /** get all the events from the start to the end (for replay) */
    getAllEventsInOrder: () => Promise<Event[]>;
    /** set up the event base */
    init: () => Promise<void>;
    /** clear out all the events */
    reset: () => Promise<void>;
    /** clean up any event base */
    shutdown: () => Promise<void>;
}

export interface PiiBaseType {
    init(): Promise<void>

    // record some PII in the PII store
    recordEvent(key: string, data: any): Promise<any>

    // get all pii records
    getPiiLookup(): Promise<Record<string,any>>
}