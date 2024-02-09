import { ShimmieEvent } from '..'
import { Meta } from '../event'
import EventBase from '../eventbase-memory'
import EventStore from '../eventstore'
import PiiBase from '../piibase-memory'
import { ANONYMISED_NUM, ANONYMISED_STRING } from '../utils'
const eventBase = EventBase()
const piiBase = PiiBase()
const eventStore = EventStore<RecordModels, any>({
    eventbase: eventBase,
    piiBase: piiBase,
    options: { initialised: true },
})

type RecordModels = {
    nonPiiTestData: { data: string }
    piiTest: { piiField: string; nonPiiField: string }
    anonymiseTest: any
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
        const events = await eventStore.getEvents()
        const piiData = await piiBase.getPiiLookup()
        expect(events.length).toEqual(0)
        expect(Object.keys(piiData).length).toEqual(0)
    })
})

describe('when recording an event', () => {
    describe('and the piibase is configured', () => {
        it('the user should get back the data and eventstore should not contain the pii', async () => {
            eventStore.subscribe('piiTest', () => {})
            await eventStore.recordEvent({
                streamId: 'streamid',
                eventName: 'piiTest',
                eventData: piiTestData,
                streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                meta,
                piiFields: ['piiField'],
            })

            // check that the eventbase does not have pii in it, and does have the other data
            const nonPii = (await eventStore.getEvents({ withPii: false }))[0]
            expect(nonPii.data).not.toHaveProperty('piiField')
            expect(nonPii.data).toHaveProperty('nonPiiField')

            const events = await eventStore.getEvents()

            // check that the returned event data does have pii in it
            // meaning the piibase and event base have been merged at the event store level
            expect((events[0] as ShimmieEvent)?.data).toEqual(piiTestData)
        })

        it('there should be two events in the database when two are recorded', async () => {
            eventStore.subscribe('type', (event) => {})

            await eventStore.recordEvent({
                streamId: 'streamid',
                eventName: 'piiTest',
                eventData: piiTestData,
                meta,
                streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                piiFields: ['piiField'],
            })
            await eventStore.recordEvent({
                streamId: 'streamid',
                eventName: 'nonPiiTestData',
                eventData: nonPiiTestData,
                streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                meta,
            })
            const allEvents = await eventStore.getEvents()

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
        const noPiiEventStore = EventStore<RecordModels, any>({
            eventbase: eventBase,
            options: { initialised: true },
        })

        it('Should throw an error if provided a pii key', async () => {
            noPiiEventStore.subscribe('type', () => {})
            try {
                await noPiiEventStore.recordEvent({
                    streamId: 'streamid',
                    eventName: 'piiTest',
                    eventData: piiTestData,
                    meta,
                    streamVersionIds: { streamId: undefined },
                    piiFields: ['piiField'],
                })
                fail(
                    'Should have thrown when no piibase is configured and pii is provided'
                )
            } catch (err: any) {
                expect(err.message).toEqual(
                    'You must configure a PII base to store PII outside the event stream'
                )
            }
        })

        it('Should store the event when no pii is present', async () => {
            noPiiEventStore.subscribe('type', () => {})
            await noPiiEventStore.recordEvent({
                streamId: 'streamid',
                eventName: 'piiTest',
                eventData: piiTestData,
                streamVersionIds: { streamId: undefined },
                meta,
            })

            // check that the eventbase does not have pii in it, and does have the other data
            const event = (
                await noPiiEventStore.getEvents({ withPii: false })
            )[0]

            expect(event.data).toEqual(piiTestData)
            expect(event.meta.hasPii).toBeFalsy()
        })
    })
})

describe('when anonymising pii', () => {
    it('should retain non pii fields and anonymise the rest', async () => {
        eventStore.subscribe('type', (event) => {})

        const anonEventData = {
            name: 'NAME',
            number: 1234,
            object: {
                child: {
                    grandchild: 'MORE TEXT',
                },
            },
            array: ['STRING', 10, { objectInArray: 'MORE STRING' }],
            notAPiiField: 'HELLO THERE',
            alsoNotPii: 4567,
        }

        await eventStore.recordEvent({
            streamId: 'streamid',
            eventName: 'anonymiseTest',
            eventData: anonEventData,
            meta,
            streamVersionIds: 'STREAM_VERSIONING_DISABLED',
            piiFields: ['email', 'object', 'name', 'number', 'array'],
        })
        await eventStore.recordEvent({
            streamId: 'streamid',
            eventName: 'anonymiseTest',
            eventData: anonEventData,
            meta,
            streamVersionIds: 'STREAM_VERSIONING_DISABLED',
            piiFields: ['email', 'object', 'name', 'number', 'array'],
        })

        await eventStore.anonymiseStreamPii('streamid')
        const allEventsAgain = await eventStore.getEvents()

        allEventsAgain.forEach((event: any) => {
            const anonymised = event.data
            expect(anonymised.name).toBe(ANONYMISED_STRING)
            expect(anonymised.number).toBe(ANONYMISED_NUM)
            expect(anonymised.object.child.grandchild).toBe(ANONYMISED_STRING)
            expect(anonymised.array[0]).toBe(ANONYMISED_STRING)
            expect(anonymised.array[1]).toBe(ANONYMISED_NUM)
            expect(anonymised.array[2].objectInArray).toBe(ANONYMISED_STRING)
            expect(anonymised.notAPiiField).toBe(anonEventData.notAPiiField)
            expect(anonymised.alsoNotPii).toBe(anonEventData.alsoNotPii)
        })
    })
})
