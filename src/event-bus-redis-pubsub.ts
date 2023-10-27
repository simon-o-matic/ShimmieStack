import { Event, EventBusType, StoredEventResponse } from './event'
import EventBusNodejs from './event-bus-nodejs'
import Redis, { RedisOptions } from 'ioredis'
import { Logger, StackLogger } from './logger'

export interface RedisPubsubEventBusOptions {
    url: string
    subscribe?: boolean
    logger?: StackLogger
    redisOptions?: RedisOptions
    replayfunc?: (seqNum: number) => Promise<number>
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

const STACK_GLOBAL_CHANNEL = 'STACK_GLOBAL_CHANNEL'

export default function EventBusRedisPubsub({
                                                url,
                                                redisOptions,
                                                logger,
                                                replayfunc,
                                                subscribe = true,
                                            }: RedisPubsubEventBusOptions): EventBusType {
    const nodeEventBus: EventBusType = EventBusNodejs()
    const pubClient = redisOptions ? new Redis(url, redisOptions) : new Redis(url)
    const subClient = redisOptions ? new Redis(url, redisOptions) : new Redis(url)
    const _logger = logger ?? Logger


    if (subscribe) {
        subClient.subscribe(STACK_GLOBAL_CHANNEL, (err) => {
            if (err) {
                throw new RedisPubsubError(`An error occurred subscribing to redis event bus: ${err.message}`, err)
            }
        })

        subClient.on('message', async (channel, message) => {
            try {
                const event: StoredEventResponse = JSON.parse(message)
                // if no events processed, then this one is fine to start on.
                const expectedSeqNum = nodeEventBus.getLastHandledSeqNum() !== -1 ?
                    nodeEventBus.getLastHandledSeqNum() + 1 :
                    event.sequencenum

                // if we are ahead of this event, don't do anything.
                if (event.sequencenum < expectedSeqNum) {
                    return
                }

                if (event.sequencenum === expectedSeqNum) {
                    // if we are here, this is the next event. process it.
                    nodeEventBus.emit(event.type, {
                        ...event,
                        meta: {
                            ...event.meta,
                            replay: true, // anything that comes via the redis event bus has been recorded elsewhere, so it will always be a replay here
                            eventBusDelay: Date.now() - event.meta.date
                        }
                    })
                    return
                }

                if(!replayfunc){
                    logger?.error("Received unexpected sequence number, and no replay function")
                    return
                }

                // if we are here, our local is potentially behind/missing events. Go fetch any missing events.
                await replayfunc(expectedSeqNum)

            } catch (e) {
                _logger.warn(`Unable to parse or local emit redis message: ${e}`)
            }
        })
    }

    const emit = (type: string, event: Event | StoredEventResponse): void => {
        // don't publish replays globally.
        if(!event.meta.replay){
            pubClient.publish(STACK_GLOBAL_CHANNEL, JSON.stringify(event))
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
        reset: nodeEventBus.reset,
        on,
        getLastEmittedSeqNum,
        getLastHandledSeqNum,
    }
}