//
// Entry point of the application. Gets everything started.
//
import express, { Application, Router, Request, Response } from 'express';
import cors, { CorsOptions } from 'cors';
import cookieParser from 'cookie-parser';
import eventbase from './eventbase-postgres';
import * as routes from './routes';
import AnEventStore, { EventStore } from './eventstore';
import {
    StreamId,
    EventData,
    Meta,
    EventName,
    EventHandler,
    Event,
    EventBase,
} from './event';

import AdminProcessor from './admin_processor';

const STACK_VERSION = '0.4';

const app = express();
app.use(express.json());
app.use(cookieParser());

export { Request, Response, Router };

export interface ShimmieConfig {
    ServerPort: number;
    CORS?: CorsOptions;
}

// testing a new naming scheme. Replace IEvent if we like this one better. Easier
// for users to not be confused with their own event types (eg an event sourced system!)
export type ShimmieEvent = Event;

export type StackType = {
    setApiVersion: (version: string) => StackType;
    router: () => Router;
    recordEvent: (
        streamdId: StreamId,
        eventName: EventName,
        eventData: EventData,
        meta: Meta
    ) => void;
    startup: () => void;
    restart: () => void;
    shutdown: () => void;
    registerModel<T>(name: string, model: T): void;
    getModel<T>(name: string): T;
    mountProcessor: (
        name: string,
        mountPoint: string,
        router: Router
    ) => StackType;
    subscribe: (eventName: EventName, handler: EventHandler) => void;
    use: (a: any) => any;
};

const startApiListener = (app: Application, port: number) => {
    app.listen(port, () =>
        console.info(
            `ShimmieStack [${STACK_VERSION}] API Server listening on ${port}!`
        )
    );
};

const startup = async (
    config: ShimmieConfig,
    eventBase: EventBase,
    eventStore: EventStore
) => {
    try {
        console.info('ShimmieStack Start up sequence initiated.');
        console.info('ShimmieStack Environment:', process.env.NODE_ENV);
        console.info('ShimmieStack Config:', config);

        routes.finaliseRoutes(app);
        console.info('ShimmieStack: All processors mounted');

        // Get the database started
        await eventBase.init();

        console.info('ShimmieStack: database connected.');

        // Process the entire event history on start up and load into memory
        console.info(
            `ShimmieStack: Starting to replay the entire event stream to rebuild memory models`
        );
        const numEvents = await eventStore.replayAllEvents();
        console.info(`ShimmieStack: replayed ${numEvents} events`);

        // Start accepting requests from the outside world
        startApiListener(app, config.ServerPort);

        console.info('ShimmieStack: Start up complete');
    } catch (err) {
        console.info(
            'ShimmieStack1 Error during start up, aborting (',
            err,
            ')'
        );
    }
};

export default function ShimmieStack(
    config: ShimmieConfig,
    eventBase: EventBase
): StackType {
    if (!eventBase) throw Error('Missing event base parameter to ShimmieStack');

    /** initialise the event store service by giving it an event database (db, memory, file ) */
    const eventStore = AnEventStore(eventBase);

    app.use(cors(config.CORS || {}));

    // Set of loggers and authentication before all user-defined routes
    routes.initRoutes(app);

    // Install the admin API route
    // TODO: work out how to secure this. Need a client role.
    routes.mountApi(
        app,
        'Administration API',
        '/admin',
        AdminProcessor(eventStore, eventBase)
    );

    let apiVersion = '';
    let modelStore: { [key: string]: any } = {};

    const funcs: StackType = {
        startup: () => {
            startup(config, eventBase, eventStore);
        },

        restart: () => {
            console.log('TODO: empty everything and replay results');
        },

        shutdown: () => {
            console.log('TODO: HOW DO YOU STOP THIS THING!!!!');
        },

        setApiVersion: (version: string) => {
            apiVersion = version;
            return funcs;
        },

        registerModel: (name: string, model: any) => {
            modelStore[name] = model;
        },

        getModel: (name: string): any => {
            const model = modelStore[name];
            if (!model) throw new Error('No registered model found: ' + name);
            return modelStore[name];
        },

        mountProcessor: (name: string, mountPoint: string, router: Router) => {
            routes.mountApi(app, name, mountPoint, router);
            return funcs;
        },

        subscribe: (eventName: EventName, handler: EventHandler) => {
            console.log('ShimmieStack: Registering event handler: ', eventName);
            eventStore.subscribe(eventName, handler);
        },

        recordEvent: (
            streamdId: StreamId,
            eventName: EventName,
            eventData: EventData,
            meta: Meta
        ) => eventStore.recordEvent(streamdId, eventName, eventData, meta),

        // Make a new Express router
        router: () => express.Router(),

        use: (a: any) => app.use(a),
    };

    return funcs;
}
