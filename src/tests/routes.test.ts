import { Application, Router } from 'express';
import { mountApi } from '../routes';

describe('when mounting a processor', () => {
    it('and its unique it should be fine', async () => {
        const appMock = jest.fn() as unknown as Application;
        appMock.use = jest.fn();
        const routerMock = jest.fn() as unknown as Router;
        mountApi(appMock, 'blah', '/blah', routerMock);
        expect(appMock.use).toBeCalledTimes(1);
    });

    it('and its a duplicate it should throw', async () => {
        const appMock = jest.fn() as unknown as Application;
        appMock.use = jest.fn();
        const routerMock = jest.fn() as unknown as Router;
        mountApi(appMock, 'blah', '/boo', routerMock);
        expect(() => mountApi(appMock, 'blah', '/boo', routerMock)).toThrow(
            'Mount point duplicate: /boo'
        );
    });

    it('and its call /admin it should thro', async () => {
        const appMock = jest.fn() as unknown as Application;
        appMock.use = jest.fn();
        const routerMock = jest.fn() as unknown as Router;
        expect(() => mountApi(appMock, 'blah', '/admin', routerMock)).toThrow(
            '"/admin" mount point is reserved'
        );
    });

    it('and its missing a slash it should add one', async () => {
        const appMock = jest.fn() as unknown as Application;
        appMock.use = jest.fn();
        const routerMock = jest.fn() as unknown as Router;
        mountApi(appMock, 'blah', 'noslash', routerMock);
        expect(appMock.use).toBeCalledWith('/noslash', expect.anything());
    });
});