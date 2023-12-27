import { NextFunction, Request, Response } from 'express'
import Encryption from './encryption'

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
export const sequenceNumberMiddleware = (
    {
        stackEnsureMinSeqNumFunc,
        getLastHandledSeqNum,
        hashKey,

    }: {
        stackEnsureMinSeqNumFunc: (options: { minSequenceNumber: number }) => Promise<number>,
        getLastHandledSeqNum: () => number,
        hashKey?: string
    },
) => {
    const cryptor = hashKey ? Encryption({
        key: hashKey
    }) : undefined

    return async (req: Request, res: Response, next: NextFunction) => {
        const temp = res.send
        let minSeqNum = req.headers[SEQ_NUM_MIN_HEADER.toLowerCase()]
        if (typeof minSeqNum === 'string') {
            // If running in encrypted mode, try decrypt the seqNum
            if(cryptor){
                minSeqNum = cryptor.decrypt(minSeqNum)
            }
            const minSequenceNumber = parseInt(minSeqNum)
            await stackEnsureMinSeqNumFunc({ minSequenceNumber })
        }
        // Overwrite res.send to ensure we add the last-seq-num header when res.send is called.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.send = (body?: any) => {
            // if a command request, or a min seq number was requested, return the last handled seq num in a header
            if (
                commandMethods.includes(req.method.toUpperCase()) ||
                minSeqNum !== undefined
            ) {
                // If running in encrypted mode, encrypt seqNum before returning
                const lastHandled = cryptor ? cryptor.encrypt(getLastHandledSeqNum().toString()) : getLastHandledSeqNum().toString()

                res.set(
                    CURRENT_SEQ_NUM_HEADER,
                    lastHandled,
                )
            }
            // Invoke the original send function.
            return temp.call(res, body)
        }

        next()
    }
}
