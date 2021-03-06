import EventBase from '../eventbase-memory'
import EventStore from '../eventstore'
import { Meta } from '../event'

const eventBase = EventBase()
const eventStore = EventStore(eventBase)

// ignore event meta data
const meta: Meta = {
    user: {},
    replay: false,
    date: 123,
    userAgent: 'test agent',
}

beforeAll(async () => {
    await eventBase.init()
})

beforeEach(async () => {
    await eventBase.reset()
})

afterAll(async () => {
    await eventBase.shutdown()
})

describe('when creating the eventstore', () => {
    it('there should be no events in the database', async () => {
        const numEvents = await eventStore.getAllEvents()
        expect(numEvents.length).toEqual(0)
    })
})

describe('when recording an event', () => {
    it('there should be one event in the database if one is recorded', async () => {
        eventStore.subscribe('type', () => {})
        await eventStore.recordEvent('streamid', 'type', { data: 'blah' }, meta)
        const numEvents = await eventStore.getAllEvents()

        expect(numEvents.length).toEqual(1)
    })

    it('no listener shouild produce a warning', async () => {
        console.warn = jest.fn()

        await eventStore.recordEvent(
            'streamid',
            'randomType',
            { data: 'blah' },
            meta
        )

        expect(console.warn).toHaveBeenCalledWith(
            '[ShimmieStack] Event randomType has no listeners'
        )
    })

    it('there should be two events in the database when two are recorded', async () => {
        eventStore.subscribe('type', () => {})
        await eventStore.recordEvent('streamid', 'type', { data: 'blah' }, meta)
        await eventStore.recordEvent('streamid', 'type', { data: 'blah' }, meta)
        const allEvents = await eventStore.getAllEvents()

        expect(allEvents.length).toEqual(2)
    })

    it('there should be one event emitted per type', async () => {
        const mockReceiver = jest.fn()

        eventStore.subscribe('delete_type', mockReceiver)

        await eventStore.recordEvent(
            'streamid',
            'delete_type',
            { data: 'blah' },
            meta
        )

        expect(mockReceiver).toHaveBeenCalledTimes(1)
    })
})

describe('when deleting an event', () => {
    it('should remove the event', async () => {
        await eventStore.recordEvent('streamid', 'type', { data: 'blah' }, meta)
        await eventStore.recordEvent('streamid', 'type', { data: 'foo' }, meta)

        const allEvents = await eventStore.getAllEvents()
        console.log('EVENTS,', allEvents)
        expect(allEvents.length).toEqual(2)

        await eventStore.deleteEvent(1)
        expect(allEvents.length).toEqual(1)
        await eventStore.deleteEvent(0)
        expect(allEvents.length).toEqual(0)

        try {
            await eventStore.deleteEvent(0)
        } catch (e) {
            // didn't exist, so we catch that here
            expect(true).toBeTruthy()
        }
    })
})

describe('when updating data', () => {
    it('the data should be updated', async () => {
        await eventStore.recordEvent('streamid', 'type', { data: 'glue' }, meta)
        await eventStore.recordEvent('streamid', 'type', { data: 'foo' }, meta)

        await eventStore.updateEventData(0, { bar: 'goo' })
        await eventStore.updateEventData(1, { bar: 'boo' })

        const allEvents = await eventStore.getAllEvents()

        expect(allEvents[0].data).toEqual({ bar: 'goo' })
        expect(allEvents[1].data).toEqual({ bar: 'boo' })
    })
})
