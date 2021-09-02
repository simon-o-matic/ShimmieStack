//
// mountPoints - can be verified not to clash? (post versus get is hard)
// Add EVENT names to ensure no clashes
// how about which events a service subscribes to, and the handlers?
//      then we can reason about which ones no one listens to. (and not send them.)

import { Router } from "express"

export default class Processor {
    name: string
    mountPoint: string
    route: Router
    events: any

    constructor(name: string, mountPoint: string, route: Router) {
        this.name = name;
        this.mountPoint = mountPoint;
        this.route = route;
    }
}
