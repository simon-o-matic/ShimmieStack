//
// mountPoints - can be verified not to clash? (post versus get is hard)
// Add EVENT names to ensure no clashes
// how about which events a service subscribes to, and the handlers?
//      then we can reason about which ones no one listens to. (and not send them.)

export default class Processor {
    constructor(name, mountPoint, api, model) {
        this.name = name;
        this.mountPoint = mountPoint;
        this.api = api;
        this.model = model;
    }

    emptyModel() {
        this.model.empty();
    }
}
