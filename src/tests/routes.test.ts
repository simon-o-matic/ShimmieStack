import { Application, Router } from 'express'
import { mountApi, setApiVersion } from '../routes'

describe('when mounting a processor', () => {
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
})
