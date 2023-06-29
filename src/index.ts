//
// Entry point of the application. Gets everything started.
//
import express, { Application, ErrorRequestHandler, NextFunction, Request, Response, Router } from 'express'
import cors, { CorsOptions } from 'cors'
import cookieParser from 'cookie-parser'
import * as routes from './routes'
import EventStore, { EventStoreType } from './eventstore'
import {
    Event,
    EventBaseType,
    Meta,
    PiiBaseType,
    PiiFields,
    TypedEvent,
    TypedEventDep,
    TypedEventHandler,
} from './event'
import { AuthorizerFunc } from './authorizers'
import { configureLogger, Logger, StackLogger } from './logger'

/** Errors stop the server if not initialised, if initialised they continue on */
let eventStoreFlags = { initialised: false }

const app = express()

process.on('uncaughtException', function (err) {
    // use `winston` or your own Logger instance as appropriate
    Logger.error(`Uncaught exception occurred: ${err} - ${err.stack}`)
    if(eventStoreFlags.initialised === false){
        throw err
    }
})

process.on('unhandledRejection', (err) => {
    throw err
})
app.use(express.json())
app.use(cookieParser())

export { Request, Response, Router, ErrorRequestHandler, NextFunction }

export interface ShimmieConfig {
    ServerPort: number
    CORS?: CorsOptions
    enforceAuthorization: boolean
}

// testing a new naming scheme. Replace IEvent if we like this one better. Easier
// for users to not be confused with their own event types (eg an event sourced system!)
export type ShimmieEvent = Event
// #Deprecated: defaulted to any for when no type is provided.
export type ShimmieTypedEventDep<EventType> = TypedEventDep<EventType>

export type ShimmieTypedEvent<EventName, EventType> = TypedEvent<EventName, EventType>

export type ShimmieTypedEventHandler<EventName,EventType> = TypedEventHandler<EventName,EventType>

export enum ExecutionOrder {
    SEQUENTIAL = 'sequential',
    CONCURRENT = 'concurrent',
}

export interface EventHistory<QueryEventModels> {
    streamId: string
    type: keyof QueryEventModels
    date: number
    user: any
    data: QueryEventModels[keyof QueryEventModels]
}

export interface StreamHistory<QueryEventModels> {
    history: EventHistory<QueryEventModels>[]
    updatedAt?: number
    createdAt?: number
}

export type RecordUnversionedEventType<CommandEventModels, EventName extends keyof CommandEventModels> = {
    streamId: string
    eventName: EventName
    eventData: CommandEventModels[EventName]
    meta: Meta
    piiFields?: PiiFields
}

export type RecordEventType <CommandEventModels, EventName extends keyof CommandEventModels> = {
    streamVersionIds: Record<string,string|undefined> | 'STREAM_VERSIONING_DISABLED'
} & RecordUnversionedEventType<CommandEventModels, EventName>



/**
 * Stacktype is the base shimmiestack stack object. It handles the event sourcing
 * and CQRS magic.
 *
 * Register you CommandEventModels and QueryEventModels at definition time.
 *
 * These Object keys are exposed as the options for the event name on recordEvent(s), and the types are used to ensure
 * recordEvent(s) payloads conform to the object expected for that event name.
 *
 * In the case below. Record event looks up the type defined next to "EXAMPLE_EVENT"
 * and checks eventData against that type definition
 *
 * stack.recordEvent(
 *     'streamid',
 *     'EXAMPLE_EVENT',
 *      { data: 'blah' },
 *      meta,
 * })
 *
 *  If we tried to input 'EXAMPLE_EVENT_2' as the type, it would error as that isn't a key in the CommandEventModels,
 *  and if we changed the event data to be { payload: 'blah' } it would complain, as data is missing,
 *  and payload is not defined in the Example event type
 *
 *  CommandEventModels (or any of the types defined inside it) can be set to any if you're a cowboy that doesn't
 *  want to to use any type safety
 *
 *  type CommandEventModels = {
 *     EXAMPLE_EVENT: ExampleEvent,
 *     SIMPLE_EXAMPLE_EVENT: SimpleExampleEvent,
 *     WHO_AM_I_EVENT: { elvis: string },
 *     SOME_EVENT_WITHOUT_A_DEFINED_TYPE: any,
 *  }
 *
 *  Query event models behaves very similarly to CommandEventModels.
 *  You define the event names and types that the subscribe() method checks against.
 *  The difference that Query handlers need to handle historical events, with data objects that may change with time,
 *  They can have a union type for the old and new models.
 *
 *  so in the case of Example Event, it needs to handle V1, and V2 as we have written both types to the stream at some
 *  point in the past.
 *
 *  QueryEventModels (or any of the types defined inside it) can be set to any if you're a cowboy that doesn't
 *  want to to use any type safety
 *
 *  type QueryEventModels = {
 *     EXAMPLE_EVENT: ExampleEventV1 | ExampleEventV2,
 *     SIMPLE_EXAMPLE_EVENT: SimpleExampleEvent,
 *     WHO_AM_I_EVENT: { elvis: string },
 *     SOME_EVENT_WITHOUT_A_DEFINED_TYPE: any,
 *  }
 */
export type StackType<
    CommandEventModels extends Record<string, any> = Record<string, any>,
    QueryEventModels extends Record<string, any> = Record<string, any>
> = {
    setApiVersion: (version: string) => StackType<CommandEventModels, QueryEventModels>
    getRouter: () => Router
    recordEvent: <EventName extends keyof CommandEventModels>(event: RecordEventType<CommandEventModels, EventName>) => Promise<void>
    recordUnversionedEvent: <EventName extends keyof CommandEventModels>(event: RecordUnversionedEventType<CommandEventModels, EventName>) => Promise<void>
    recordEvents: <EventName extends keyof CommandEventModels>(
        events: RecordEventType<CommandEventModels, EventName>[],
        executionOrder?: ExecutionOrder,
    ) => Promise<void>
    recordUnversionedEvents: <EventName extends keyof CommandEventModels>(
        events: RecordUnversionedEventType<CommandEventModels, EventName>[],
        executionOrder?: ExecutionOrder,
    ) => Promise<void>
    startup: () => void
    restart: () => void
    shutdown: () => void
    registerModel<T>(name: string, model: T): void
    getModel<T>(name: string): T
    setErrorHandler(fn: ErrorRequestHandler): StackType<CommandEventModels, QueryEventModels>
    mountProcessor: (
        name: string,
        mountPoint: string,
        router: Router,
    ) => StackType<CommandEventModels, QueryEventModels>
    subscribe: <EventName extends keyof QueryEventModels>(
        type: EventName,
        handler: TypedEventHandler<EventName,QueryEventModels[EventName]>,
    ) => void
    use: (a: any) => any
    getHistory: (ids: string | string[]) => StreamHistory<QueryEventModels> | undefined
    registerPreInitFn: (fn: () => void | Promise<void>) => StackType<CommandEventModels, QueryEventModels>
    registerPostInitFn: (fn: () => void | Promise<void>) => StackType<CommandEventModels, QueryEventModels>
}


const startApiListener = async (app: Application, port: number) => {
    await app.listen(port)
    Logger.info(`ShimmieStack >>>> API Server listening on ${port}!`)
}

const initializeShimmieStack = async <
    CommandEventModels extends Record<string, any>,
    QueryEventModels extends Record<string, any>
>(
    config: ShimmieConfig,
    errorHandler: ErrorRequestHandler,
    eventBase: EventBaseType,
    eventStore: EventStoreType<CommandEventModels, QueryEventModels>,
    piiBase?: PiiBaseType,
    logger?: StackLogger,
) => {
    try {
        Logger.info('ShimmieStack >>>> Initializing.')
        Logger.info('ShimmieStack >>>> Environment: ' + process.env.NODE_ENV)
        Logger.debug(`ShimmieStack >>>> Config: ${config} `)
        Logger.info('ShimmieStack >>>> Finalizing routes, setting up 404 and error handlers.')
        routes.finaliseRoutes(app, errorHandler)
        Logger.info('ShimmieStack >>>>: All processors mounted')

        // Get the database started
        await eventBase.init()
        Logger.info('ShimmieStack >>>> event database connected.')

        if (piiBase) {
            await piiBase.init()
            Logger.info('ShimmieStack >>>> pii database connected.')
        }

        // Process the entire event history on start up and load into memory
        Logger.info(
            `ShimmieStack >>>> Starting to replay the entire event stream to rebuild memory models`
        )
        const numEvents = await eventStore.replayAllEvents()
        Logger.info(`ShimmieStack >>>> replayed ${numEvents} events`)

        // Start accepting requests from the outside world
        await startApiListener(app, config.ServerPort)

        Logger.info('ShimmieStack >>>> Stack init complete')
    } catch (err) {
        const msg = `ShimmieStack >>>> Error during start up, aborting ( ${err} )`
        Logger.error(msg)
        throw new Error(msg)
    }
}

export const catchAllErrorHandler: ErrorRequestHandler = (
    err: any,
    req: Request,
    res: Response,
    _next: NextFunction
) => {
    let status = err.status ?? err.statusCode ?? 500
    Logger.error(`Caught an unhandled error:  ${err.message}`)
    return res.status(status).json({ error: 'Something went wrong' })
}


export default function ShimmieStack<
    CommandEventModels extends Record<string, any> = Record<string, any>,
    QueryEventModels extends Record<string, any> = Record<string, any>
>(
    config: ShimmieConfig,
    eventBase: EventBaseType,
    adminAuthorizer: AuthorizerFunc, // Authorizer function for the admin APIs (see authorizer.ts)
    piiBase?: PiiBaseType,
    appLogger?: StackLogger,
): StackType<CommandEventModels, QueryEventModels> {
    // if the caller provided a custom logger, use it
    configureLogger(appLogger)

    if (!eventBase) {
        throw Error('Missing event base parameter to ShimmieStack')
    }

    /** initialise the event store service by giving it an event database (db, memory, file ) */
    const eventStore = EventStore<CommandEventModels, QueryEventModels>(eventBase, piiBase, eventStoreFlags)

    /** set up our history listener, this breaks types */
    eventStore.subscribe(
        '*',
        <EventName extends keyof QueryEventModels>(e: TypedEvent<EventName, QueryEventModels[EventName]>) => {
            const historyArray: EventHistory<QueryEventModels>[] = eventHistory.get(e.streamId) || []
            historyArray.push({
                streamId: e.streamId,
                data: e.data,
                type: e.type,
                date: e.meta.date,
                user: e.meta.user,
            })
            eventHistory.set(e.streamId, historyArray)
        })

    let errorHandler: ErrorRequestHandler = catchAllErrorHandler

    app.use(cors(config.CORS || {}))

    // Set of loggers and authentication before all user-defined routes
    routes.initRoutes(app)

    // Install the admin API route
    // TODO: work out how to secure this. Need a client role.
    // todo move this into the chain to make the use cleaner
    // routes.mountApi(
    //     app,
    //     'Administration API',
    //     '/admin',
    //     AdminProcessor(eventBase, adminAuthorizer),
    //     config.enforceAuthorization
    // )

    const modelStore: { [key: string]: any } = {}

    // store the references to functions to execute post startup
    const postInitFns: (() => void | Promise<void>)[] = []
    const preInitFns: (() => void | Promise<void>)[] = []

    // do we need a way to reset this?
    let eventHistory = new Map<string, EventHistory<QueryEventModels>[]>()

    const funcs: StackType<CommandEventModels, QueryEventModels> = {
        startup: async () => {
            // if there are any post init fns registered execute them
            if (preInitFns.length) {
                Logger.info('ShimmieStack >>>> Running pre-init functions')
                await Promise.all(preInitFns.map(f => f()))
                Logger.info('ShimmieStack >>>> Successfully completed pre-init functions')
            } else {
                Logger.info('ShimmieStack >>>> No pre-init functions to run')
            }

            Logger.info('ShimmieStack >>>>>>>>>>  <<<<<<<<<<')
            Logger.info('ShimmieStack >>>> INITIALIZING <<<<')
            Logger.info('ShimmieStack >>>>>>>>>>  <<<<<<<<<<')
            await initializeShimmieStack(
                config,
                errorHandler,
                eventBase,
                eventStore,
                piiBase,
            )
            // if there are any post init fns registered execute them
            if (postInitFns.length) {
                Logger.info('ShimmieStack >>>> Running post-init functions')
                await Promise.all(postInitFns.map(f => f()))
                Logger.info('ShimmieStack >>>> Successfully compelted post-init functions')
            } else {
                Logger.info('ShimmieStack >>>> No post-init functions to run')
            }
            eventStoreFlags.initialised = true
        },

        restart: () => {
            Logger.info('TODO: empty everything and replay results')
        },

        shutdown: () => {
            Logger.info('TODO: HOW DO YOU STOP THIS THING!!!!')
        },

        setApiVersion: (version: string): StackType<CommandEventModels, QueryEventModels> => {
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
        setErrorHandler: (handler: ErrorRequestHandler): StackType<CommandEventModels, QueryEventModels> => {
            errorHandler = handler
            Logger.info('ShimmieStack >>>> Overridden default error handler')
            return funcs
        },

        mountProcessor: (name: string, mountPoint: string, router: Router): StackType<CommandEventModels, QueryEventModels> => {
            const url = routes.mountApi(
                app,
                name,
                mountPoint,
                router,
                config.enforceAuthorization
            )
            Logger.info(`ShimmieStack >>>> Mounted ${url} with [${name}]`)
            return funcs
        },

        subscribe<EventName extends keyof QueryEventModels>(
            type: EventName,
            handler: TypedEventHandler<EventName,QueryEventModels[EventName]>,
        ) {
            eventStore.subscribe(type, handler)
            Logger.info(`ShimmieStack >>>> Registered event handler: ${String(type)}`)
        },
        recordUnversionedEvents: <EventName extends keyof CommandEventModels>(
            events: RecordUnversionedEventType<CommandEventModels, EventName>[],
            executionOrder?: ExecutionOrder,
        ): Promise<void> => {
            return funcs.recordEvents(
                events.map(e => ({...e, streamVersionIds: 'STREAM_VERSIONING_DISABLED'})),
                executionOrder
            )
        },
        recordEvents: async <EventName extends keyof CommandEventModels>(
            events: RecordEventType<CommandEventModels, EventName>[],
            executionOrder?: ExecutionOrder,
        ) => {
            const executeConcurrently =
                executionOrder === ExecutionOrder.CONCURRENT

            if (executeConcurrently) {
                /**
                 * In this case we triggering all writes, and await the group
                 */
                // todo write a proper recordEvents that does a single DB query.
                try {
                    const eventPromises: Promise<void>[] = []
                    for (let i = 0; i < events.length; i++) {
                        const event = events[i]
                        eventPromises.push(funcs.recordEvent(event))
                    }
                    await Promise.all(eventPromises)
                } catch (err) {
                    Logger.error(`Unable to record all events`)
                    Logger.error(err)
                }
            } else {
                /**
                 * In this case we await each write, rather than triggering them concurrently.
                 */
                for (const event of events) {
                    try {
                        await funcs.recordEvent(event)
                    } catch (err) {
                        Logger.info('Unable to record event: ' + event)
                        Logger.error(err)
                    }
                }
            }
        },
        // shorthand for disabling versionIds
        recordUnversionedEvent: <EventName extends keyof CommandEventModels>(
            event: RecordUnversionedEventType<CommandEventModels, EventName>,
        ): Promise<void> =>
            eventStore.recordEvent({ ...event, streamVersionIds: 'STREAM_VERSIONING_DISABLED' }),
        recordEvent: <EventName extends keyof CommandEventModels>(
            event: RecordEventType<CommandEventModels, EventName>,
        ): Promise<void> =>
            eventStore.recordEvent(event),


        // Make a new Express router
        getRouter: () => express.Router(),

        // provide the client the Express use function so they can do whatever they want
        use: (a: any) => app.use(a),

        /**
         * Get all EventHistory of every stream ID passed - sorted oldest to newest
         * Up to the caller to collate list of related IDs, getHistory doesn't
         * know or care if they're related events
         */
        getHistory: (ids: string | string[]): StreamHistory<QueryEventModels> | undefined => {
            let history: EventHistory<QueryEventModels>[] | undefined
            if (typeof ids === 'string') {
                history = eventHistory.get(ids)
            } else {
                history = ids
                    .flatMap((id) => {
                        return eventHistory.get(id)
                    })
                    .filter((el): el is EventHistory<QueryEventModels> => !!el)
                    .sort((a, b) => (a.date > b.date ? 1 : -1)) // oldest first
            }

            if (!history) {
                return undefined
            }

            if (history.length > 0) {
                return {
                    history,
                    updatedAt: history[history?.length - 1].date,
                    createdAt: history[0].date,
                }
            }

            return {
                history: [],
                updatedAt: undefined,
                createdAt: undefined,
            }
        },
        // add a function to be run before initialize
        registerPreInitFn: (fn: () => void | Promise<void>): StackType<CommandEventModels, QueryEventModels> => {
            preInitFns.push(fn)
            return funcs
        },

        // add a function to be run after initialize
        registerPostInitFn: (fn: () => void | Promise<void>): StackType<CommandEventModels, QueryEventModels> => {
            postInitFns.push(fn)
            return funcs
        },
    }

    return funcs
}
