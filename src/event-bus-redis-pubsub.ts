import { Event, EventBusType, StoredEventResponse } from './event'
import EventBusNodejs from './event-bus-nodejs'
import Redis, { RedisOptions } from 'ioredis'
import { Logger, StackLogger } from './logger'
import AsyncLock  from 'async-lock'

export interface EventBusRedisPubsubOptions {
    url: string
    subscribe?: boolean
    logger?: StackLogger
    redisOptions?: RedisOptions
    replayFunc?: (seqNum: number) => Promise<number>
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
                                                replayFunc,
                                                subscribe = true,
                                            }: EventBusRedisPubsubOptions): EventBusType {
    const nodeEventBus: EventBusType = EventBusNodejs()
    const pubClient = redisOptions ? new Redis(url, redisOptions) : new Redis(url)
    const subClient = redisOptions ? new Redis(url, redisOptions) : new Redis(url)
    const _logger = logger ?? Logger

    // ensure we are only replaying
    let replayLock = new AsyncLock();

    if(!replayFunc){
        throw Error("Unable to initialise a replayer for redis pubsub")
    }

    const _replayFunc = async (seqNum: number) => {
        await replayLock.acquire('replayLock' ,async () => {
            return await replayFunc(seqNum)
        })
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

                // don't process the event during a replay. Wait 100ms (async) to see if the replay is done.
                // this ensures we don't replay more than once, and we don't miss events if the replay is slow
                while(replayLock.isBusy('replayLock')){
                    await new Promise(r => setTimeout(r, 100));
                }

                const expectedSeqNum = nodeEventBus.getLastHandledSeqNum() + 1

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
                            ...(event.meta.emittedAt && { eventBusDelay: Date.now() - event.meta.emittedAt })
                        }
                    })
                    return
                }

                // if we are here, our local is potentially behind/missing events. Go fetch any missing events.
                await _replayFunc(expectedSeqNum)

            } catch (e) {
                _logger.warn(`Unable to parse or local emit redis message: ${e}`)
            }
        })
    }

    const emit = (type: string, event: Event | StoredEventResponse): void => {
        // don't publish replays globally.
        if(!event.meta.replay){

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