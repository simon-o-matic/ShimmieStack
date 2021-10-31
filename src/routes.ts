//
// Set up all the routes from all over the place.
//

import { Application, NextFunction, Request, Response, Router } from 'express'

const timeLogger = (req: Request, res: Response, next: NextFunction) => {
    console.info(
        `[${new Date(Date.now()).toLocaleString()}] Route::[${req.method}] ${
            req.path
        }`
    )
    next()
}

const mountPointRegister = new Map<string, boolean>()
let apiVersion = ''

const addLeadingSlash = (str: string) => {
    if (str?.length > 0) {
        return str[0] !== '/' ? '/' + str : str
    }
    throw 'Bad mount point path: ' + str
}

export const setApiVersion = (version: string) => {
    apiVersion = addLeadingSlash(version)
}

type ApiMounter = (
    app: Application,
    name: string,
    mountPoint: string,
    route: Router
) => void

export const mountApi: ApiMounter = (
    app: Application,
    name: string,
    mountPoint: string,
    route: Router
): string => {
    if (!mountPoint || !route) {
        throw 'Missing mountPoint details. Please check: '
    }

    const finalMountPoint = apiVersion + addLeadingSlash(mountPoint)

    mountPointRegister.set(finalMountPoint, true)
    app.use(finalMountPoint, route)
    return finalMountPoint
}

const catchAll404s = (req: Request, res: Response, next: NextFunction) => {
    res.status(404).json({
        statusCode: 404,
        message: `What you talking 'bout Willis? ${req.baseUrl}`,
    })
}

export const initRoutes = (app: Application) => {
    // set up any middleware
    app.use(timeLogger)
}

// Any routes that get done after all the user routes have been missed
export const finaliseRoutes = (app: Application): void => {
    // call-all 404s
    app.use('*', catchAll404s)

    // A catch-all call by express-async-errors
    // TODO: implement
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        console.error('500', err.message)
        console.dir(err)
        res.status(500).json({ error: err.message })
    })
}
