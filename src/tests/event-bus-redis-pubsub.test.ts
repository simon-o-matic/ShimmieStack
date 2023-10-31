import { EventBusType, StoredEventResponse } from '../event'
import EventBusNodejs from '../event-bus-nodejs'
import { createEvent } from './mocks'
import EventBusRedisPubsub from '../event-bus-redis-pubsub'
import { Logger } from '../logger'

let mockRedisNodeBus = EventBusNodejs()

/**
 * Mock the ioredis import to use a node emitter instead.
 */
jest.mock('ioredis', () => {
    return jest.fn()
        .mockImplementation(() => { // Works and lets you check for constructor calls
            let onCallback: { (...args: any[]): void; (type: string, message: string): void }
            return {
                subscribe: (type: string) => {},
                publish: (type: string, message: string) => mockRedisNodeBus.emit('pubsub-global', JSON.parse(message)),
                on: (event: "message", callback: (type: string, message: string) => void) => {
                    mockRedisNodeBus.on('pubsub-global', ( event ) => callback('pubsub-global', JSON.stringify(event)))
                }
            };
    });
});
describe("Event bus RedisPubsub", () => {
    const mockHandler = jest.fn()
    let mockDistributedBus: EventBusType
    let event0: StoredEventResponse
    let event1: StoredEventResponse
    let event2: StoredEventResponse
    let event4: StoredEventResponse
    let event6: StoredEventResponse
    let replayEvent: StoredEventResponse
    const mockReplayer = jest.fn()

    beforeEach(() => {
        mockRedisNodeBus = EventBusNodejs()
        mockDistributedBus = EventBusRedisPubsub({
            url: 'a string',
            logger: Logger,
            replayFunc: mockReplayer,
        })
        event0 = createEvent()
        event1 = createEvent({sequencenum: 1})
        event2 = createEvent({sequencenum: 2})
        event4 = createEvent({sequencenum: 4})
        event6 = createEvent({sequencenum: 6})
        replayEvent = createEvent({sequencenum: 5, meta: { ...event0.meta, replay: true }})
    })
    afterEach(() => {
        mockHandler.mockClear()
        mockReplayer.mockClear()
    })


    describe('Should handle events published via the (mock) redis publisher', () => {
        it('should receive and handle the mock event',() => {
            mockDistributedBus.on('example', mockHandler)
            mockDistributedBus.emit('example', event1)
            expect(mockHandler).toHaveBeenCalledWith(event1)
            expect(mockHandler).toHaveBeenCalledTimes(1)
        })

        it('should only handle an event once, even if emitted more than once',() => {
            mockDistributedBus.on('example', mockHandler)
            mockDistributedBus.emit('example', event1)
            mockDistributedBus.emit('example', event4)
            expect(mockHandler).toHaveBeenCalledWith(event1)
            expect(mockHandler).toHaveBeenCalledWith(event4)
            expect(mockHandler).toHaveBeenCalledTimes(2)
            expect(mockReplayer).toHaveBeenCalledTimes(1)
        })

        it('should increment last emitted/handled on each emit',() => {
            // emit without a listener
            mockDistributedBus.emit('example', event1)
            expect(mockHandler).not.toHaveBeenCalled()
            expect(mockDistributedBus.getLastEmittedSeqNum()).toEqual(event1.sequencenum)
            expect(mockDistributedBus.getLastHandledSeqNum()).toEqual(-1)

            // emit with a listener
            mockDistributedBus.on('example', mockHandler)
            mockDistributedBus.emit('example', event2)
            expect(mockHandler).toHaveBeenCalledWith(event2)
            expect(mockHandler).toHaveBeenCalledTimes(1)

            expect(mockDistributedBus.getLastHandledSeqNum()).toEqual(event2.sequencenum)
            expect(mockDistributedBus.getLastEmittedSeqNum()).toEqual(event2.sequencenum)
        })

        it('should recognise and try to replay missing events',() => {
            //mock replayer should be called when passing events out of order.
            mockDistributedBus.on('example', mockHandler)
            mockDistributedBus.emit('example', event0)
            mockDistributedBus.emit('example', event1)
            mockDistributedBus.emit('example', event4)
            // expect replay to have been called with the seqNum of the last event we processed +1
            expect(mockReplayer).toHaveBeenCalledWith(event1.sequencenum + 1)
        })

        it('should error replaying missing events if no handler is provided',() => {

            mockDistributedBus.on('example', mockHandler)
            mockDistributedBus.emit('example', event0)
            mockDistributedBus.emit('example', event4)
        })

        it('should not emit replay events via pubsub',() => {
            const mockRedisHandler = jest.fn()

            mockDistributedBus.emit('replay-tester', replayEvent)
            mockRedisNodeBus.on('pubsub-global', mockRedisHandler)

            // don't expect a pubsub emit for replay
            expect(mockRedisHandler).not.toHaveBeenCalled()

            // expect a local emit for replay
            expect(mockDistributedBus.getLastEmittedSeqNum()).toEqual(replayEvent.sequencenum)
        })
    })

})