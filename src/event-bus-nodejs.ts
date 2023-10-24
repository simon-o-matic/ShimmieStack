import { Event, EventBusType, StoredEventResponse } from './event'
import { EventEmitter } from 'events'

export default function EventBusNodejs(): EventBusType {
    const emitter = new EventEmitter()
    let lastEmittedSeqNum: number
    let lastHandledSeqNum: number

    const emit = (type: string, event: Event|StoredEventResponse): void => {
        emitter.emit(type, { ...event })
        emitter.emit('*', { ...event })
        lastEmittedSeqNum = event.sequencenum
    }

    const on = (type: string, callback: (...args:any[]) => void): void => {
        const callbackWrapper: (...args:any[]) => void = (event: StoredEventResponse) => {
            // if I receive an event that has a sequence number I have already processed, don't call the callback
            if(event.sequencenum && (event.sequencenum <= (lastHandledSeqNum ?? -1))) {
                return
            }
            callback(event)
        }

        emitter.on(type, callbackWrapper)
    }

    const getLastEmittedSeqNum = () => lastEmittedSeqNum
    const getLastHandledSeqNum = () => lastHandledSeqNum

    return {
        emit,
        on,
        getLastEmittedSeqNum,
        getLastHandledSeqNum
    }
}