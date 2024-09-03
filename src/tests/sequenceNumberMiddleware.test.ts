import { Request, Response, Router } from 'express'
import Encryption from '../encryption'
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
    describe('with hashKey', () => {
        const eventbase = EventBase()
        const testStack = ShimmieTestStack(undefined, true, eventbase)
        const hashKey = 'AN INSECURE EXAMPLE HASH KEY HERE'
        const cryptor = Encryption({
            key: hashKey,
        })

        beforeEach(() => {
            eventbase.reset()
            testStack.restart()
            testStack.use(
                // todo non-encrypted tests
                sequenceNumberMiddleware({
                    stackEnsureMinSeqNumFunc:
                        testStack.ensureMinSequenceNumberHandled,
                    getLastHandledSeqNum:
                        testStack.getLastHandledSequenceNumberHandled,
                    hashKey,
                })
            )
            testStack.mountTest(
                Router().get('/', (req: Request, res: Response) => {
                    return res.status(200).send()
                })
            )
            testStack.mountTest(
                Router().post('/', (req: Request, res: Response) => {
                    return res.status(200).send()
                })
            )
            testStack.mountTest(
                Router().put('/', (req: Request, res: Response) => {
                    return res.status(200).send()
                })
            )
            testStack.mountTest(
                Router().delete('/', (req: Request, res: Response) => {
                    return res.status(200).send()
                })
            )
            testStack.subscribe('AN EVENT', () => {})
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
            testStack.recordUncheckedEvent({
                streamId: 'streamId3',
                eventName: 'AN EVENT',
                eventData: {},
                meta,
            })
            testStack.recordUncheckedEvent({
                streamId: 'streamId4',
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
                lastEvent.sequencenum.toString()
            )
        })

        describe('Passing min seq num header', () => {
            it('Should just handle the request', async () => {
                // get the seq num from a post
                const putResp = await testStack.testPost({ path: '/' })
                expect(putResp.status).toEqual(200)
                const respSeqNum = putResp.headers['x-seq-num']

                // Put in the value returned from the post
                const mockFunc = jest.spyOn(eventbase, 'getEventsInOrder')
                const resp = await testStack.testGet({
                    path: '/',
                    headers: {
                        'x-seq-num-min': respSeqNum,
                    },
                })

                expect(mockFunc).not.toHaveBeenCalled()

                // Ensure it succeeded, and the decrypted value matches maximum,
                // and the value returned by the POST request
                const maxEvent = await eventbase.getEventsInOrder()
                const currentMaxSeqNum =
                    maxEvent[maxEvent.length - 1].sequencenum

                expect(resp.status).toEqual(200)
                // todo remove me, disabled encrypton
                // const decryptedValue = cryptor.decrypt(resp.headers['x-seq-num'])
                const decryptedValue = resp.headers['x-seq-num']
                expect(decryptedValue).toEqual(currentMaxSeqNum.toString())
                expect(decryptedValue).toEqual(respSeqNum)
            })

            // todo remove isNan in a few weeks to allow for smooth numeric to encrypted value changeover (same comment in another spot too)
            it('Should accept raw numeric seq num too for now', async () => {
                // get the seq num from a post
                const putResp = await testStack.testPost({ path: '/' })
                expect(putResp.status).toEqual(200)
                const respSeqNum = putResp.headers['x-seq-num']

                // const decryptedValue = cryptor.decrypt(respSeqNum)
                const resp = await testStack.testGet({
                    path: '/',
                    headers: {
                        'x-seq-num-min': respSeqNum,
                    },
                })

                expect(resp.status).toEqual(200)

                const resp2 = await testStack.testGet({
                    path: '/',
                    headers: {
                        'x-seq-num-min': respSeqNum,
                    },
                })

                expect(resp2.status).toEqual(200)
            })
        })
        xit(' Should test how fast yo', () => {
            let encryptMsTotal = 0
            let decryptMsTotal = 0
            const iters = 1_000_000
            for (let i = 0; i < iters; i++) {
                const startStamp = Date.now()
                const encrypted = cryptor.encrypt('A string')
                encryptMsTotal = encryptMsTotal + (Date.now() - startStamp)

                const endStamp = Date.now()
                cryptor.decrypt(encrypted)
                decryptMsTotal = decryptMsTotal + (Date.now() - endStamp)
            }

            console.log(
                JSON.stringify({
                    encryptMsAvg: encryptMsTotal / (iters * 1.0),
                    decryptMsAvg: decryptMsTotal / (iters * 1.0),
                    encryptMsTotal,
                    decryptMsTotal,
                })
            )
        })
    })

    describe('without hashKey', () => {
        const eventbase = EventBase()
        const testStack = ShimmieTestStack(undefined, true, eventbase)
        const hashKey = 'AN INSECURE EXAMPLE HASH KEY HERE'
        const cryptor = Encryption({
            key: hashKey,
        })
        beforeEach(() => {
            eventbase.reset()
            testStack.restart()
            testStack.use(
                sequenceNumberMiddleware({
                    stackEnsureMinSeqNumFunc:
                        testStack.ensureMinSequenceNumberHandled,
                    getLastHandledSeqNum:
                        testStack.getLastHandledSequenceNumberHandled,
                })
            )
            testStack.mountTest(
                Router().get('/', (req: Request, res: Response) => {
                    return res.status(200).send()
                })
            )
            testStack.mountTest(
                Router().post('/', (req: Request, res: Response) => {
                    return res.status(200).send()
                })
            )
            testStack.mountTest(
                Router().put('/', (req: Request, res: Response) => {
                    return res.status(200).send()
                })
            )
            testStack.mountTest(
                Router().delete('/', (req: Request, res: Response) => {
                    return res.status(200).send()
                })
            )
            testStack.subscribe('AN EVENT', () => {})
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
                lastEvent.sequencenum.toString()
            )
        })

        it('Should set the response header with the seqNum on put', async () => {
            const resp = await testStack.testPut({ path: '/' })
            const events = await eventbase.getEventsInOrder()
            const lastEvent = events[events.length - 1]
            expect(resp.headers['x-seq-num']).toEqual(
                lastEvent.sequencenum.toString()
            )
        })

        it('Should set the response header with the seqNum on delete', async () => {
            const resp = await testStack.testDelete({ path: '/' })
            const events = await eventbase.getEventsInOrder()
            const lastEvent = events[events.length - 1]
            expect(resp.headers['x-seq-num']).toEqual(
                lastEvent.sequencenum.toString()
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
                        currentMaxSeqNum.toString()
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
                        newEvent.sequencenum.toString()
                    )
                    expect(mockFunc).toHaveBeenCalledWith(newEvent.sequencenum)
                })
            })
        })
    })
})
