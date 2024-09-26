import { Handler, NextFunction, Request, Response } from 'express'
import { StackNotInitialisedError } from './index'

const commandMethods = ['PUT', 'POST', 'DELETE']
const SEQ_NUM_MIN_HEADER = 'X-Seq-Num-Min'
const CURRENT_SEQ_NUM_HEADER = 'X-Seq-Num'
/**
 * Middleware to ensure a certain seq num has been executed before calling next function.
 * If a hashKey is provided, the seqNum will be encrypted instead of raw num sent to caller
 *
 * @param stackEnsureMinSeqNumFunc
 * @param getLastHandledSeqNum
 * @param hashKey
 */
export const sequenceNumberMiddleware = ({
                                             stackEnsureMinSeqNumFunc,
                                             getLastHandledSeqNum,
                                         }: {
    stackEnsureMinSeqNumFunc: (options: {
        minSequenceNumber?: number
    }) => Promise<number>
    getLastHandledSeqNum: () => number
}): Handler => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const temp = res.send
        const isCommandRequest = commandMethods.includes(req.method.toUpperCase())
        let minSequenceNumber: number | undefined

        // if the caller knows what number they need, save a db round trip and ensure that has loaded.
        if (!isCommandRequest) {
            let minSeqNumHeader = req.headers[SEQ_NUM_MIN_HEADER.toLowerCase()]
            if (typeof minSeqNumHeader === 'string') {
                minSequenceNumber = parseInt(minSeqNumHeader)
            }
        }

        // If we have a minimum number, or we're doing a write ensure we've processed up to db max, or provided seq num
        if (isCommandRequest || minSequenceNumber) {
            await stackEnsureMinSeqNumFunc({ minSequenceNumber })
        }

        // Overwrite res.send to ensure we add the last-seq-num header when res.send is called.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.send = (body?: any) => {
            // if a command request, or a min seq number was requested, return the last handled seq num in a header
            if (
                isCommandRequest ||
                minSequenceNumber !== undefined
            ) {
                const lastHandled = getLastHandledSeqNum().toString()

                res.set(CURRENT_SEQ_NUM_HEADER, lastHandled)
            }
            // Invoke the original send function.
            return temp.call(res, body)
        }

        next()
    }
}
