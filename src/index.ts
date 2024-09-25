//
// Entry point of the application. Gets everything started.
//
import cookieParser from 'cookie-parser'
import cors, { CorsOptions } from 'cors'
import express, { Application, ErrorRequestHandler, Express, NextFunction, Request, Response, Router } from 'express'
import { AuthorizerFunc } from './authorizers'
import {
    Event,
    EventBaseType,
    EventBusOptions,
    EventBusType,
    Meta,
    PiiBaseType,
    PiiFields,
    StreamVersionError,
    TypedEvent,
    TypedEventDep,
    TypedEventHandler,
    WILDCARD_TYPE,
} from './event'
import EventBusNodejs from './event-bus-nodejs'
import EventBusRedisPubsub, { EventBusRedisPubsubOptions } from './event-bus-redis-pubsub'
import { PostgresDbConfig } from './eventbase-postgres'
import EventStore, { EventStoreType } from './eventstore'
import { configureLogger, Logger, StackLogger } from './logger'
import * as routes from './routes'

export {
    ErrorRequestHandler,
    EventBusNodejs,
    EventBusOptions,
    EventBusRedisPubsub,
    EventBusRedisPubsubOptions,
    EventBusType,
    NextFunction,
    PostgresDbConfig,
    Request,
    Response,
    Router,
    StreamVersionError,
    WILDCARD_TYPE,
}

export interface ShimmieConfig {
    ServerPort: number
    CORS?: CorsOptions
    enforceAuthorization: boolean
    maxRequestSize?: string | number
}

// testing a new naming scheme. Replace IEvent if we like this one better. Easier
// for users to not be confused with their own event types (eg an event sourced system!)
export type ShimmieEvent = Event
// #Deprecated: defaulted to any for when no type is provided.
export type ShimmieTypedEventDep<EventType> = TypedEventDep<EventType>

export type ShimmieTypedEvent<EventName, EventType> = TypedEvent<
    EventName,
    EventType
>

export type ShimmieTypedEventHandler<EventName, EventType> = TypedEventHandler<
    EventName,
    EventType
>

export enum ExecutionOrder {
    SEQUENTIAL = 'sequential',
    CONCURRENT = 'concurrent',
}

export interface EventHistory<SubscribeModels> {
    streamId: string
    type: keyof SubscribeModels
    date: number
    user: any
    data: SubscribeModels[keyof SubscribeModels]
}

export interface StreamHistory<SubscribeModels> {
    history: EventHistory<SubscribeModels>[]
    updatedAt?: number
    createdAt?: number
}

export type RecordUncheckedEventType<
    RecordModels,
    EventName extends keyof RecordModels
> = Omit<RecordEventType<RecordModels, EventName>, 'streamVersionIds'>

export type RecordEventType<
    RecordModels,
    EventName extends keyof RecordModels
> = {
    streamId: string
    eventName: EventName
    eventData: RecordModels[EventName]
    meta: Meta
    piiFields?: PiiFields
    streamVersionIds:
        | Record<string, string | undefined>
        | 'STREAM_VERSIONING_DISABLED'
}

/**
 * Stacktype is the base shimmiestack stack object. It handles the event sourcing
 * and CQRS magic.
 *
 * Register you RecordModels and SubscribeModels at definition time.
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
 *  If we tried to input 'EXAMPLE_EVENT_2' as the type, it would error as that isn't a key in the RecordModels,
 *  and if we changed the event data to be { payload: 'blah' } it would complain, as data is missing,
 *  and payload is not defined in the Example event type
 *
 *  RecordModels (or any of the types defined inside it) can be set to any if you're a cowboy that doesn't
 *  want to to use any type safety
 *
 *  type RecordModels = {
 *     EXAMPLE_EVENT: ExampleEvent,
 *     SIMPLE_EXAMPLE_EVENT: SimpleExampleEvent,
 *     WHO_AM_I_EVENT: { elvis: string },
 *     SOME_EVENT_WITHOUT_A_DEFINED_TYPE: any,
 *  }
 *
 *  Query event models behaves very similarly to RecordModels.
 *  You define the event names and types that the subscribe() method checks against.
 *  The difference that Query handlers need to handle historical events, with data objects that may change with time,
 *  They can have a union type for the old and new models.
 *
 *  so in the case of Example Event, it needs to handle V1, and V2 as we have written both types to the stream at some
 *  point in the past.
 *
 *  SubscribeModels (or any of the types defined inside it) can be set to any if you're a cowboy that doesn't
 *  want to to use any type safety
 *
 *  type SubscribeModels = {
 *     EXAMPLE_EVENT: ExampleEventV1 | ExampleEventV2,
 *     SIMPLE_EXAMPLE_EVENT: SimpleExampleEvent,
 *     WHO_AM_I_EVENT: { elvis: string },
 *     SOME_EVENT_WITHOUT_A_DEFINED_TYPE: any,
 *  }
 */
export type StackType<
    RecordModels extends Record<string, any> = Record<string, any>,
    SubscribeModels extends Record<string, any> = Record<string, any>
> = {
    setApiVersion: (version: string) => StackType<RecordModels, SubscribeModels>
    getRouter: () => Router
    recordEvent: <EventName extends keyof RecordModels>(
        event: RecordEventType<RecordModels, EventName>,
    ) => Promise<void>
    recordUncheckedEvent: <EventName extends keyof RecordModels>(
        event: RecordUncheckedEventType<RecordModels, EventName>,
    ) => Promise<void>
    recordEvents: <EventName extends keyof RecordModels>(
        events: RecordEventType<RecordModels, EventName>[],
        executionOrder?: ExecutionOrder,
    ) => Promise<void>
    recordUncheckedEvents: <EventName extends keyof RecordModels>(
        events: RecordUncheckedEventType<RecordModels, EventName>[],
        executionOrder?: ExecutionOrder,
    ) => Promise<void>
    startup: (lastHandledSequenceNumber?: number) => void
    restart: () => Promise<void>
    shutdown: () => void
    registerModel<T>(name: string, model: T): void
    getModel<T>(name: string): T
    setErrorHandler(
        fn: ErrorRequestHandler,
    ): StackType<RecordModels, SubscribeModels>
    setAppConfig(key: string, value: unknown): void
    mountProcessor: (
        name: string,
        mountPoint: string,
        router: Router,
    ) => StackType<RecordModels, SubscribeModels>
    subscribe: <EventName extends keyof SubscribeModels>(
        type: EventName,
        handler: TypedEventHandler<EventName, SubscribeModels[EventName]>,
    ) => void
    use: (a: any) => any
    getHistory: (
        ids: string | string[],
    ) => Promise<StreamHistory<SubscribeModels> | undefined>
    ensureMinSequenceNumberHandled: ({
                                         minSequenceNumber,
                                     }: {
        minSequenceNumber?: number
    }) => Promise<number>
    getLastHandledSequenceNumber: () => number
    registerPreInitFn: (
        fn: () => void | Promise<void>,
    ) => StackType<RecordModels, SubscribeModels>
    registerPostInitFn: (
        fn: () => void | Promise<void>,
    ) => StackType<RecordModels, SubscribeModels>
    registerSequenceNumberDivergenceHandler: (
        fn: (params: {
            lastHandled: number
            dbLastSeqNum: number
        }) => void | Promise<void>,
    ) => StackType<RecordModels, SubscribeModels>
    anonymiseStreamPii: (streamId: string) => Promise<void>
}

const startApiListener = async (app: Application, port: number) => {
    await app.listen(port)
    Logger.info(`ShimmieStack >>>> API Server listening on ${port}!`)
}

const initializeShimmieStack = async <
    RecordModels extends Record<string, any>,
    SubscribeModels extends Record<string, any>
>({
      app,
      config,
      errorHandler,
      eventBase,
      eventStore,
      piiBase,
      lastHandledSequenceNumber,
      sequenceNumberDivergenceHandler,
  }: {
    app: Express
    config: ShimmieConfig
    errorHandler: ErrorRequestHandler
    eventBase: EventBaseType
    eventStore: EventStoreType<RecordModels, SubscribeModels>
    lastHandledSequenceNumber?: number // If partially processed or loading a checkpoint, what was the last event already handled?
    piiBase?: PiiBaseType
    sequenceNumberDivergenceHandler: (params: {
        lastHandled: number
        dbLastSeqNum: number
    }) => void | Promise<void>
}) => {
    try {
        Logger.info('ShimmieStack >>>> Initializing.')
        Logger.info('ShimmieStack >>>> Environment: ' + process.env.NODE_ENV)
        Logger.info(
            'ShimmieStack >>>> Finalizing routes, setting up 404 and error handlers.',
        )
        routes.finaliseRoutes(app, errorHandler)
        Logger.info('ShimmieStack >>>>: All processors mounted')

        // Get the database started
        await eventBase.init()
        Logger.info('ShimmieStack >>>> event database connected.')

        if (piiBase) {
            await piiBase.init()
            Logger.info('ShimmieStack >>>> pii database connected.')
        }
        let dbLastSeqNum: number

        if (lastHandledSequenceNumber) {
            // ensure we aren't missing events by somehow being ahead of the max.
            const dbMaxSeqNum = await eventStore.getLatestDbSequenceNumber()
            lastHandledSequenceNumber = lastHandledSequenceNumber < dbMaxSeqNum ? lastHandledSequenceNumber : dbMaxSeqNum
        }


        Logger.info(
            lastHandledSequenceNumber
                ? `ShimmieStack >>>> Starting to replay the event stream to rebuild memory models after sequence number: ${lastHandledSequenceNumber}`
                : `ShimmieStack >>>> Starting to replay the entire event stream to rebuild memory models`,
        )
        const numEvents = await eventStore.replayEvents(lastHandledSequenceNumber ? lastHandledSequenceNumber + 1 : 0)
        Logger.info(`ShimmieStack >>>> replayed ${numEvents} events`)

        // check if synced. if not, call the handler once.
        const lastHandled = eventStore.getLastHandledSeqNum()
        dbLastSeqNum = await eventStore.getLatestDbSequenceNumber()

        if (lastHandled !== dbLastSeqNum) {
            await sequenceNumberDivergenceHandler({ dbLastSeqNum, lastHandled })
        }
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
    _next: NextFunction,
) => {
    let status = err.status ?? err.statusCode ?? 500
    Logger.error(`Caught an unhandled error:  ${err.message}`)
    return res.status(status).json({ error: 'Something went wrong' })
}

export default function ShimmieStack<
    RecordModels extends Record<string, any> = Record<string, any>,
    SubscribeModels extends Record<string, any> = Record<string, any>
>(
    config: ShimmieConfig,
    eventBase: EventBaseType,
    adminAuthorizer: AuthorizerFunc, // Authorizer function for the admin APIs (see authorizer.ts)
    piiBase?: PiiBaseType,
    appLogger?: StackLogger,
    eventBusOptions?: EventBusOptions,
): StackType<RecordModels, SubscribeModels> {
    /** Errors stop the server if not initialised, if initialised they continue on
     *  needs to be an object so any changes to it in this file will reflect
     *  in all the functions it's passed to
     *  It's passed down as options: { initialised: boolean }
     *  and options.initialised must be referenced every time
     *  if you set const initialised = options.initialised it will NOT change
     */
    const stackInitialised = { initialised: false }

    let app: Express = express()

    process.on('uncaughtException', function(err) {
        // use `winston` or your own Logger instance as appropriate
        Logger.error(`Uncaught exception occurred: ${err} - ${err.stack}`)
        if (!stackInitialised.initialised) {
            throw err
        }
    })

    process.on('unhandledRejection', (err) => {
        throw err
    })

    // need to add the raw body to the request so it can be used to sign requests
    // using the raw data as a Buffer
    app.use(
        express.json({
            verify: (req: Request & { rawBody: Buffer }, res, buf) => {
                req.rawBody = buf
            },
            limit: config.maxRequestSize,
        }),
    )

    app.use(express.urlencoded({ extended: true }))
    app.use(cookieParser())

    // if the caller provided a custom logger, use it
    configureLogger(appLogger)

    if (!eventBase) {
        throw Error('Missing event base parameter to ShimmieStack')
    }

    /** initialise the event store service by giving it an event database (db, memory, file ) */
    const eventStore = EventStore<RecordModels, SubscribeModels>({
        eventbase: eventBase,
        piiBase: piiBase,
        options: stackInitialised,
        ...(eventBusOptions && {
            eventBusOptions: { ...eventBusOptions, options: stackInitialised },
        }),
    })

    let errorHandler: ErrorRequestHandler = catchAllErrorHandler
    let sequenceNumberDivergenceHandler: (params: {
        lastHandled: number
        dbLastSeqNum: number
    }) => void | Promise<void> = (params) => {
        Logger.warn(
            `Sequence number has diverged from the DB: ${JSON.stringify({
                ...params,
            })}`,
            { ...params },
        )
    }

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

    const funcs: StackType<RecordModels, SubscribeModels> = {
        startup: async (lastHandledSequenceNumber) => {
            // if there are any post init fns registered execute them
            if (preInitFns.length) {
                Logger.info('ShimmieStack >>>> Running pre-init functions')
                await Promise.all(preInitFns.map((f) => f()))
                Logger.info(
                    'ShimmieStack >>>> Successfully completed pre-init functions',
                )
            } else {
                Logger.info('ShimmieStack >>>> No pre-init functions to run')
            }

            Logger.info('ShimmieStack >>>>>>>>>>  <<<<<<<<<<')
            Logger.info('ShimmieStack >>>> INITIALIZING <<<<')
            Logger.info('ShimmieStack >>>>>>>>>>  <<<<<<<<<<')
            await initializeShimmieStack({
                app,
                config,
                errorHandler,
                eventBase,
                eventStore,
                lastHandledSequenceNumber,
                piiBase,
                sequenceNumberDivergenceHandler,
            })
            // if there are any post init fns registered execute them
            if (postInitFns.length) {
                Logger.info('ShimmieStack >>>> Running post-init functions')
                await Promise.all(postInitFns.map((f) => f()))
                Logger.info(
                    'ShimmieStack >>>> Successfully completed post-init functions',
                )
            } else {
                Logger.info('ShimmieStack >>>> No post-init functions to run')
            }
            stackInitialised.initialised = true
        },

        restart: async () => {
            await eventStore.reset()
        },

        shutdown: () => {
            Logger.info('TODO: HOW DO YOU STOP THIS THING!!!!')
        },

        setApiVersion: (
            version: string,
        ): StackType<RecordModels, SubscribeModels> => {
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
        setErrorHandler: (
            handler: ErrorRequestHandler,
        ): StackType<RecordModels, SubscribeModels> => {
            errorHandler = handler
            Logger.info('ShimmieStack >>>> Overridden default error handler')
            return funcs
        },

        mountProcessor: (
            name: string,
            mountPoint: string,
            router: Router,
        ): StackType<RecordModels, SubscribeModels> => {
            const url = routes.mountApi(
                app,
                name,
                mountPoint,
                router,
                config.enforceAuthorization,
            )
            Logger.info(`ShimmieStack >>>> Mounted ${url} with [${name}]`)
            return funcs
        },

        subscribe<EventName extends keyof SubscribeModels>(
            type: EventName,
            handler: TypedEventHandler<EventName, SubscribeModels[EventName]>,
        ) {
            eventStore.subscribe(type, handler)
            Logger.info(
                `ShimmieStack >>>> Registered event handler: ${String(type)}`,
            )
        },
        recordUncheckedEvents: <EventName extends keyof RecordModels>(
            events: RecordUncheckedEventType<RecordModels, EventName>[],
            executionOrder?: ExecutionOrder,
        ): Promise<void> => {
            return funcs.recordEvents(
                events.map((e) => ({
                    ...e,
                    streamVersionIds: 'STREAM_VERSIONING_DISABLED',
                })),
                executionOrder,
            )
        },
        recordEvents: async <EventName extends keyof RecordModels>(
            events: RecordEventType<RecordModels, EventName>[],
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
                    throw err
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
                        throw err
                    }
                }
            }
        },
        // shorthand for disabling versionIds
        recordUncheckedEvent: <EventName extends keyof RecordModels>(
            event: RecordUncheckedEventType<RecordModels, EventName>,
        ): Promise<void> =>
            eventStore.recordEvent({
                ...event,
                streamVersionIds: 'STREAM_VERSIONING_DISABLED',
            }),
        recordEvent: <EventName extends keyof RecordModels>(
            event: RecordEventType<RecordModels, EventName>,
        ): Promise<void> => eventStore.recordEvent(event),

        // Make a new Express router
        getRouter: () => express.Router(),

        // provide the client the Express use function so they can do whatever they want
        use: (a: any) => app.use(a),

        ensureMinSequenceNumberHandled: async ({
                                                   minSequenceNumber,
                                               }): Promise<number> => {
            const dbMaxSeqNum = await eventStore.getLatestDbSequenceNumber()
            const minSeqNum = minSequenceNumber
            // replay any events after the last handled, if the requested minimum > last handled. If no requested min, get db max.
            if (eventStore.getLastHandledSeqNum() < (minSeqNum ?? dbMaxSeqNum)) {
                Logger.debug(
                    `Behind requested requested minSeqNum. Executing minSeqNum lookup: ${JSON.stringify(
                        {
                            minSeqNum: minSeqNum ?? (dbMaxSeqNum + 1), // +1 so we don't replay if both on the same max event
                            lastHandledSeqNum: eventStore.getLastHandledSeqNum(),
                        },
                    )}`,
                )
                await eventStore.replayEvents(minSeqNum)
            }
            const lastHandled = eventStore.getLastHandledSeqNum()
            Logger.debug(`Last handled sequence number: ${lastHandled}`)
            return lastHandled
        },

        getLastHandledSequenceNumber: () =>
            eventStore.getLastHandledSeqNum(),

        /**
         * Get all EventHistory of every stream ID passed - sorted oldest to newest
         * Up to the caller to collate list of related IDs, getHistory doesn't
         * know or care if they're related events
         */
        getHistory: async (
            ids: string | string[],
        ): Promise<StreamHistory<SubscribeModels> | undefined> => {
            const history = await eventStore.getStreamHistory(
                Array.isArray(ids) ? ids : [ids],
            )

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
        registerPreInitFn: (
            fn: () => void | Promise<void>,
        ): StackType<RecordModels, SubscribeModels> => {
            preInitFns.push(fn)
            return funcs
        },

        // add a function to be run after initialize
        registerPostInitFn: (
            fn: () => void | Promise<void>,
        ): StackType<RecordModels, SubscribeModels> => {
            postInitFns.push(fn)
            return funcs
        },

        registerSequenceNumberDivergenceHandler: (
            fn: (params: {
                lastHandled: number
                dbLastSeqNum: number
            }) => void | Promise<void>,
        ): StackType<RecordModels, SubscribeModels> => {
            sequenceNumberDivergenceHandler = fn
            return funcs
        },

        setAppConfig: (key: string, value: unknown) => {
            app.set(key, value)
        },

        anonymiseStreamPii: (streamId: string): Promise<void> => {
            return eventStore.anonymiseStreamPii(streamId)
        },
    }

    return funcs
}
