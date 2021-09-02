import jest from 'jest-mock'

import EventBase from '../../src/shimmiestack/eventbase.ts'
import EventStore from '../../src/shimmiestack/eventstore.ts'

// TODO: switch to a test database
// WHY DO WE NEED .default here? Some module crap!
const eventBase = EventBase.default(process.env.DATABASE_URL)
const eventStore = EventStore.default(eventBase)

beforeAll(async () => {
    console.info('Connecting to the songbase test database')
    await eventBase.connect()
})

afterAll(async () => {
    console.info('Finishing with the songbase test database')
    await eventBase.close()
})

describe('when creating the eventstore', () => {
    beforeEach(async () => {
        await eventBase.createTables()
    })

    afterEach(async () => {
        await eventBase.dropTables()
    })

    it('there should be no events in the database', async () => {
        const numEvents = await eventStore.getAllEvents()
        expect(numEvents.length).toEqual(0)
    })
})

describe('when recording an event', () => {
    beforeEach(async () => {
        await eventBase.createTables()
    })

    afterEach(async () => {
        await eventBase.dropTables()
    })

    it('there should be one events in the database if one is recorded', async () => {
        await eventStore.recordEvent(
            'streamid',
            'type',
            { data: 'blah' },
            { user: 'johnny' }
        )
        const numEvents = await eventStore.getAllEvents()

        expect(numEvents.length).toEqual(1)
    })

    it('there should be one events in the database if one is recorded', async () => {
        await eventStore.recordEvent(
            'streamid',
            'type',
            { data: 'blah' },
            { user: 'johnny' }
        )
        await eventStore.recordEvent(
            'streamid',
            'type',
            { data: 'blah' },
            { user: 'johnny' }
        )
        const numEvents = await eventStore.getAllEvents()

        expect(numEvents.length).toEqual(2)
    })

    it('there should be one event emitted for that type', async () => {
        const mockReceiver = jest.fn()

        eventStore.subscribe('delete_type', mockReceiver)

        await eventStore.recordEvent(
            'streamid',
            'delete_type',
            { data: 'blah' },
            { user: 'johnny' }
        )

        expect(mockReceiver).toHaveBeenCalledTimes(1)
    })
})
