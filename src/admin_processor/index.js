import Processor from '../../processor';

import AdminRoutes from './admin_routes.js';
import AdminCommands from './admin_commands.js';

export default function (eventStore, eventBase) {
    const adminCommands = new AdminCommands(eventStore, eventBase);
    const adminAPI = new AdminRoutes(adminCommands);

    return new Processor('Admin Command Processor', '/admin', adminAPI);
}
