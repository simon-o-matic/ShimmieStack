//
// Entry point of the application. Gets everything started.
//
import express from 'express';
import cors from 'cors';
import Eventbase from './eventbase.js';
import mountRouteHandlers from './routes.js';
import EventStore from './eventstore.js';
import processors from './processors';
import AdminProcessor from './processors/admin_commands';

const app = express();
app.use(express.json());
app.use(cors());

const SERVER_PORT = process.env.PORT;
const CONNECTION_STRING = process.env.DATABASE_URL;

const startApiListener = (app, port) => {
    app.listen(port, () =>
        console.log(`ShimmieStack1 API Server listening on ${port}!`)
    );
};

const startup = async () => {
    try {
        console.log('ShimmieStack1 Environment:', process.env.NODE_ENV);

        const eventBase = new Eventbase(CONNECTION_STRING);
        const eventStore = new EventStore(eventBase);
        const theProcessors = new processors(eventStore);

        // The admin processor needs access to the event database so its handled separately here
        theProcessors.adminCommands = new AdminProcessor(eventStore, eventBase);

        // mount all the APIs at their chosen end points
        mountRouteHandlers(app, theProcessors);
        console.log('ShimmieStack1 Start up: All processors mounted');

        // Get the database started
        await eventBase.connect();
        await eventBase.createTables();
        console.log('ShimmieStack1 Start up: database connected.');

        // Process the entire event history on start up and load into memory
        const numEvents = await eventStore.replayAllEvents();
        console.log(`ShimmieStack1 Replayed ${numEvents} events`);

        // Start accepting requests from the outside world
        startApiListener(app, SERVER_PORT);

        console.log('ShimmieStack1 Start up complete');
    } catch (err) {
        console.log('Whoops, aborted ShimmieStack1 Start up!', err);
    }
};

console.log('ShimmieStack1 Start up sequence initiated.');
startup();
