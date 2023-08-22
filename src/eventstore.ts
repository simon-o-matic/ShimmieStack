//
// Send events to the database, and tell anyone who is litenening about it
//

import { EventEmitter } from 'events'
import { Event, EventBaseType, EventToRecord, PiiBaseType, TypedEvent, TypedEventHandler } from './event'
import { Logger } from './logger'
import { v4 as uuid } from 'uuid'
import { RecordEventType } from './index'

export interface EventStoreType<RecordModels extends Record<string, any>, SubscribeModels extends Record<string, any>> {
    replayAllEvents: () => Promise<number>
    recordEvent: <EventName extends keyof RecordModels>(
        event: RecordEventType<RecordModels, EventName>,
    ) => Promise<any>
    subscribe: <EventName extends keyof SubscribeModels> (
        type: EventName,
        callback: TypedEventHandler<EventName, SubscribeModels[EventName]>,
    ) => void
    deleteEvent: (sequenceNumber: number) => void
    updateEventData: (sequenceNumber: number, data: object) => void
    getAllEvents: (withPii?: boolean) => Promise<any>
}

export default function EventStore<
    RecordModels extends Record<string, any>,
    SubscribeModels extends Record<string, any>
>(
    eventbase: EventBaseType,
    piiBase?: PiiBaseType,
    options?: { initialised: boolean },
): EventStoreType<RecordModels, SubscribeModels> {
    const eventStoreEmitter = new EventEmitter()
    const allSubscriptions = new Map<string, boolean>()

    const recordEvent = async <EventName extends keyof RecordModels>(
        {
            streamId,
            eventName,
            eventData,
            meta,
            streamVersionIds,
            piiFields,
        }: RecordEventType<RecordModels, EventName>) => {
        if (!streamId || !eventName || !meta) {
            Logger.error(
                `EventStore::recordEvent::missing values ${{
                    streamId,
                    eventName,
                    meta: meta,
                }}`,
            )
            throw new Error('Attempt to record bad event data')
        }

        // if we have any pii, make a pii key
        const hasPii: boolean = !!piiFields

        if (hasPii && !piiBase) {
            Logger.warn('Pii key provided without a PiiBase defined')
            throw new Error(
                'You must configure a PII base to store PII outside the event stream',
            )
        }

        let piiData: Record<string, any> = {}
        let nonPiiData: Record<string, any> = {}

        if (hasPii && eventData) {
            Object.keys(eventData).map((key) => {
                if (piiFields?.includes(key)) {
                    piiData[key] = (eventData as any)[key] // collect PII into an object,
                } else {
                    nonPiiData[key] = (eventData as any)[key] // collect non PII into an object,
                }
            })
        } else {
            nonPiiData = eventData as Record<string, any>
        }

        const newEvent: EventToRecord = {
            data: nonPiiData, // make sure if we have marked any data as pii, its not stored in the event stream
            streamId: streamId,
            streamVersionId: uuid(),
            meta: {
                ...meta,
                replay: false,
                hasPii,
                date: meta.date || Date.now(), // should be calculated here. Sometimes passed in so let that be
            },
            type: String(eventName),
        }

        // if explicitly passed 'STREAM_VERSIONING_DISABLED' dont check versions, otherwise compare to the passed in values.
        const streamVersionsToCheck: Record<string, string|undefined> | undefined = streamVersionIds !== 'STREAM_VERSIONING_DISABLED' ? streamVersionIds : undefined

        // need to await here to confirm before emitting just in case
        // todo handle event success and pii failure 2 phase write
        let rows = await eventbase.addEvent({ ...newEvent }, streamVersionsToCheck) // destructing object for deep copy

        if (hasPii && piiBase) {
            // get the stringified sequenceNum from the event stream and use it as the key for the pii row
            const piiKey: string = (rows[0] as Event).sequencenum!.toString()

            // store the pii in the piiBase
            piiData = await piiBase.addPiiEventData(piiKey, piiData)

            newEvent.data = {
                ...newEvent.data,
                ...piiData,
            } // make sure the emited events contain the PII
        }

        if (!allSubscriptions.get(String(eventName))) {
            Logger.warn(`ShimmieStack >>>> Event ${String(eventName)} has no listeners`)
        }

        eventStoreEmitter.emit(String(eventName), newEvent)
        eventStoreEmitter.emit('*', {
            ...newEvent,
        })
        return rows[0]
    }

    // event name needs to be an input and a generic here as we use the event name as a type index and as a string value
    const subscribe = <EventName extends keyof SubscribeModels>(
        type: EventName,
        callback: (event: TypedEvent<EventName, SubscribeModels[EventName]>) => void
    ): void => {
        // wrap the handler in a try catch so we don't crash the server with unhandled exceptions.
        const tryCatchCallback: (event: TypedEvent<EventName, SubscribeModels[EventName]>) => void = (
            eventModel: TypedEvent<EventName, SubscribeModels[EventName]>
        ): void => {
            try {
                return callback(eventModel)
            } catch (e) {
                Logger.error(`Unable to handle event subscription. Error when handling "${String(eventModel.type)}": ${e}`)
                if(options?.initialised === false){
                    throw e
                }
            }
        }

        allSubscriptions.set(String(type), true) // record for later
        eventStoreEmitter.on(String(type), tryCatchCallback)
    }

    const getAllEvents = async (withPii = true) => {
        const events: Event[] = await eventbase.getAllEventsInOrder()

        // If we don't use a pii db, or we don't want the pii with the db return the events
        if (!withPii || !piiBase) {
            return events
        }

        // if we want pii and we have a pii db, combine the event data
        const piiLookup: Record<string, any> = await piiBase.getPiiLookup()
        return events.map((event) => {
            const piiKey = event.sequencenum!.toString()
            if (!piiLookup.has(piiKey)) {
                return event
            }

            const piiData: Record<string, any> = piiLookup.get(piiKey)
            return {
                ...event,
                data: {
                    ...event.data,
                    ...piiData,
                },
            }
        })
    }

    // On startup only re-emit all of the events in the database
    const replayAllEvents = async (): Promise<number> => {
        const allEvents: Event[] = await getAllEvents(false) // get all the events WITHOUT Pii, so we don't iterate them twice.
        let piiLookup: Record<string, any> | undefined

        // if we have a pii db, get all the pii for re-populating the emitted events
        if (piiBase) {
            piiLookup = await piiBase.getPiiLookup()
        }

        for (let e of allEvents) {
            let data = e.data

            // We may have a case with a key and the lookup without a value, if the value has been deleted from the piiBase
            // so if we have pii in this event, the piiLookup is defined and we a record in the lookup for this event, using
            // the sequence num as a key merge the non-pii and pii data so the caller gets back what they provided
            if (
                e.meta.hasPii &&
                piiLookup &&
                e.sequencenum &&
                e.sequencenum in piiLookup
            ) {
                data = {
                    ...data,
                    ...piiLookup[e.sequencenum.toString()],
                }
            }

            // if there is no date in the meta then we can use the logdate col from the db
            const meta = { ...e.meta, replay: true }
            if (!meta.date) {
                meta.date = e.logdate ? new Date(e.logdate).getTime() : 0
            }

            // fix some casing issues
            const streamId = e.streamId ?? (e as any)?.streamid

            // handle old versionless events
            const streamVersionId =  e.streamVersionId ?? `${streamId}-${e.sequencenum}`

            // WARNING: These are field names from the database and hence are all LOWERCASE
            const event: Event = {
                data,
                streamId,
                meta,
                type: e.type,
                streamVersionId,
                sequencenum: e.sequencenum
            }

            eventStoreEmitter.emit(event.type, {
                ...event,
            })
            eventStoreEmitter.emit('*', {
                ...event,
            })
        }

        return allEvents.length
    }

    const deleteEvent = async (sequenceNumber: number) =>
        await eventbase.deleteEvent(sequenceNumber)
    const updateEventData = async (sequenceNumber: number, data: object) =>
        await eventbase.updateEventData(sequenceNumber, data)

    return {
        replayAllEvents,
        recordEvent,
        subscribe,
        getAllEvents,
        deleteEvent,
        updateEventData,
    }
}
