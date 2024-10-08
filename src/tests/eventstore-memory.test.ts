import { expect, jest } from '@jest/globals'
import { Meta } from '../event'
import EventBase from '../eventbase-memory'
import EventStore from '../eventstore'
import { Logger } from '../logger'

let eventStoreOptions = { initialised: true }
const eventBase = EventBase()

interface AnEventName {
    data: string
}

type RecordModels = {
    AN_EVENT_NAME: AnEventName
    AN_EVENT_WITH_NO_LISTENERS_NAME: { data: string }
    ANOTHER_EVENT_NAME: { data: number }
}

type SubscribeModels = {
    AN_EVENT_NAME: { data: string }
    ANOTHER_EVENT_NAME: { data: number }
}

const eventStore = EventStore<RecordModels, SubscribeModels>({
    eventbase: eventBase,
    piiBase: undefined,
    options: eventStoreOptions,
})

// ignore event meta data
const meta: Meta = {
    user: {},
    replay: false,
    date: 123,
    userAgent: 'test agent',
}

describe('EventStore Memory', () => {
    beforeAll(async () => {
        await eventBase.init()
    })

    afterEach(async () => {
        await eventBase.reset()
        await eventStore.reset()
    })

    afterAll(async () => {
        await eventBase.shutdown()
    })

    describe('when creating the eventstore', () => {
        it('there should be no events in the database', async () => {
            const numEvents = await eventStore.getEvents()
            expect(numEvents.length).toEqual(0)
        })
    })

    describe('when recording an event', () => {
        it('there should be one event in the database if one is recorded', async () => {
            eventStore.subscribe('AN_EVENT_NAME', () => {})
            await eventStore.recordEvent({
                streamId: 'streamid',
                eventName: 'AN_EVENT_NAME',
                eventData: { data: 'blah' },
                streamVersionIds: { streamId: undefined },
                meta: meta,
            })
            const numEvents = await eventStore.getEvents()

            expect(numEvents.length).toEqual(1)
        })

        it('there should be two events in the database when two are recorded', async () => {
            await eventStore.recordEvent({
                streamId: 'streamid',
                eventName: 'ANOTHER_EVENT_NAME',
                eventData: { data: 123 },
                streamVersionIds: { streamId: undefined },
                meta,
            })
            await eventStore.recordEvent({
                streamId: 'streamid',
                eventName: 'AN_EVENT_NAME',
                eventData: { data: 'blah' },
                streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                meta: meta,
            })
            const allEvents = await eventStore.getEvents()

            expect(allEvents.length).toEqual(2)
        })

        it('there should be one event emitted per type', async () => {
            const mockReceiver = jest.fn()

            eventStore.subscribe('AN_EVENT_NAME', mockReceiver)

            await eventStore.recordEvent({
                streamId: 'streamid',
                eventName: 'AN_EVENT_NAME',
                eventData: { data: 'blah' },
                streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                meta: meta,
            })

            expect(mockReceiver).toHaveBeenCalledTimes(1)
        })

        it('no listener should produce a warning', async () => {
            Logger.warn = jest.fn()
            // theres a race condition here somewhere..
            await eventStore.recordEvent({
                streamId: 'streamid',
                eventName: 'AN_EVENT_WITH_NO_LISTENERS_NAME',
                eventData: { data: 'blah' },
                streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                meta: meta,
            })

            expect(Logger.warn).toHaveBeenCalledWith(
                'ShimmieStack >>>> Event AN_EVENT_WITH_NO_LISTENERS_NAME has no listeners'
            )
        })
    })

    describe('when deleting an event', () => {
        it('should remove the event', async () => {
            await eventStore.recordEvent({
                streamId: 'streamid',
                eventName: 'AN_EVENT_NAME',
                eventData: { data: 'blah' },
                streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                meta: meta,
            })
            await eventStore.recordEvent({
                streamId: 'streamid',
                eventName: 'AN_EVENT_NAME',
                eventData: { data: 'foo' },
                streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                meta: meta,
            })
            const allEvents = await eventStore.getEvents()
            Logger.log(`EVENTS, ${allEvents} `)
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
            await eventStore.recordEvent({
                streamId: 'streamid',
                eventName: 'AN_EVENT_NAME',
                eventData: { data: 'glue' },
                streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                meta: meta,
            })
            await eventStore.recordEvent({
                streamId: 'streamid',
                eventName: 'AN_EVENT_NAME',
                eventData: { data: 'foo' },
                streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                meta: meta,
            })
            await eventStore.updateEventData(0, { bar: 'goo' })
            await eventStore.updateEventData(1, { bar: 'boo' })

            const allEvents = await eventStore.getEvents()

            expect(allEvents[0].data).toEqual({ bar: 'goo' })
            expect(allEvents[1].data).toEqual({ bar: 'boo' })
        })
    })

    describe('when subscribing to an event', () => {
        describe('an error in the subscription', () => {
            beforeEach(() => {
                eventStoreOptions.initialised = true
            })
            it('should be caught and handled with sync callback', async () => {
                let valueSet = false
                eventStore.subscribe('AN_EVENT_NAME', (event) => {
                    valueSet = true
                    throw new Error(
                        'Something happened and should stop the app launching'
                    )
                })
                await eventStore.recordEvent({
                    streamId: 'streamid',
                    eventName: 'AN_EVENT_NAME',
                    eventData: { data: 'blah' },
                    streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                    meta: meta,
                })
                expect(valueSet).toBe(true)
                await eventStore.recordEvent({
                    streamId: 'streamid',
                    eventName: 'AN_EVENT_NAME',
                    eventData: { data: 'blah' },
                    streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                    meta: meta,
                })

                const numEvents = await eventStore.getEvents()

                // both events should be there, and the errored subscriber should log and not crash the app.
                expect(numEvents.length).toEqual(2)

                eventStoreOptions.initialised = false
                try {
                    await eventStore.recordEvent({
                        streamId: 'streamid',
                        eventName: 'AN_EVENT_NAME',
                        eventData: { data: 'blah' },
                        streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                        meta: meta,
                    })
                } catch (err: any) {
                    expect(err).toBeDefined()
                    expect(err.message).toEqual(
                        'Something happened and should stop the app launching'
                    )
                    return
                }
                throw new Error('Should have thrown during init but didnt')
            })

            it('should be caught and handled with an async callback', async () => {
                let valueSet = false
                eventStore.subscribe('AN_EVENT_NAME', async (event) => {
                    valueSet = true
                    return Promise.reject({ 'message':'Something happened and should stop the app launching'})
                })
                await eventStore.recordEvent({
                    streamId: 'streamid',
                    eventName: 'AN_EVENT_NAME',
                    eventData: { data: 'blah' },
                    streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                    meta: meta,
                })
                expect(valueSet).toBe(true)
                await eventStore.recordEvent({
                    streamId: 'streamid',
                    eventName: 'AN_EVENT_NAME',
                    eventData: { data: 'blah' },
                    streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                    meta: meta,
                })

                const numEvents = await eventStore.getEvents()

                // both events should be there, and the errored subscriber should log and not crash the app.
                expect(numEvents.length).toEqual(2)

                eventStoreOptions.initialised = false
                try {
                    await eventStore.recordEvent({
                        streamId: 'streamid',
                        eventName: 'AN_EVENT_NAME',
                        eventData: { data: 'blah' },
                        streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                        meta: meta,
                    })
                } catch (err: any) {
                    expect(err).toBeDefined()
                    expect(err.message).toEqual(
                        'Something happened and should stop the app launching'
                    )
                    return
                }
                throw new Error('Should have thrown during init but didnt')
            })
        })
    })
})
