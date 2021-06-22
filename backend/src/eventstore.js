//
// Send events to the database, and tell anyone who is litenening about it
//

import { EventEmitter } from 'events';
import Event from './event.js';

class EventStoreEmitter extends EventEmitter {}

export default function EventStore(eventbase) {
    const eventStoreEmitter = new EventStoreEmitter();

    const recordEvent = async (streamId, eventType, data, meta) => {
        if (!streamId || !eventType || !meta) {
            console.error(
                'EventStore::recorEvent::missing values',
                streamId,
                eventType,
                meta
            );
            throw new Error('Attempt to record bad event data');
        }
        const event = new Event(streamId, eventType, data, meta);
        const rows = await eventbase.addEvent(event); // need to await here to confirm before emitting

        eventStoreEmitter.emit(eventType, event);
        return rows[0];
    };

    const subscribe = (type, cb) => {
        eventStoreEmitter.on(type, cb);
    };

    const getAllEvents = () => {
        return eventbase.getAllEventsInOrder();
    };

    // On startup only re-emit all of the events in the database
    const replayAllEvents = async () => {
        const allEvents = await eventbase.getAllEventsInOrder();

        for (let e of allEvents) {
            // WARNING: These are field names from the database and hence are all LOWERCASE
            const event = new Event(e.streamid, e.type, e.data, e.meta);
            eventStoreEmitter.emit(event.type, event);
        }

        return allEvents.length;
    };

    return {
        replayAllEvents,
        recordEvent,
        subscribe,
        getAllEvents,
    };
}
