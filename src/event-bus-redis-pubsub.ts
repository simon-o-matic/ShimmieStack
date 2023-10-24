import { Event, EventBusType, StoredEventResponse } from './event'
import EventBusNodejs from './event-bus-nodejs'
import Redis, { RedisOptions } from 'ioredis'
import { Logger, StackLogger } from './logger'

export interface RedisPubsubEventBusOptions {
    url: string
    channel?: string
    subscribe?: boolean
    logger?: StackLogger
    redisOptions?: RedisOptions
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

const GLOBAL_CHANNEL = 'STACK_GLOBAL'

export default function EventBusRedisPubsub({
                                                url,
                                                redisOptions,
                                                logger,
                                                subscribe = true,
                                            }: RedisPubsubEventBusOptions): EventBusType {
    const nodeEventBus: EventBusType = EventBusNodejs()
    const pubClient = redisOptions ? new Redis(url, redisOptions) : new Redis(url)
    const subClient = redisOptions ? new Redis(url, redisOptions) : new Redis(url)
    const _logger = logger ?? Logger

    if (subscribe) {
        subClient.subscribe(GLOBAL_CHANNEL, (err, count) => {
            if (err) {
                throw new RedisPubsubError(`An error occurred subscribing to redis event bus: ${err.message}`, err)
            }
        })

        subClient.on('message', (channel, message) => {
            try {
                const event: StoredEventResponse = JSON.parse(message)
                nodeEventBus.emit(event.type, {
                    ...event,
                    meta: {
                        ...event.meta,
                        replay: true, // anything that comes via the redis event bus has been recorded elsewhere, so it will always be a replay here
                        eventBusDelay:  Date.now() - event.meta.date
                    }
                })
            } catch (e) {
                _logger.warn(`Unable to parse or local emit redis message: ${e}`)
            }
        })
    }

    const emit = (type: string, event: Event | StoredEventResponse): void => {
        // don't publish replays globally.
        if(!event.meta.replay){
            pubClient.publish(GLOBAL_CHANNEL, JSON.stringify(event))
        }
        nodeEventBus.emit(type, event)
    }

    const on = (type: string, callback: (...args: any[]) => void): void => {
        nodeEventBus.on(type, callback)
    }

    const getLastEmittedSeqNum = () => nodeEventBus.getLastEmittedSeqNum()
    const getLastHandledSeqNum = () => nodeEventBus.getLastHandledSeqNum()

    return {
        emit,
        on,
        getLastEmittedSeqNum,
        getLastHandledSeqNum,
    }
}