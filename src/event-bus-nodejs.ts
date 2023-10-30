import { Event, EventBusType, StoredEventResponse, WILDCARD_TYPE } from './event'
import { EventEmitter } from 'events'

export default function EventBusNodejs(): EventBusType {
    let lastEmittedSeqNum: number = -1
    let lastHandledSeqNum: number = -1
    let callbackLookup: Map<string, ((...args:any[]) => void)[]> = new Map()

    const reset = () => {
        lastHandledSeqNum = -1
        lastEmittedSeqNum = -1
        callbackLookup = new Map()
    }

    const emit = (type: string, event: Event|StoredEventResponse): void => {
        // if the type we are emiting isn't wildcard, call all of its callbacks
        // and increment the last handled.
        if(type !== WILDCARD_TYPE){
            const callbacks = callbackLookup.get(type) ?? []
            if(
                callbacks.length > 0 &&
                (event.sequencenum === undefined ||
                event.sequencenum > lastHandledSeqNum)
            ) {
                // ensure we call all type callbacks
                for (const callback of callbacks ?? []) {
                    callback(event)
                }

                lastHandledSeqNum = event.sequencenum ?? lastHandledSeqNum
            }
        }


        // ensure we always call all wildcard callbacks
        for (const wildcardCallback of callbackLookup.get(WILDCARD_TYPE) ?? []) {
            wildcardCallback(event)
        }

        lastEmittedSeqNum = event.sequencenum
    }

    const on = (type: string, callback: (...args:any[]) => void): void => {
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
        getLastHandledSeqNum
    }
}