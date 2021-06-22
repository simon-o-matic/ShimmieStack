//
// Set up all the routes from all over the place.
//

const timeLogger = (req, res, next) => {
    console.info(
        `[${new Date(Date.now()).toLocaleString()}] Route::[${req.method}] ${
            req.path
        }`
    );
    next();
};

const mountProcessors = (app, processors) => {
    // WARNING: this does not check for overwriting, so because not to mount different functions on
    //          the same head
    for (let p of processors) {
        if (!p.mountPoint || !p.route)
            throw 'Missing mountPoint details. Please check: ' + p;
        app.use(p.mountPoint, p.route);
        console.info(`>>>> Mounted ${p.mountPoint} with [${p.name}]`);
    }
};

const catchAll404s = (req, res, next) => {
    res.status(404).json({
        statusCode: 404,
        message: `What you talking 'bout Willis? ${req.baseUrl}`,
    });
};

const insertRoutes = (app, userProcessors, adminProcessor) => {
    // pre-run middleware
    app.use(timeLogger);

    // user api processing handlers
    mountProcessors(app, [adminProcessor, ...userProcessors]);

    // call-all 404s
    app.use('*', catchAll404s);

    // A catch-all call by express-async-errors
    // TODO: implement
    app.use((err, req, res, next) => {
        console.error('500', err.message);
        console.dir(err);
        res.status(500).json({ error: err.message });
    });
};

export default insertRoutes;
