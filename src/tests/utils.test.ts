import { withObjectLock } from '../utils'
import { ObjectLockedError } from '../event'

describe('Utils', () => {
    describe('withObjectLock', () => {
        let objectLocks = new Set<string>()
        beforeEach(async () => {
            objectLocks.clear()
            objectLocks.add('bar')
        })
        it('Should throw when any stream is locked', async () => {
            try {
                await withObjectLock(objectLocks, ['foo', 'bar'], async () => {
                    expect(fail('Should fail attempting to get a lock'))
                })
            } catch (e) {
                expect(e instanceof ObjectLockedError).toBeTruthy()
            }
        })

        it('should succeed when object is not locked', async () => {
            await withObjectLock(objectLocks, ['foo'], async () => {
                expect(objectLocks.has('foo')).toBeTruthy()
                expect(objectLocks.has('bar')).toBeTruthy()
            })
            // should release the lock once outside the wrapper
            expect(objectLocks.has('foo')).toBeFalsy()
        })

        it(
            'should release the lock if an error is thrown in the block',
            async () => {
                try {
                    await withObjectLock(
                        objectLocks,
                        ['foo'],
                        async () => {
                            expect(objectLocks.has('foo')).toBeTruthy()
                            throw new Error('Something happened oh no!')
                        },
                    )
                } catch (e: any) {
                    expect(e instanceof ObjectLockedError).toBeFalsy()
                    expect(e.message).toEqual('Something happened oh no!')
                }

                // should release the lock once outside the wrapper
                expect(objectLocks.has('foo')).toBeFalsy()
            })
    })
})