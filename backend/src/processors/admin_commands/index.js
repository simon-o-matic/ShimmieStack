import Processor from '../processor';

import adminAPI from './admin_api.js';
import AdminCommands from './admin_commands.js';

export default function (eventStore, eventBase) {
    const adminCommands = new AdminCommands(eventStore, eventBase);
    const theApi = new adminAPI(adminCommands);

    return new Processor('Admin Command Processor', '/admin', theApi);
}
