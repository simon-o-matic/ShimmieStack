import { Router } from 'express'
import AdminRoutes from './admin_routes'
import AdminCommands from './admin_commands'
import { EventBaseType } from '../event'
import { AuthorizerFunc } from '../authorizers'

export default function (eventBase: EventBaseType, authorizer: AuthorizerFunc): Router {
    const adminCommands = AdminCommands(eventBase)
    return AdminRoutes(adminCommands, authorizer)
}
