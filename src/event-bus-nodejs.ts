import { Event, EventBusType, StoredEventResponse } from './event'
import { EventEmitter } from 'events'

export default function EventBusNodejs(): EventBusType {
    const emitter = new EventEmitter()
    let lastEmittedSeqNum: number

    const emit = (type: string, event: Event|StoredEventResponse): void => {
        emitter.emit(type, { ...event })
        emitter.emit('*', { ...event })
        lastEmittedSeqNum = event.sequencenum
    }

    const on = (type: string, callback: (...args:any[]) => void): void => {
        emitter.on(type, callback)
    }

    const getLatestEmittedSeqNum = () => lastEmittedSeqNum

    return {
        emit,
        on,
        getLatestEmittedSeqNum
    }
}