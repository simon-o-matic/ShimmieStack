import { EventBusType, StoredEventResponse } from '../event'
import EventBusNodejs from '../event-bus-nodejs'
import { createEvent } from './mocks'

const eventBusOptions = { options: { initialised: true } }
describe('Event bus NodeJS', () => {
    const mockHandler = jest.fn()
    let bus: EventBusType
    let event1: StoredEventResponse

    beforeEach(() => {
        bus = EventBusNodejs(eventBusOptions)
        event1 = createEvent()
    })
    afterEach(() => {
        mockHandler.mockClear()
    })
    describe('when calling on', () => {
        it('should call the provided function when an event is emitted with that type', async () => {
            bus.on(event1.type, mockHandler)
            await bus.emit(event1.type, event1)

            expect(mockHandler).toHaveBeenCalledTimes(1)
        })

        it('should increment the handled last seq num value even if no handler is registered', async () => {
            bus.on(event1.type, mockHandler)
            await bus.emit(event1.type, event1)
            expect(bus.getLastHandledSeqNum()).toEqual(event1.sequencenum)
            expect(bus.getLastEmittedSeqNum()).toEqual(event1.sequencenum)

            await bus.emit('AN UNUSED CHANNEL', createEvent({ sequencenum: 1337 }))
            expect(bus.getLastHandledSeqNum()).toEqual(1337)
            expect(bus.getLastEmittedSeqNum()).toEqual(1337)

            expect(mockHandler).toHaveBeenCalledTimes(1)
        })
    })
    describe('emit', () => {
        it('should emit events via the JS Emitter for subscribers to listen to', async () => {
            bus.on(event1.type, mockHandler)
            await bus.emit(event1.type, event1)

            expect(mockHandler).toHaveBeenCalledTimes(1)
        })

        it('should increment the emitted value when emitting', async () => {
            await bus.emit(event1.type, event1)
            expect(bus.getLastEmittedSeqNum()).toEqual(event1.sequencenum)
        })

        it('should broadcast on * as well as the type', async () => {
            bus.on('*', mockHandler)
            await bus.emit(event1.type, event1)

            expect(mockHandler).toHaveBeenCalledTimes(1)
        })
    })

    describe('reset', () => {
        it('Should reset last handled values and create a new JS emitter', async () => {
            const bus = EventBusNodejs(eventBusOptions)
            const event1 = createEvent()

            bus.on(event1.type, mockHandler)
            await bus.emit(event1.type, event1)

            // when we emit and have a listener, both should increment
            expect(bus.getLastEmittedSeqNum()).toEqual(event1.sequencenum)
            expect(bus.getLastHandledSeqNum()).toEqual(event1.sequencenum)
            expect(mockHandler).toHaveBeenCalledTimes(1)

            // reset them, this should reset the counts, but listeners should persist
            bus.reset()

            expect(bus.getLastEmittedSeqNum()).toEqual(-1)
            expect(bus.getLastHandledSeqNum()).toEqual(-1)

            await bus.emit(event1.type, event1)

            // thia time we have no handler registered, so we should emit and no handler increment or called.
            expect(bus.getLastEmittedSeqNum()).toEqual(event1.sequencenum)
            expect(bus.getLastHandledSeqNum()).toEqual(event1.sequencenum)
            expect(mockHandler).toHaveBeenCalledTimes(2)
        })
    })
})
