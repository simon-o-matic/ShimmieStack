//
// Set up all the routes from all over the place.
//

const timeLogger = (req, res, next) => {
    console.log(
        `[${new Date(Date.now()).toLocaleString()}] Route::[${req.method}] ${
            req.path
        }`
    );
    next();
};

const mountProcessorHandlers = (app, processors) => {
    // WARNING: this does not check for overwriting, so because not to mount different functions on
    //          the same head
    Object.values(processors).forEach((p) => {
        if (!p.mountPoint || !p.api)
            throw 'Missing mountPoint details. Please check';
        app.use(p.mountPoint, p.api);
        console.log(`>>>> Mounted ${p.mountPoint} with [${p.name}]`);
    });
};

const catchAll404s = (req, res, next) => {
    res.status(404).json({
        statusCode: 404,
        message: `What you talking 'bout Willis? ${req.baseUrl}`,
    });
};

const mountRouteHandlers = (app, processors) => {
    app.use(timeLogger);
    mountProcessorHandlers(app, processors);
    app.use('*', catchAll404s);

    // A catch-all call by express-async-errors
    // TODO: implement
    app.use((err, req, res, next) => {
        console.error('500', err.message);
        console.dir(err);
        res.status(500).json({ error: err.message });
    });
};

export default mountRouteHandlers;
