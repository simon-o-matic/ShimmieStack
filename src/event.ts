//

import { NodeWorker } from "inspector";

export type Meta = {
    replay: boolean;
    user: any;
    date: number;
    userAgent: string
};

//XXXX
export type EventHandler<T> = (event: Event | T) => void;
export type EventName = string;
export type StreamId = string;
export type EventData = object;

export interface Event {
    streamId: StreamId;
    data: EventData;
    type: string;
    meta: Meta;
};

export type CustomEvent<T> = (input: T) => Event & {meta: T}

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
