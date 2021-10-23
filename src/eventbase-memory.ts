//
// An in-memory version of the event base. This is used for testing. No
// events survive a restart of the server.
//
import { Event, EventBaseType, StoredEventResponse } from './event';

export default function Eventbase(): EventBaseType {
    const events: Array<Event> = [];

    const init = () => {
        return Promise.resolve();
    };
    const shutdown = () => {
        return Promise.resolve();
    };
    const reset = () => {
        events.length = 0;
        return Promise.resolve();
    };

    const addEvent = async (event: Event): Promise<StoredEventResponse> => {
        // TODO: deal with meta?
        events.push(event);

        return Promise.resolve({
            sequenceNumber: events.length - 1,
            logdate: Date.now(),
            type: event.type,
        });
    };

    // Get all events in the correct squence for replay
    const getAllEventsInOrder = () => {
        return Promise.resolve(events);
    };

    return {
        addEvent,
        getAllEventsInOrder,
        init,
        reset,
        shutdown,
    };
}
