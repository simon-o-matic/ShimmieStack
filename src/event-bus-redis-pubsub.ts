import AsyncLock from 'async-lock'
import Redis, { RedisOptions } from 'ioredis'
import {
    Event,
    EventBusType,
    GLOBAL_CHANNEL,
    StoredEventResponse,
} from './event'
import EventBusNodejs from './event-bus-nodejs'
import { Logger, StackLogger } from './logger'

export interface EventBusRedisPubsubOptions {
    url: string
    subscribe?: boolean
    logger?: StackLogger
    redisOptions?: RedisOptions
    replayFunc?: (seqNum: number) => Promise<number>
    options?: { initialised: boolean }
}

export class RedisPubsubError extends Error {
    public errorDetails?: Error

    constructor(msg: string, errorDetails?: Error) {
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
    options,
}: EventBusRedisPubsubOptions): EventBusType {
    const pubClient = redisOptions
        ? new Redis(url, redisOptions)
        : new Redis(url)
    const subClient = redisOptions
        ? new Redis(url, redisOptions)
        : new Redis(url)
    const _logger = logger ?? Logger
    const nodeEventBus: EventBusType = EventBusNodejs({
        options,
        logger: _logger,
    })

    // ensure only one replay at a time
    let replayLock = new AsyncLock()

    if (!replayFunc) {
        throw Error('Unable to initialise a replayer for redis pubsub')
    }

    if (subscribe) {
        subClient.subscribe(GLOBAL_CHANNEL, (err) => {
            if (err) {
                throw new RedisPubsubError(
                    `An error occurred subscribing to redis event bus: ${err.message}`,
                    err
                )
            }
        })

        subClient.on('message', async (channel, message) => {
            if (!options?.initialised) {
                _logger.debug(
                    `Message received via PubSub before app initialised.`
                )
                return
            }
            try {
                const event: StoredEventResponse = JSON.parse(message)
                _logger.debug(
                    `${event.sequencenum}: Handling new event via PubSub`
                )

                // Only process one event at a time.
                // this ensures we don't replay more than once, and don't emit an event more than once.
                // It also ensures we don't miss events if the replay is slow
                _logger.debug(`${event.sequencenum}: Acquiring lock`)
                return await replayLock.acquire('replayLock', async () => {
                    _logger.debug(`${event.sequencenum}: Lock Acquired`)
                    const expectedSeqNum =
                        nodeEventBus.getLastHandledSeqNum() + 1
                    _logger.debug(
                        `${event.sequencenum}: Expected SeqNum: ${expectedSeqNum}`
                    )

                    const eventBusDelayMs = event.meta.emittedAt
                        ? Date.now() - event.meta.emittedAt
                        : undefined
                    if (eventBusDelayMs !== undefined) {
                        _logger.debug(
                            `eventBusDelayMs: ${eventBusDelayMs.toString()}`,
                            {
                                sequenceNum: event.sequencenum,
                                eventBusDelay: eventBusDelayMs,
                            }
                        )
                    }
                    // if we are ahead of this event, don't do anything.
                    if (event.sequencenum < expectedSeqNum) {
                        _logger.debug(
                            `${event.sequencenum}: Expected SeqNum (${expectedSeqNum}) > event.Seqnum (${event.sequencenum}) skipping`
                        )
                        return
                    }

                    if (event.sequencenum === expectedSeqNum) {
                        _logger.debug(`${event.sequencenum}: Emitting event`)
                        // if we are here, this is the next event. process it.
                        await nodeEventBus.emit(event.type, {
                            ...event,
                            meta: {
                                ...event.meta,
                                replay: true, // anything that comes via the redis event bus has been recorded elsewhere, so it will always be a replay here
                                ...(eventBusDelayMs && {
                                    eventBusDelay: eventBusDelayMs,
                                }),
                            },
                        })
                        _logger.debug(`${event.sequencenum}: Event emitted`)
                        return
                    }

                    _logger.debug(
                        `${event.sequencenum}: Received event out of order, triggering replay`
                    )
                    // if we are here, our local is potentially behind/missing events. Go fetch any missing events.
                    await replayFunc(expectedSeqNum)
                    _logger.debug(`${event.sequencenum}: Replay complete`)
                })
            } catch (e) {
                _logger.warn(
                    `Unable to parse or local emit redis message: ${e}`
                )
            }
        })
    }

    const emit = async (type: string, event: Event | StoredEventResponse): Promise<void> => {
        if (!!options?.initialised) {
            _logger.debug(`${event.sequencenum}: Beginning event emit`)
        }
        // don't publish replays globally.
        if (!event.meta.replay) {
            _logger.debug(`${event.sequencenum}: Emitting via PubSub`)
            pubClient.publish(
                GLOBAL_CHANNEL,
                JSON.stringify({
                    ...event,
                    meta: {
                        ...event.meta,
                        emittedAt: Date.now(),
                    },
                })
            ).catch((reason) => {
                Logger.error("Unable to publish event via redis pub client", reason)
            })
        }
        if (!!options?.initialised) {
            _logger.debug(`${event.sequencenum}: Emitting locally`)
        }
        await nodeEventBus.emit(type, event)
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
        init: nodeEventBus.init,
        on,
        getLastEmittedSeqNum,
        getLastHandledSeqNum,
    }
}
