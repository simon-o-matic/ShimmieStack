import { Request, Response, Router } from 'express'
import { Meta } from '../event'
import EventBase from '../eventbase-memory'
import { sequenceNumberMiddleware } from '../sequenceNumberMiddleware'
import ShimmieTestStack from '../shimmieteststack'

const meta: Meta = {
    replay: false,
    user: {
        id: 'elvis',
        roles: new Map(),
    },
    date: Date.now(),
    userAgent: '',
}

describe('SequenceNumberMiddleware', () => {
    const eventbase = EventBase()
    const testStack = ShimmieTestStack(undefined, true, eventbase)
    beforeEach(() => {
        eventbase.reset()
        testStack.restart()
        testStack.use(
            sequenceNumberMiddleware({
                stackEnsureMinSeqNumFunc:
                testStack.ensureMinSequenceNumberHandled,
                getLastHandledSeqNum:
                testStack.getLastHandledSequenceNumber,
            }),
        )
        testStack.mountTest(
            Router().get('/', (req: Request, res: Response) => {
                return res.status(200).send()
            }),
        )
        testStack.mountTest(
            Router().post('/', (req: Request, res: Response) => {
                return res.status(200).send()
            }),
        )
        testStack.mountTest(
            Router().put('/', (req: Request, res: Response) => {
                return res.status(200).send()
            }),
        )
        testStack.mountTest(
            Router().delete('/', (req: Request, res: Response) => {
                return res.status(200).send()
            }),
        )
        testStack.subscribe('AN EVENT', () => {
        })
        testStack.recordUncheckedEvent({
            streamId: 'streamId1',
            eventName: 'AN EVENT',
            eventData: {},
            meta,
        })
        testStack.recordUncheckedEvent({
            streamId: 'streamId2',
            eventName: 'AN EVENT',
            eventData: {},
            meta,
        })
    })

    it('Should set the response header with the seqNum on post', async () => {
        const resp = await testStack.testPost({ path: '/' })
        const events = await eventbase.getEventsInOrder()
        const lastEvent = events[events.length - 1]
        expect(resp.headers['x-seq-num']).toEqual(
            lastEvent.sequencenum.toString(),
        )
    })

    it('Should set the response header with the seqNum on put', async () => {
        const resp = await testStack.testPut({ path: '/' })
        const events = await eventbase.getEventsInOrder()
        const lastEvent = events[events.length - 1]
        expect(resp.headers['x-seq-num']).toEqual(
            lastEvent.sequencenum.toString(),
        )
    })

    it('Should set the response header with the seqNum on delete', async () => {
        const resp = await testStack.testDelete({ path: '/' })
        const events = await eventbase.getEventsInOrder()
        const lastEvent = events[events.length - 1]
        expect(resp.headers['x-seq-num']).toEqual(
            lastEvent.sequencenum.toString(),
        )
    })

    it('Shouldnt set the response header with the seqNum on get', async () => {
        const resp = await testStack.testGet({ path: '/' })
        expect(resp.headers['x-seq-num']).toBeUndefined()
    })

    describe('Passing min seq num header', () => {
        describe('When up to date', () => {
            it('Should just handle the request', async () => {
                const maxEvent = await eventbase.getEventsInOrder()
                const currentMaxSeqNum =
                    maxEvent[maxEvent.length - 1].sequencenum
                const mockFunc = jest.spyOn(eventbase, 'getEventsInOrder')
                const resp = await testStack.testGet({
                    path: '/',
                    headers: {
                        'x-seq-num-min': currentMaxSeqNum,
                    },
                })
                expect(resp.status).toEqual(200)
                expect(resp.headers['x-seq-num']).toEqual(
                    currentMaxSeqNum.toString(),
                )
                expect(mockFunc).not.toHaveBeenCalled()
            })
        })

        describe('When behind', () => {
            it('Should handle the missing events  before processing the request', async () => {
                // add an event to the db that the stack isn't aware of. This mimics distributed behaviour
                const newEvent = await eventbase.addEvent({
                    streamId: 'anewstream',
                    streamVersionId: 'asdkuasvda',
                    meta,
                    data: {},
                    type: 'AN EVENT',
                })

                const mockFunc = jest.spyOn(eventbase, 'getEventsInOrder')
                const resp = await testStack.testGet({
                    path: '/',
                    headers: {
                        'x-seq-num-min': newEvent.sequencenum,
                    },
                })
                expect(resp.status).toEqual(200)
                expect(resp.headers['x-seq-num']).toEqual(
                    newEvent.sequencenum.toString(),
                )
                expect(mockFunc).toHaveBeenCalledWith(newEvent.sequencenum)
            })
        })
    })
})
