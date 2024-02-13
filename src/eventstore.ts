//
// Send events to the database, and tell anyone who is litenening about it
//

import { v4 as uuid } from 'uuid'
import {
    Event,
    EventBaseType,
    EventBusOptions,
    EventToRecord,
    PiiBaseType,
    StoredEventResponse,
    TypedEvent,
    TypedEventHandler,
} from './event'
import EventBusNodejs from './event-bus-nodejs'
import EventBusRedisPubsub from './event-bus-redis-pubsub'
import { EventHistory, RecordEventType } from './index'
import { Logger, StackLogger } from './logger'

export interface EventStoreType<
    RecordModels extends Record<string, any>,
    SubscribeModels extends Record<string, any>
> {
    replayEvents: (minSequenceNumber?: number) => Promise<number>
    recordEvent: <EventName extends keyof RecordModels>(
        event: RecordEventType<RecordModels, EventName>
    ) => Promise<any>
    subscribe: <EventName extends keyof SubscribeModels>(
        type: EventName,
        callback: TypedEventHandler<EventName, SubscribeModels[EventName]>
    ) => void
    deleteEvent: (sequenceNumber: number) => void
    updateEventData: (sequenceNumber: number, data: object) => void
    getEvents: (options?: {
        withPii?: boolean
        minSequenceNumber?: number
    }) => Promise<any>
    getLastEmittedSeqNum: () => number
    getLastHandledSeqNum: () => number
    anonymiseStreamPii: (streamId: string) => Promise<void>
    getStreamHistory: (
        streamIds: string[]
    ) => Promise<EventHistory<SubscribeModels>[]>
    reset: () => Promise<void>
}

export default function EventStore<
    RecordModels extends Record<string, any>,
    SubscribeModels extends Record<string, any>
>({
    eventbase,
    piiBase,
    eventBusOptions,
    options,
}: {
    eventbase: EventBaseType
    piiBase?: PiiBaseType
    eventBusOptions?: EventBusOptions
    options: { initialised: boolean; logger?: StackLogger }
}): EventStoreType<RecordModels, SubscribeModels> {
    const allSubscriptions = new Map<string, boolean>()
    const _logger = options?.logger ?? Logger
    const recordEvent = async <EventName extends keyof RecordModels>({
        streamId,
        eventName,
        eventData,
        meta,
        streamVersionIds,
        piiFields,
    }: RecordEventType<RecordModels, EventName>) => {
        if (!streamId || !eventName || !meta) {
            _logger.error(
                `EventStore::recordEvent::missing values ${{
                    streamId,
                    eventName,
                    meta: meta,
                }}`
            )
            throw new Error('Attempt to record bad event data')
        }

        const eventDate = meta.date || Date.now()
        _logger.debug(
            `Executing recordEvent: ${JSON.stringify({
                streamId,
                eventName,
                eventDate,
            })}`
        )

        // if we have any pii, make a pii key
        const hasPii: boolean = !!piiFields

        if (hasPii && !piiBase) {
            _logger.warn('Pii key provided without a PiiBase defined')
            throw new Error(
                'You must configure a PII base to store PII outside the event stream'
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
        const streamVersionsToCheck:
            | Record<string, string | undefined>
            | undefined =
            streamVersionIds !== 'STREAM_VERSIONING_DISABLED'
                ? streamVersionIds
                : undefined

        // need to await here to confirm before emitting just in case
        // todo handle event success and pii failure 2 phase write
        let storedEvent: StoredEventResponse = await eventbase.addEvent(
            { ...newEvent },
            streamVersionsToCheck
        ) // destructing object for deep copy

        storedEvent = {
            ...newEvent,
            data: {
                ...newEvent.data,
                ...piiData,
            },
            sequencenum: storedEvent.sequencenum,
        }

        if (hasPii && piiBase) {
            // get the stringified sequenceNum from the event stream and use it as the key for the pii row
            const piiKey: string = storedEvent.sequencenum.toString()

            // store the pii in the piiBase
            piiData = await piiBase.addPiiEventData(piiKey, piiData)
        }

        if (!allSubscriptions.get(String(eventName))) {
            _logger.warn(
                `ShimmieStack >>>> Event ${String(eventName)} has no listeners`
            )
        }

        stackEventBus.emit(String(eventName), storedEvent)

        return storedEvent
    }

    // event name needs to be an input and a generic here as we use the event name as a type index and as a string value
    const subscribe = <EventName extends keyof SubscribeModels>(
        type: EventName,
        callback: (
            event: TypedEvent<EventName, SubscribeModels[EventName]>
        ) => void
    ): void => {
        // wrap the handler in a try catch so we don't crash the server with unhandled exceptions.
        const tryCatchCallback: (
            event: TypedEvent<EventName, SubscribeModels[EventName]>
        ) => void = (
            eventModel: TypedEvent<EventName, SubscribeModels[EventName]>
        ): void => {
            try {
                return callback(eventModel)
            } catch (e) {
                _logger.error(
                    `Unable to handle event subscription. Error when handling "${String(
                        eventModel.type
                    )}": ${e}`
                )
                if (options.initialised === false) {
                    throw e
                }
            }
        }

        allSubscriptions.set(String(type), true) // record for later
        stackEventBus.on(String(type), tryCatchCallback)
    }

    const getEvents = async (options?: {
        withPii?: boolean
        minSequenceNumber?: number
    }) => {
        const { withPii, minSequenceNumber } = options ?? { withPii: true }
        _logger.debug(`Executing getEvents events ${JSON.stringify(options)}`)
        const events: Event[] = await eventbase.getEventsInOrder(
            minSequenceNumber
        )

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
    const replayEvents = async (
        minSequenceNumber?: number
    ): Promise<number> => {
        _logger.debug(
            `Executing replayEvents events ${JSON.stringify(options)}`
        )
        const allEvents: Event[] = await getEvents({
            withPii: false,
            minSequenceNumber,
        })

        // get all the events WITHOUT Pii, so we don't iterate them twice.
        let piiLookup: Record<string, any> | undefined

        // if we have a pii db, get all the pii for re-populating the emitted events
        if (piiBase) {
            piiLookup = await piiBase.getPiiLookup()
        }

        _logger.debug(`Replaying ${allEvents.length} events.`)
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
            const streamVersionId =
                'streamversionid' in e
                    ? (e.streamversionid as string)
                    : e.streamVersionId ?? `${streamId}-${e.sequencenum}`

            // WARNING: These are field names from the database and hence are all LOWERCASE
            const event: Event = {
                data,
                streamId,
                meta,
                type: e.type,
                streamVersionId,
                sequencenum: e.sequencenum,
            }
            if (!!options.initialised) {
                _logger.debug(`Replaying event: ${event.sequencenum}`)
            }
            stackEventBus.emit(event.type, event)
        }

        _logger.debug(`Replayed ${allEvents.length} events.`)
        return allEvents.length
    }

    const getStreamHistory = async (
        streamIds: string[]
    ): Promise<EventHistory<SubscribeModels>[]> => {
        const events = await eventbase.getEventsByStreamIds(streamIds)
        if (events === undefined) {
            return []
        }

        const seqNums = events.map((event) => event.sequencenum.toString())
        const piiLookup = piiBase
            ? await piiBase.getPiiLookup(seqNums)
            : undefined

        return events.map((event) => {
            let piiData: Record<string, any> | undefined
            if (event.meta.hasPii && piiLookup) {
                piiData = piiLookup[event.sequencenum.toString()]
            }

            // merge with pii if there is any
            const data = {
                ...event.data,
                ...(piiData ? piiData : {}),
            }

            return {
                streamId: event.streamId,
                data: data as SubscribeModels[keyof SubscribeModels],
                type: event.type,
                date: event.meta.date,
                user: event.meta.user,
            }
        })
    }

    const deleteEvent = async (sequenceNumber: number) =>
        await eventbase.deleteEvent(sequenceNumber)
    const updateEventData = async (sequenceNumber: number, data: object) =>
        await eventbase.updateEventData(sequenceNumber, data)

    const reset = async () => {
        await eventbase.reset()
        piiBase && (await piiBase.reset())
        stackEventBus.reset()
    }

    const stackEventBus = eventBusOptions
        ? EventBusRedisPubsub({
              ...eventBusOptions,
              replayFunc: eventBusOptions.replayFunc ?? replayEvents,
          })
        : EventBusNodejs({
              options: { initialised: !!options.initialised },
          })

    const getLastEmittedSeqNum = () => stackEventBus.getLastEmittedSeqNum()
    const getLastHandledSeqNum = () => stackEventBus.getLastHandledSeqNum()

    const anonymiseStreamPii = async (streamId: string): Promise<void> => {
        _logger.info(`Attempting to anonymise data for streamId: ${streamId}`)
        if (!piiBase) {
            throw Error('Unable to anonymise pii, no PiiBase to update')
        }

        const streamEvents: Event[] | undefined =
            await eventbase.getEventsByStreamIds([streamId])

        const piiSequenceNumbers = streamEvents
            ?.filter((e) => e.meta.hasPii)
            .map((e: Event) => e.sequencenum.toString())

        if (
            !streamEvents ||
            !piiSequenceNumbers ||
            piiSequenceNumbers?.length === 0
        ) {
            _logger.info(
                `No events found for streamId: ${streamId}. Nothing to anonymise`
            )
            return Promise.resolve()
        }

        _logger.info(
            `Found pii for ${piiSequenceNumbers.length} events to anonymise for streamId: ${streamId}`
        )

        // update the meta of the corresponding events
        await eventbase.anonymiseEvents(streamId)

        // update the pii data
        return await piiBase.anonymisePiiEventData(piiSequenceNumbers)
    }

    return {
        anonymiseStreamPii,
        reset,
        replayEvents,
        recordEvent,
        subscribe,
        getEvents,
        deleteEvent,
        updateEventData,
        getLastEmittedSeqNum,
        getLastHandledSeqNum,
        getStreamHistory,
    }
}
