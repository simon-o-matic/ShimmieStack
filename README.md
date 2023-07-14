# Shimmie Stack

A simple express-based event-sourced framework. It allows you as the
developer to focus on events and datamodels and iterate on them very quickly (without
being bogged down by heavy infrastructure) which you can evolve to scale as your understanding
of your domain and your needs evolve.

Currently, you can begin with a very basic ephemeral in memory representation of your data and then enable/replace components
(Such as persistence, or auth) as needed.

# Architecture

The main concepts are:

-   There are API handlers and Models
-   Handlers listen to user requests and generate system `events`
-   Events get broadcast through the system to any listeners
-   Models register to listen to various events and build internal models to represent the current state of the data.
-   Handlers can use models as `command models` (helping POST/PUT/DEL commands decide if the action is allowed) or as plain `query models` to respond to GET requests

The stack does the following:

- Lets you register your API handlers (express routes) to receive request
- It mounts them on to end points at various urls
- Provides a call to place a new Event on the event log
- Allow queries to register to listen to events in order to build internal data models
- Allows you to version your API
- Allows you to ensure Auth is setup
- Concurrent updates via object versioning and pessimistic stream locking
- Register a custom logger
- Integration testing framework
- Store PII separately to the eventstore to enable deletion for GDPR reasons
- Run pre/post startup scripts to patch data
- Type safety for object payloads flowing through the commands/queries

# Future Architecture Ideas

-   replay of events
    -   the stack should maintain the list of the models/commands to iterate though them before and after replay
    -   Router will need to be wrapped an part of bigger object that also contains the hooks
    -   replay flag should be REMOVED from the meta data of an event
-   date should be top level event (timestamp the event was recorded)
-   meta should be generic so the user can decide what type it is through extension
-   validation need to be added to processors at the stack level
-   X testing of all mount points needs to be part of the stack for correctness
-   X testing of event processors should also have first class testing ability
-   testing - consider using the internal App rather than creating a fake one, which will change the admin tests to be more real too

# How to use

These excerpts are from [here](https://github.com/B0yc3y/ShimmieStackExamples/tree/main/basic) see below for more example projects

This is the `index` file where you would configure the stack and register your handlers. In this example it is a song database:

```javascript
// define the stack
const songStack = ShimmieStack(
    {
        ServerPort: 8080,
        CORS: {
            origin: 'http://localhost:3000',
            credentials: true,
        },
        enforceAuthorization: false,
    },
    EventBase(),
    authorizeApi(noAuthorization), // Currently unused, API to be updated.
)

// prepare your stateful listeners
const songStateListener = SongStateListener(songStack)

// prepare the stack
songStack
    .setApiVersion('/v1')
    .mountProcessor(
        'Song Command',
        '/songs',
        SongCommand(songStack)
    )
    .mountProcessor(
        'Song Query',
        '/songs',
        SongQuery(songStateListener)
    )
    .registerPreInitFn(() => {
        console.log("An anonymous function that runs before events are replayed")
    })
    .registerPostInitFn(() => {
        console.log("An anonymous function that runs after events are replayed")
    })
    .startup()

```

The `song-command` file that contains the POSTs/writes to song data:

```javascript
export function SongCommand(
    stack: StackType,
): Router {
    const router = Router()

    // when receiving a post to /example, write an event with a timestamp.
    router.post(
        '/',
        async (req, res) => {
            const dateNow = new Date()
            const timeStamp = dateNow.toISOString()
            console.log(`Request received at: ${timeStamp}`)

            const song: Song = req.body

            // record a new song created event without checking versions
            // It is fine to not check versions when we are only running a single thread/process
            // or when we want this action to happen regardless of any potential state changes we may have missed
            await stack.recordUncheckedEvent({
                streamId: 'exampleStreamId',
                eventName: 'SONG_CREATED_EVENT',
                eventData: song,
                meta: {
                    userAgent: 'exampleAgent',
                    user: 'exampleUser',
                    date: dateNow.getDate()
                }
            })

            res.sendStatus(201)
        }
    )


    return router
}
```

And the song query file `song-query` that contains the GET/Read APIs for the song data.

```javascript
export function SongQuery(
    stateListener: SongStateListenerType
): Router {
    const router = Router()

    // when receiving a post to /example, respond with the timestamp data
    router.get(
        '/',
        async (req, res) => {
            res.status(200).json(stateListener.getSongs())
        }
    )


    return router
}
```
So very quickly you can have a flexible working event sourced server that is all in-memory to give you the maximum efficiency when building a new system.
See [https://github.com/B0yc3y/ShimmieStackExamples](https://github.com/B0yc3y/ShimmieStackExamples) for example projects.
These examples show how to persist data, use auth, object versioning, how to store PII seperately from the event store for GDPR reasons.

### todo
- Update this readme
- Make meta acceopt generic at stack creation time, default it to Meta defined here.
- Make piiFields be typesafe. Maybe a wrapper type for pii fields?
