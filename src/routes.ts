//
// Set up all the routes from all over the place.
//

import { Application, NextFunction, Request, Response, Router } from 'express';

const timeLogger = (req: Request, res: Response, next: NextFunction) => {
    console.info(
        `[${new Date(Date.now()).toLocaleString()}] Route::[${req.method}] ${
            req.path
        }`
    );
    next();
};

const mountPointRegister = new Map<string, boolean>();

export const mountApi = (
    app: Application,
    name: string,
    mountPoint: string,
    route: Router
) => {
    // WARNING: this does not check for overwriting, so because not to mount different functions on
    //          the same head
    if (!mountPoint || !route) {
        throw 'Missing mountPoint details. Please check: ';
    }
    if (mountPointRegister.get(mountPoint))
        throw 'Mount point duplicate: ' + mountPoint;
    if (mountPoint === '/admin') throw '"/admin" mount point is reserved';

    mountPointRegister.set(mountPoint, true);
    app.use(mountPoint, route);
    console.info(`>>>> Mounted ${mountPoint} with [${name}]`);
};

const catchAll404s = (req: Request, res: Response, next: NextFunction) => {
    res.status(404).json({
        statusCode: 404,
        message: `What you talking 'bout Willis? ${req.baseUrl}`,
    });
};

export const initRoutes = (app: Application) => {
    // set up any middleware
    app.use(timeLogger);
};

// Any routes that get done after all the user routes have been missed
export const finaliseRoutes = (app: Application): void => {
    // call-all 404s
    app.use('*', catchAll404s);

    // A catch-all call by express-async-errors
    // TODO: implement
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        console.error('500', err.message);
        console.dir(err);
        res.status(500).json({ error: err.message });
    });
};
