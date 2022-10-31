

export interface StackLogger {
    log: (message?: any, ...optionalParams: any[]) => void;
    debug: (message?: any, ...optionalParams: any[]) => void;
    error: (message?: any, ...optionalParams: any[]) => void;
    info: (message?: any, ...optionalParams: any[]) => void;
    warn: (message?: any, ...optionalParams: any[]) => void;
}

// if we're in test don't log.
const isTest = process.env.NODE_ENV === 'TEST' || process.env.JEST_WORKER_ID !== undefined

const TestLogger = {
    log: () => {},
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {}
}
export let Logger: StackLogger = isTest ? TestLogger : {
    log: console.log,
    info: console.info,
    debug: console.debug,
    warn: console.warn,
    error: console.error
}

export const configureLogger = (logger?: StackLogger): void => {
    if(!logger){
        return
    }
    Logger = isTest ? TestLogger : logger
}
