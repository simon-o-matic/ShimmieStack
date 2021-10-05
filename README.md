# Shimmie Stack

A simple in-memory express-based event-sourced framework. It allows you as the
developer to focus on events and datamodels and iterate on them very quickly (without
being bogged down by heavy infrastructure) which you can evolve to scale as your understanding
of your domain and your needs evolve.

# Architecture

The main concepts are:

-   There are API handlers and Models
-   Handlers listen to user requests and generate system `events`
-   Events get broadcast through the system to any listeners
-   Models register to listen to various events and build internal models to represent the current state of the data.
-   Handlers can use models as `command models` (helping POST/PUT/DEL commands decide if the action is allowed) or as plain `query models` to respond to GET requests

The stack does the following:

-   Lets you register your API handlers (express routes) to receive request
-   It mounts them on to end points at various urls
-   Provides a call to place a new Event on the event log
-   Allow queries to register to listen to events in order to build interal data models

#` How to use

There is an example project here, but here is a basic over view of the files:

This is the `index.js` file where you would configure the stack and register your handlers. In this example its a song database:

```javascript
import ShimmieStack from 'shimmiestack';

import SongCommand from './processors/song_command';
import SongQuery from './processors/song_query';

// Set up the song stack
const songStack = ShimmieStack({
    ServerPort: 8080,
});

songStack
    .setApiVersion('/v1')
    .mountProcessor('Song Commands', '/songs', SongCommand(songStack))
    .mountProcessor('Song Queries', '/songs', SongQuery(songStack))
    .startup();
```

The `song_command.js` file:

```javascript
import { v4 as uuidv4 } from 'uuid';
import songEvents from './song_events.js';

export class DoesNotExistError extends Error {}

export default function SongCommands(songStack, songModel) {
    const addSong = async (song) => {
        await songStack.recordEvent(uuidv4(), songEvents.SONG_ADDED, song, {
            user: 'Travis. T.',
        });
    };

    const deleteSong = async (songId, meta) => {
        if (!songModel.getSong(songId)) {
            throw new DoesNotExistError();
        }

        await songStack.recordEvent(songId, songEvents.SONG_DELETED, {}, meta);
    };
    return { addSong, deleteSong };
}
```

And the song API file `song_api.js` that calls the commands above looks like this:

```javascript
import { Router } from 'shimmiestack';

class Song {
    constructor(song) {
        this.title = song.title;
        this.artist = song.artist;
        this.year = song.year;
    }
}

export default function (songCommands) {
    const router = Router();

    // create a new song
    router.post('/', async (req, res) => {
        const song = new Song(req.body);
        const result = await songCommands.addSong(song, {});
        res.status(201).json(result);
    });

    router.delete('/:id', async (req, res) => {
        const id = req.params.id;
        if (!id)
            return res.status(400).json({ error: 'missing id in request' });

        try {
            await songCommands.deleteSong(id, { user: DUMMY_USER });
            res.status(204);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
```

So very quickly you can have a flexible working event sourced server that is all in-memory to give you the maximum efficiency when building a new system.

# Stack API

-   `stack.startUp()`
-   `stack.X()`
