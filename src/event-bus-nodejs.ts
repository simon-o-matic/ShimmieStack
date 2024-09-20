import {
    Event,
    EventBusType,
    StoredEventResponse,
    WILDCARD_TYPE,
} from './event'
import { Logger, StackLogger } from './logger'

export interface EventBusNodejsOptions {
    logger?: StackLogger
    options?: { initialised: boolean }
}

export default function EventBusNodejs({
    logger,
    options,
}: EventBusNodejsOptions): EventBusType {
    let lastEmittedSeqNum: number = -1
    let lastHandledSeqNum: number = -1
    const callbackLookup: Map<string, ((...args: any[]) => void | Promise<void>)[]> = new Map()
    const _logger = logger ?? Logger

    const reset = () => {
        lastHandledSeqNum = -1
        lastEmittedSeqNum = -1
    }

    const init = (initialSequenceNumber?: number) => {
        lastHandledSeqNum = initialSequenceNumber ?? lastHandledSeqNum
        _logger.info(`Event bus last handled initialised to: ${lastHandledSeqNum}`)
    }

    const emit = async (type: string, event: Event | StoredEventResponse): Promise<void> => {
        lastEmittedSeqNum = event.sequencenum
        if (!!options?.initialised) {
            _logger.debug(
                `${event.sequencenum}: Updating last emitted to ${event.sequencenum}`
            )
        }
        // if the type we are emiting isn't wildcard, call all of its callbacks
        // and increment the last handled.
        if (type !== WILDCARD_TYPE) {
            const callbacks = callbackLookup.get(type) ?? []
            if (callbacks.length > 0) {
                // ensure we call all type callbacks
                for (const callback of callbacks ?? []) {
                    await callback(event)
                }
            }
            lastHandledSeqNum = event.sequencenum
            if (!!options?.initialised) {
                _logger.debug(
                    `${event.sequencenum}: Updating last handled to ${event.sequencenum}`
                )
            }
        }

        // ensure we always call all wildcard callbacks
        for (const wildcardCallback of callbackLookup.get(WILDCARD_TYPE) ??
            []) {
            wildcardCallback(event)
        }
    }

    const on = (type: string, callback: (...args: any[]) => void| Promise<void>): void => {
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
        init,
        reset,
        getLastEmittedSeqNum,
        getLastHandledSeqNum,
    }
}
