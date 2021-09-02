//
// Entry point of the application. Gets everything started.
//
import express, { Application, Router, Request, Response } from 'express'
import cors from 'cors'
import eventbase from './eventbase'
import * as routes from './routes'
import EventStore, { IEventStore } from './eventstore'
import { StreamId, EventData, Meta, EventName, EventHandler } from './event'

// import adminProcessor from './admin_processor';

const STACK_VERSION = '0.3'

const app = express()
app.use(express.json())
app.use(cors())

export { Request, Response, Router }

export interface StackConfig {
    EventbaseURL: string
    ServerPort: number
}

const startApiListener = (app: Application, port: number) => {
    app.listen(port, () =>
        console.info(
            `ShimmieStack [${STACK_VERSION}] API Server listening on ${port}!`
        )
    )
}

const startup = async (
    config: StackConfig,
    eventBase: any,
    eventStore: any
) => {
    try {
        console.info('ShimmieStack Start up sequence initiated.')
        console.info('ShimmieStack Environment:', process.env.NODE_ENV)

        // const adminProcessorObj = adminProcessor(eventStoreObj, eventBase);
        // The admin processor needs access to the event database so its handled separately here

        // mount all the APIs at their chosen end points
        //  insertRoutes(app, userProcessors, adminProcessorObj);

        routes.finaliseRoutes(app)
        console.info('ShimmieStack: All processors mounted')

        // Get the database started
        await eventBase.connect()
        await eventBase.createTables()

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

export type StackType = {
    setApiVersion: (version: string) => StackType
    router: () => Router
    recordEvent: (
        streamdId: StreamId,
        eventName: EventName,
        eventData: EventData,
        meta: Meta
    ) => void
    startup: () => void
    restart: () => void
    shutdown: () => void
    mountProcessor: (
        name: string,
        mountPoint: string,
        router: Router
    ) => StackType
    registerEventHandler: (eventName: EventName, handler: EventHandler) => void
}

// processors: ((store: IEventStore) => Processor)[],
export default function ShimmieStack(config: StackConfig): StackType {
    const eventBase = eventbase(config.EventbaseURL)
    const eventStore = EventStore(eventBase)

    routes.initRoutes(app)

    let apiVersion = ''

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
            apiVersion = version
            return funcs
        },

        mountProcessor: (name: string, mountPoint: string, router: Router) => {
            routes.mountApi(app, name, mountPoint, router)
            return funcs
        },

        registerEventHandler: (eventName: EventName, handler: EventHandler) => {
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
        router: () => express.Router(),
    }

    return funcs
}
