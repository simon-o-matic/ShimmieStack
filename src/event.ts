//

export type Meta = {
    username: string;
    userId: string; // can be device id?
};

export type EventHandler = (event: Event) => void;
export type EventName = string;
export type StreamId = string;
export type EventData = object;

export type Event = {
    streamId: StreamId;
    data: EventData;
    type: string;
    meta: Meta;
};

/** What comes back after adding a new event to the event log */
export interface StoredEventResponse {
    sequenceNumber: number;
    logdate: number;
    type: string;
}

export interface EventBase {
    /**  put a new event on the event stream */
    addEvent: (event: Event) => Promise<any>;
    /** get all the events from the start to the end (for replay) */
    getAllEventsInOrder: () => Promise<any>;
    /** set up the event base */
    init: () => Promise<void>;
    /** clear out all the events */
    reset: () => Promise<void>;
    /** clean up any event base */
    shutdown: () => Promise<void>;
}
