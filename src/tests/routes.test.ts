import express, { Application, Router } from 'express'
import { NextFunction } from 'express-serve-static-core'
import { mountApi, setApiVersion } from '../routes'

describe('when mounting a processor', () => {
    describe('When auth is not enforced', () => {

        it('and its unique it should be fine', async () => {
            const appMock = jest.fn() as unknown as Application
            appMock.use = jest.fn()
            const routerMock = jest.fn() as unknown as Router
            mountApi(appMock, 'blah', '/blah', routerMock, false)
            expect(appMock.use).toBeCalledTimes(1)
        })

        // it('and its a duplicate it should throw', async () => {
        //     const appMock = jest.fn() as unknown as Application
        //     appMock.use = jest.fn()
        //     const routerMock = jest.fn() as unknown as Router
        //     mountApi(appMock, 'blah', '/boo', routerMock)
        //     expect(() => mountApi(appMock, 'blah', '/boo', routerMock)).toThrow(
        //         'Mount point duplicate: /boo'
        //     )
        // })

        // Issue: The internal /admin hasn't been mounted yet
        // it('and its call /admin it should thro', async () => {
        //     const appMock = jest.fn() as unknown as Application;
        //     appMock.use = jest.fn();
        //     const routerMock = jest.fn() as unknown as Router;
        //     expect(() => mountApi(appMock, 'blah', '/admin', routerMock)).toThrow(
        //         '"/admin" mount point is reserved'
        //     );
        // });

        it('and its missing a slash it should add one', async () => {
            const appMock = jest.fn() as unknown as Application
            appMock.use = jest.fn()
            const routerMock = jest.fn() as unknown as Router
            mountApi(appMock, 'blah', 'noslash', routerMock, false)
            expect(appMock.use).toBeCalledWith('/noslash', expect.anything())
        })

        it('and it has a version it should be pre-pended with a slash', async () => {
            const appMock = jest.fn() as unknown as Application
            appMock.use = jest.fn()
            const routerMock = jest.fn() as unknown as Router
            setApiVersion('v1')
            mountApi(appMock, 'blah', 'noslash', routerMock, false)
            expect(appMock.use).toBeCalledWith('/v1/noslash', expect.anything())
        })

        it('and it has a slashed version it should be pre-pended with the slash', async () => {
            const appMock = jest.fn() as unknown as Application
            appMock.use = jest.fn()
            const routerMock = jest.fn() as unknown as Router
            setApiVersion('/v2')
            mountApi(appMock, 'blah', '/foo', routerMock, false)
            expect(appMock.use).toBeCalledWith('/v2/foo', expect.anything())
        })

        it('should be able to change the api version twice', async () => {
            const appMock = jest.fn() as unknown as Application
            appMock.use = jest.fn()
            const routerMock = jest.fn() as unknown as Router

            setApiVersion('/v2 ')
            mountApi(appMock, 'blah', '/foo ', routerMock, false)
            expect(appMock.use).toBeCalledWith('/v2/foo', expect.anything())

            setApiVersion(' v4')
            mountApi(appMock, 'blah', 'bar', routerMock, false)
            expect(appMock.use).toBeCalledWith('/v4/bar', expect.anything())

            setApiVersion('')
            mountApi(appMock, 'blah', '  /baz ', routerMock, false)
            expect(appMock.use).toBeCalledWith('/baz', expect.anything())
        })
    })

    describe('When auth is enforced', () => {
        it('should fail to mount the router if authorizeApi is provided', async () => {
            const appMock = jest.fn() as unknown as Application
            appMock.use = jest.fn()
            const router = express.Router()

            router.get('myfakepath', () => {return null})

            try {
                mountApi(appMock, 'blah', '/blah', router, true)
            } catch (e: any) {
                expect(e.message).toEqual('Authorization Not Implemented for blah at /blah')
                return
            }

            throw new Error('Mount API should throw')
        })

        it('should successfully mount the router if authorizeApi is provided', async () => {
            const appMock = jest.fn() as unknown as Application
            appMock.use = jest.fn()
            const router = express.Router()

            const authorizeApi = (req: any, res: any, next: NextFunction) => {next()}

            router.get('myfakepath',
                authorizeApi,
                (req, res) => {return null}
            )

            mountApi(appMock, 'blah', '/blah', router, true)
        })
    })
})
