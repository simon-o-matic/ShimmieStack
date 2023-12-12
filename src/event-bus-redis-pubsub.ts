import { Event, EventBusType, GLOBAL_CHANNEL, StoredEventResponse } from './event'
import EventBusNodejs from './event-bus-nodejs'
import Redis, { RedisOptions } from 'ioredis'
import { Logger, StackLogger } from './logger'
import AsyncLock from 'async-lock'

export interface EventBusRedisPubsubOptions {
    url: string
    subscribe?: boolean
    logger?: StackLogger
    redisOptions?: RedisOptions
    replayFunc?: (seqNum: number) => Promise<number>
    initialised?: boolean
}

export class RedisPubsubError extends Error {
    public errorDetails?: Error

    constructor(
        msg: string,
        errorDetails?: Error,
    ) {
        super(msg)
        this.errorDetails = errorDetails
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, RedisPubsubError.prototype)
    }
}


export default function EventBusRedisPubsub({
                                                url,
                                                redisOptions,
                                                logger,
                                                replayFunc,
                                                subscribe = true,
                                                initialised,
                                            }: EventBusRedisPubsubOptions): EventBusType {
    const pubClient = redisOptions ? new Redis(url, redisOptions) : new Redis(url)
    const subClient = redisOptions ? new Redis(url, redisOptions) : new Redis(url)
    const _logger = logger ?? Logger
    const nodeEventBus: EventBusType = EventBusNodejs({initialised, logger: _logger})

    // ensure we are only replaying
    let replayLock = new AsyncLock()

    if (!replayFunc) {
        throw Error('Unable to initialise a replayer for redis pubsub')
    }

    if (subscribe) {
        subClient.subscribe(GLOBAL_CHANNEL, (err) => {
            if (err) {
                throw new RedisPubsubError(`An error occurred subscribing to redis event bus: ${err.message}`, err)
            }
        })

        subClient.on('message', async (channel, message) => {
            try {
                const event: StoredEventResponse = JSON.parse(message)
                _logger.debug(`${event.sequencenum}: Handling new event via PubSub`)

                // Only process one event at a time.
                // this ensures we don't replay more than once, and don't emit an event more than once.
                // It also ensures we don't miss events if the replay is slow
                _logger.debug(`${event.sequencenum}: Acquiring lock`)
                return await replayLock.acquire('replayLock', async () => {
                    _logger.debug(`${event.sequencenum}: Lock Acquired`)
                    const expectedSeqNum = nodeEventBus.getLastHandledSeqNum() + 1
                    _logger.debug(`${event.sequencenum}: Expected SeqNum: ${expectedSeqNum}`)

                    const eventBusDelay = event.meta.emittedAt ? (Date.now() - event.meta.emittedAt) : undefined
                    if(eventBusDelay !== undefined){
                        _logger.debug(`eventBusDelay: ${{ sequenceNum: event.sequencenum , eventBusDelay }}`)
                    }
                    // if we are ahead of this event, don't do anything.
                    if (event.sequencenum < expectedSeqNum) {
                        _logger.debug(`${event.sequencenum}: Expected SeqNum (${expectedSeqNum}) > event.Seqnum (${event.sequencenum}) skipping`)
                        return
                    }

                    if (event.sequencenum === expectedSeqNum) {
                        _logger.debug(`${event.sequencenum}: Emitting event`)
                        // if we are here, this is the next event. process it.
                        nodeEventBus.emit(event.type, {
                            ...event,
                            meta: {
                                ...event.meta,
                                replay: true, // anything that comes via the redis event bus has been recorded elsewhere, so it will always be a replay here
                                ...(eventBusDelay && { eventBusDelay }),
                            },
                        })
                        _logger.debug(`${event.sequencenum}: Event emitted`)
                        return
                    }

                    _logger.debug(`${event.sequencenum}: Received event out of order, triggering replay`)
                    // if we are here, our local is potentially behind/missing events. Go fetch any missing events.
                    await replayFunc(expectedSeqNum)
                    _logger.debug(`${event.sequencenum}: Replay complete`)
                })

            } catch (e) {
                _logger.warn(`Unable to parse or local emit redis message: ${e}`)
            }
        })
    }

    const emit = (type: string, event: Event | StoredEventResponse): void => {
        if (initialised) {
            _logger.debug(`${event.sequencenum}: Beginning event emit`)
        }
        // don't publish replays globally.
        if (!event.meta.replay) {
            _logger.debug(`${event.sequencenum}: Emitting via PubSub`)
            pubClient.publish(
                GLOBAL_CHANNEL,
                JSON.stringify(
                    {
                        ...event,
                        meta: {
                            ...event.meta,
                            emittedAt: Date.now(),
                        },
                    },
                ),
            )
        }
        if (
            initialised
        ) {
            _logger.debug(`${event.sequencenum}: Emitting locally`)
        }
        nodeEventBus.emit(type, event)
    }

    const on = (type: string, callback: (...args: any[]) => void): void => {
        _logger.debug(`Registering callback for event type ${type}`)
        nodeEventBus.on(type, callback)
    }

    const getLastEmittedSeqNum = () => nodeEventBus.getLastEmittedSeqNum()
    const getLastHandledSeqNum = () => nodeEventBus.getLastHandledSeqNum()


    return {
        emit,
        reset: nodeEventBus.reset,
        on,
        getLastEmittedSeqNum,
        getLastHandledSeqNum,
    }
}