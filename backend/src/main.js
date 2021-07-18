//
// Entry point of the application. Gets everything started.
//
import express from 'express';
import cors from 'cors';
import Eventbase from './eventbase.js';
import insertRoutes from './routes.js';
import EventStore from './eventstore.js';
import AdminProcessor from './admin_processor';
import processor from './processor.js';

const STACK_VERSION = '0.2';

const app = express();
app.use(express.json());
app.use(cors());

const startApiListener = (app, port) => {
    app.listen(port, () =>
        console.info(
            `ShimmieStack1 [${STACK_VERSION}] API Server listening on ${port}!`
        )
    );
};

const startup = async (UserProcessors, config) => {
    try {
        console.info('ShimmieStack Start up sequence initiated.');
        console.info('ShimmieStack Environment:', process.env.NODE_ENV);

        const eventBase = new Eventbase(config.EventbaseURL);
        const eventStore = new EventStore(eventBase);
        const userProcessors = new UserProcessors(eventStore);
        const adminProcessor = new AdminProcessor(eventStore, eventBase);
        // The admin processor needs access to the event database so its handled separately here

        // mount all the APIs at their chosen end points
        insertRoutes(app, userProcessors, adminProcessor);
        console.info('ShimmieStack1 Start up: All processors mounted');

        // Get the database started
        await eventBase.connect();
        await eventBase.createTables();
        console.info('ShimmieStack1 Start up: database connected.');

        // Process the entire event history on start up and load into memory
        const numEvents = await eventStore.replayAllEvents();
        console.info(`ShimmieStack1 Replayed ${numEvents} events`);

        // Start accepting requests from the outside world
        startApiListener(app, config.ServerPort);

        console.info('ShimmieStack1 Start up complete');
    } catch (err) {
        console.info(
            'ShimmieStack1 Error during start up, aborting (',
            err,
            ')'
        );
    }
};

export default function ShimmieStack(processors, config) {
    return {
        startup: () => {
            startup(processors, config);
        },

        restart: () => {
            console.log('TODO: empty everything and replay results');
        },

        shutdown: () => {
            console.log('TODO: HOW DO YOU STOP THIS THING!!!!');
        },
    };
}

export const Processor = processor;
