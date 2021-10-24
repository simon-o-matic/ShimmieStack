import { Router } from 'express'
import AdminRoutes from './admin_routes'
import AdminCommands from './admin_commands'
import { EventBaseType } from '../event'

export default function (eventBase: EventBaseType): Router {
    const adminCommands = AdminCommands(eventBase)
    return AdminRoutes(adminCommands)
}
