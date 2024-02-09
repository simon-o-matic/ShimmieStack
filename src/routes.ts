//
// Set up all the routes from all over the place.
//

import {
    Application,
    ErrorRequestHandler,
    NextFunction,
    Request,
    Response,
    Router,
} from 'express'
import { Logger } from './logger'

const timeLogger = (req: Request, res: Response, next: NextFunction) => {
    Logger.info(
        `[${new Date(Date.now()).toLocaleString()}] Route::[${req.method}] ${
            req.path
        }`
    )
    next()
}

const mountPointRegister = new Map<string, boolean>()
let apiVersion = ''

const addLeadingSlash = (str: string) => {
    if (str) {
        str = str.trim()
        if (str.length > 0) {
            return str[0] !== '/' ? '/' + str : str
        }
    }
    return ''
}

export const setApiVersion = (version: string) => {
    apiVersion = addLeadingSlash(version)
}

type ApiMounter = (
    app: Application,
    name: string,
    mountPoint: string,
    route: Router,
    enforceAuthorization: boolean
) => void

export const mountApi: ApiMounter = (
    app: Application,
    name: string,
    mountPoint: string,
    route: Router,
    enforceAuthorization: boolean
): string => {
    if (!mountPoint || !route) {
        throw 'Missing mountPoint details. Please check: '
    }

    const finalMountPoint = apiVersion + addLeadingSlash(mountPoint)

    if (enforceAuthorization) {
        // for each endpoint in the router
        route.stack.forEach((api: any) => {
            // check the handler and middleware for a function called "authorizeApi"
            // express doesnt expose the Layer type :(
            const authorizer: any[] = api.route.stack.filter((layer: any) => {
                return layer.name === '__authorizer'
            })

            if (authorizer.length === 0) {
                throw new Error(
                    `Authorization Not Implemented for ${name} at ${mountPoint}`
                )
            }
        })
    }

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
export const finaliseRoutes = (
    app: Application,
    errorHandler: ErrorRequestHandler
): void => {
    // call-all 404s
    app.use('*', catchAll404s)

    // set the default error handler
    app.use(errorHandler)
}
