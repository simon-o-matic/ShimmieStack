//

export type Meta = {
    username: string
    userId: string // can be device id?
}

export type EventHandler = (event: IEvent) => void
export type EventName = string
export type StreamId = string
export type EventData = object

export type IEvent = {
    streamId: StreamId
    data: EventData
    type: string
    meta: Meta
}

export default class Event {
    streamId: string
    type: string
    data: object
    meta: Meta

    constructor(streamId: string, type: string, data: object, meta: Meta) {
        this.streamId = streamId
        this.type = type
        this.data = data
        this.meta = meta
    }
}
