import EventBase from '../eventbase-memory'
import EventStore from '../eventstore'
import { Meta } from '../event'
import PiiBase from '../piibase-memory'
import { ShimmieEvent } from '..'
import { expect } from '@jest/globals'
import ShimmieTestStack from '../shimmieteststack'
const eventBase = EventBase()
const piiBase = PiiBase()
const eventStore = EventStore<CommandEventModels, any>(eventBase, piiBase)


type CommandEventModels = {
    nonPiiTestData: { data: string },
    piiTest: { piiField: string, nonPiiField: string }
}


// ignore event meta data
const meta: Meta = {
    user: {},
    replay: false,
    date: 123,
    userAgent: 'test agent',
}

const piiTestData = { piiField: 'blah', nonPiiField: 'Blah too' }
const nonPiiTestData = { data: 'blah' }

beforeAll(async () => {
    await eventBase.init()
    await piiBase.init()
})

beforeEach(async () => {
    await eventBase.reset()
    await piiBase.reset()
})

afterAll(async () => {
    await eventBase.shutdown()
    await piiBase.shutdown()
})

describe('when creating the eventstore', () => {
    it('there should be no events in the database', async () => {
        const events = await eventStore.getAllEvents()
        const piiData = await piiBase.getPiiLookup()
        expect(events.length).toEqual(0)
        expect(Object.keys(piiData).length).toEqual(0)
    })
})

describe('when recording an event', () => {
    describe('and the piibase is configured', () => {
        it('the user should get back the data and eventstore should not contain the pii',
            async () => {


                eventStore.subscribe('piiTest', () => {
                })
                await eventStore.recordEvent(
                    'streamid',
                    'piiTest',
                    piiTestData,
                    meta,
                    ['piiField'],
                )

                // check that the eventbase does not have pii in it, and does have the other data
                const nonPii = (await eventStore.getAllEvents(false))[0]
                expect(nonPii.data).not.toHaveProperty('piiField')
                expect(nonPii.data).toHaveProperty('nonPiiField')

                const events = await eventStore.getAllEvents()

                // check that the returned event data does have pii in it
                // meaning the piibase and event base have been merged at the event store level
                expect((events[0] as ShimmieEvent)?.data).toEqual(piiTestData)
            })

        it('there should be two events in the database when two are recorded', async () => {
            eventStore.subscribe('type', () => {
            })

            await eventStore.recordEvent(
                'streamid',
                'piiTest',
                piiTestData,
                meta,
                ['piiField'],
            )
            await eventStore.recordEvent(
                'streamid',
                'nonPiiTestData',
                nonPiiTestData,
                meta,
            )
            const allEvents = await eventStore.getAllEvents()

            // are both events saved?
            expect(allEvents.length).toEqual(2)

            // does the PII event meta.hasPii = true
            expect(allEvents[0].data).toEqual(piiTestData)
            expect(allEvents[0].meta.hasPii).toBe(true)

            // does the non PII event meta.hasPii = false
            expect(allEvents[1].data).toEqual(nonPiiTestData)
            expect(allEvents[1].meta.hasPii).toBe(false)

        })
    })
    describe('and the piibase is not configured', () => {
        const noPiiEventStore = EventStore<CommandEventModels, any>(eventBase)

        it('Should throw an error if provided a pii key', async () => {
            noPiiEventStore.subscribe('type', () => {
            })
            try {
                await noPiiEventStore.recordEvent(
                    'streamid',
                    'piiTest',
                    piiTestData,
                    meta,
                    ['piiField'],
                )
                fail("Should have thrown when no piibase is configured and pii is provided");
            } catch (err: any) {
                expect(err.message).toEqual('You must configure a PII base to store PII outside the event stream')
            }

        })

        it('Should store the event when no pii is present', async () => {
            noPiiEventStore.subscribe('type', () => {
            })
            await noPiiEventStore.recordEvent(
                'streamid',
                'piiTest',
                piiTestData, // you can still store pii in here, but it will be added to the event stream, rather than the pii db
                meta,
            )

            // check that the eventbase does not have pii in it, and does have the other data
            const event = (await noPiiEventStore.getAllEvents(false))[0]

            expect(event.data).toEqual(piiTestData)
            expect(event.meta.hasPii).toBeFalsy()
        })
    })
})
