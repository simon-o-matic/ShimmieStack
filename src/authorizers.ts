import { NextFunction, Request, Response } from 'express'


export type AuthorizerFunc = (req:any, res: any, next: NextFunction) => void

/**
 * This ia a wrapper function, if enforcing authorization in the shimmie stack it looks for a middleware
 * function called authorizeApi. This can be used with any middleware to make an endpoint authorized.
 * This is only there to remind developers to implement auth for each endpoint, it does not do auth for you.
 * @param authFunc the function that actually does the authorization
 */
export const authorizeApi = (authFunc: AuthorizerFunc) => {
    // rename the function to __authorizer so when we check if the function s authorized we have a unique name
    Object.defineProperty(authFunc, "name", { value: "__authorizer" });
    return authFunc
}

/**
 * If no authorization is required on this endpoint use this function.
 */
export const noAuthorization = (req:any, res: any, next: NextFunction): void => {
    next()
}

/**
 * If no authorization needs to occur at the middleware use this function.
 * This is only here for clearer readability when you're using it. It does the same thing as authorize all
 */
export const customAuthorization = noAuthorization