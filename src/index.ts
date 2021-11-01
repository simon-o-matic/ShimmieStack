//
// Entry point of the application. Gets everything started.
//
import express, { Application, Router, Request, Response } from 'express'
import cors, { CorsOptions } from 'cors'
import cookieParser from 'cookie-parser'
import * as routes from './routes'
import EventStore, { EventStoreType } from './eventstore'
import {
    StreamId,
    EventData,
    Meta,
    EventName,
    EventHandler,
    Event,
    EventBaseType,
} from './event'

import AdminProcessor from './admin_processor'

const app = express()
app.use(express.json())
app.use(cookieParser())

export { Request, Response, Router }

export interface ShimmieConfig {
    mode?: string
    ServerPort: number
    CORS?: CorsOptions
    enforceAuthorization: boolean
}

// testing a new naming scheme. Replace IEvent if we like this one better. Easier
// for users to not be confused with their own event types (eg an event sourced system!)
export type ShimmieEvent = Event

export type StackType = {
    setApiVersion: (version: string) => StackType
    getRouter: () => Router
    recordEvent: (
        streamdId: StreamId,
        eventName: EventName,
        eventData: EventData,
        meta: Meta
    ) => void
    startup: () => void
    restart: () => void
    shutdown: () => void
    registerModel<T>(name: string, model: T): void
    getModel<T>(name: string): T
    mountProcessor: (
        name: string,
        mountPoint: string,
        router: Router
    ) => StackType
    subscribe: (eventName: EventName, handler: EventHandler) => void
    use: (a: any) => any
}

const startApiListener = (app: Application, port: number) => {
    app.listen(port, () =>
        console.info(`ShimmieStack API Server listening on ${port}!`)
    )
}

const startup = async (
    config: ShimmieConfig,
    eventBase: EventBaseType,
    eventStore: EventStoreType
) => {
    try {
        console.info('ShimmieStack Start up sequence initiated.')
        console.info('ShimmieStack Environment:', process.env.NODE_ENV)
        console.info('ShimmieStack Config:', config)

        routes.finaliseRoutes(app)
        console.info('ShimmieStack: All processors mounted')

        // Get the database started
        await eventBase.init()

        console.info('ShimmieStack: database connected.')

        // Process the entire event history on start up and load into memory
        console.info(
            `ShimmieStack: Starting to replay the entire event stream to rebuild memory models`
        )
        const numEvents = await eventStore.replayAllEvents()
        console.info(`ShimmieStack: replayed ${numEvents} events`)

        // Start accepting requests from the outside world
        startApiListener(app, config.ServerPort)

        console.info('ShimmieStack: Start up complete')
    } catch (err) {
        console.info(
            'ShimmieStack1 Error during start up, aborting (',
            err,
            ')'
        )
    }
}

export default function ShimmieStack(
    config: ShimmieConfig,
    eventBase: EventBaseType
): StackType {
    if (!eventBase) throw Error('Missing event base parameter to ShimmieStack')

    /** initialise the event store service by giving it an event database (db, memory, file ) */
    const eventStore = EventStore(eventBase)

    app.use(cors(config.CORS || {}))

    // Set of loggers and authentication before all user-defined routes
    routes.initRoutes(app)

    // Install the admin API route
    // TODO: work out how to secure this. Need a client role.
    routes.mountApi(
        app,
        'Administration API',
        '/admin',
        AdminProcessor(eventBase),
        config.enforceAuthorization
    )

    let modelStore: { [key: string]: any } = {}

    const funcs: StackType = {
        startup: () => {
            startup(config, eventBase, eventStore)
        },

        restart: () => {
            console.log('TODO: empty everything and replay results')
        },

        shutdown: () => {
            console.log('TODO: HOW DO YOU STOP THIS THING!!!!')
        },

        setApiVersion: (version: string) => {
            routes.setApiVersion(version)
            return funcs
        },

        registerModel: (name: string, model: any) => {
            modelStore[name] = model
        },

        getModel: (name: string): any => {
            const model = modelStore[name]
            if (!model) throw new Error('No registered model found: ' + name)
            return modelStore[name]
        },

        mountProcessor: (name: string, mountPoint: string, router: Router) => {
            routes.mountApi(app, name, mountPoint, router, config.enforceAuthorization)
            return funcs
        },

        subscribe: (eventName: EventName, handler: EventHandler) => {
            console.log('ShimmieStack: Registering event handler: ', eventName)
            eventStore.subscribe(eventName, handler)
        },

        recordEvent: (
            streamdId: StreamId,
            eventName: EventName,
            eventData: EventData,
            meta: Meta
        ) => eventStore.recordEvent(streamdId, eventName, eventData, meta),

        // Make a new Express router
        getRouter: () => express.Router(),

        // provide the client the Exprese use function so they can do whatever they want
        use: (a: any) => app.use(a),
    }

    return funcs
}
