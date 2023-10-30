import { Event, EventBusType, StoredEventResponse } from './event'
import { EventEmitter } from 'events'

export default function EventBusNodejs(): EventBusType {
    let emitter = new EventEmitter()
    let lastEmittedSeqNum: number = -1
    let lastHandledSeqNum: number = -1

    const reset = () => {
        lastHandledSeqNum = -1
        lastEmittedSeqNum = -1
        emitter = new EventEmitter()
    }

    const emit = (type: string, event: Event|StoredEventResponse): void => {
        emitter.emit(type, { ...event })
        emitter.emit('*', { ...event })
        lastEmittedSeqNum = event.sequencenum
    }

    const on = (type: string, callback: (...args:any[]) => void): void => {
        const callbackWrapper: (...args:any[]) => void = (event: StoredEventResponse) => {
            // if I receive an event that has a sequence number I have already processed, don't call the callback
            if(
                event.sequencenum !== undefined &&
                (event.sequencenum <= lastHandledSeqNum) &&
                type !== '*' // allow for a second broadcast on '*' channel of the same event
            ) {
                return
            }


            lastHandledSeqNum = event.sequencenum ?? lastHandledSeqNum
            callback(event)
        }

        emitter.on(type, callbackWrapper)
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