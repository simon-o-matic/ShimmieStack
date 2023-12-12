import { Event, EventBusType, StoredEventResponse, WILDCARD_TYPE } from './event'

export default function EventBusNodejs(): EventBusType {
    let lastEmittedSeqNum: number = -1
    let lastHandledSeqNum: number = -1
    const callbackLookup: Map<string, ((...args: any[]) => Promise<void> | void)[]> = new Map()

    const reset = () => {
        lastHandledSeqNum = -1
        lastEmittedSeqNum = -1
    }

    const emit = async (type: string, event: Event | StoredEventResponse): Promise<void> => {
        // if the type we are emiting isn't wildcard, call all of its callbacks
        // and increment the last handled.
        if (type !== WILDCARD_TYPE) {
            const callbacks = callbackLookup.get(type) ?? []
            if (
                callbacks.length > 0
            ) {
                // ensure we call all type callbacks
                for (const callback of callbacks ?? []) {
                    await callback(event)
                }

                lastHandledSeqNum = event.sequencenum ?? lastHandledSeqNum
            }
        }


        // ensure we always call all wildcard callbacks
        for (const wildcardCallback of callbackLookup.get(WILDCARD_TYPE) ?? []) {
            await wildcardCallback(event)
        }

        lastEmittedSeqNum = event.sequencenum
    }

    const on = (type: string, callback: (...args: any[]) => Promise<void> | void): void => {
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