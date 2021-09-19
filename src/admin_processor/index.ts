import { Router } from 'express';
import AdminRoutes from './admin_routes';
import AdminCommands from './admin_commands';

export default function (eventStore: any, eventBase: any): Router {
    const adminCommands = AdminCommands(eventStore, eventBase);
    return AdminRoutes(adminCommands);
}
