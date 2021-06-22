import processors from './processors';
import ShimmieStack from '../src/main';

const config = {
    EventbaseURL: process.env.DATABASE_URL,
    ServerPort: process.env.PORT,
};

const shimmieStack = new ShimmieStack(processors, config);
shimmieStack.startup();
