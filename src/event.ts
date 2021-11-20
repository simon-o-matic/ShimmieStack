//

export type Meta = {
    replay: boolean;
    user: any;
    date: number;
    userAgent: string;
    hasPii?: boolean;
};

export type PiiFields = string[];
export type EventHandler = (event: Event) => void;
export type EventName = string;
export type StreamId = string;
export type EventData = object;

export type Event = {
    streamId: StreamId;
    data: EventData;
    type: string;
    meta: Meta;
    sequencenum?: number;
};

/** What comes back after adding a new event to the event log */
export interface StoredEventResponse {
    sequencenum: number;
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

    // record some PII in the PII store
    addPiiEventData(key: string, data: any): Promise<any>

    // get a single pii record if it exists
    getPiiData(key: string): Promise<Record<string,any> | undefined>
    
    // get all pii records
    getPiiLookup(): Promise<Record<string,any>>

    // prepare the piibase
    init(): Promise<void>

    /** clear out all the data */
    reset: () => Promise<void>;

    /** clean up any anything in the pii base */
    shutdown: () => Promise<void>;
}