import { Event, EventBusType, StoredEventResponse, WILDCARD_TYPE } from './event'
import { Logger, StackLogger } from './logger'

export interface EventBusNodejsOptions {
    logger?: StackLogger
    initialised?: boolean
}

export default function EventBusNodejs(options?: EventBusNodejsOptions): EventBusType {
    const initialised = !!options?.initialised
    let lastEmittedSeqNum: number = -1
    let lastHandledSeqNum: number = -1
    const callbackLookup: Map<string, ((...args: any[]) => void)[]> = new Map()
    const _logger = options?.logger ?? Logger

    const reset = () => {
        lastHandledSeqNum = -1
        lastEmittedSeqNum = -1
    }

    const emit = (type: string, event: Event | StoredEventResponse): void => {
        lastEmittedSeqNum = event.sequencenum
        if (initialised) {
            _logger.debug(`${event.sequencenum}: Updating last emitted to ${event.sequencenum}`)
        }
        // if the type we are emiting isn't wildcard, call all of its callbacks
        // and increment the last handled.
        if (type !== WILDCARD_TYPE) {
            const callbacks = callbackLookup.get(type) ?? []
            if (
                callbacks.length > 0
            ) {
                // ensure we call all type callbacks
                for (const callback of callbacks ?? []) {
                    callback(event)
                }

            }
            lastHandledSeqNum = event.sequencenum
            if (initialised) {
                _logger.debug(`${event.sequencenum}: Updating last handled to ${event.sequencenum}`)
            }
        }

        // ensure we always call all wildcard callbacks
        for (const wildcardCallback of callbackLookup.get(WILDCARD_TYPE) ?? []) {
            wildcardCallback(event)
        }
    }

    const on = (type: string, callback: (...args: any[]) => void): void => {
        // keep track of the callbacks we register, to ensure every one of them is called.
        const callbacks = callbackLookup.get(type) ?? []
        callbacks.push(callback)
        callbackLookup.set(type, callbacks)
    }

    const getLastEmittedSeqNum = () => lastEmittedSeqNum
    const getLastHandledSeqNum = () => lastHandledSeqNum


    return {
        emit,
        on,
        reset,
        getLastEmittedSeqNum,
        getLastHandledSeqNum,
    }
}