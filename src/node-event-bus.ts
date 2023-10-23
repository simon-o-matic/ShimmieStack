import { Event, EventBaseType, EventBusType } from './event'
import { EventEmitter } from 'events'

export default function NodeEventBus(): EventBusType {
    const emitter = new EventEmitter()
    const emit = (type: string, event: Event): void => {
        emitter.emit(type, { ...event })
        emitter.emit('*', { ...event })
    }

    const on = (type: string, callback: (...args:any[]) => void): void => {
        emitter.on(type, callback)
    }


    return {
        emit,
        on
    }
}