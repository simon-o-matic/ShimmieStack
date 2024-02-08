//
// An in-memory version of the pii base. This is used for testing. No
// events survive a restart of the server.
//
import { PiiBaseType } from './event';

export default function PiiBase(): PiiBaseType {
    let piiData: Map<string, any> = new Map();

    const init = () => {
        return Promise.resolve();
    };

    const reset = () => {
        piiData = new Map()
        return Promise.resolve()
    }

    const shutdown = () => {
        return Promise.resolve();
    };

    const addPiiEventData = async (key: string, data: Record<string,any>): Promise<Record<string,any>> => {
        piiData.set(key, data);

        return Promise.resolve(data);
    };

    // Get all events in the correct squence for replay
    const getPiiData = async (key: string): Promise<Record<string,any> | undefined> => {
        if(piiData.has(key)){
            return piiData.get(key)
        }

        return Promise.resolve(undefined);
    };

    // Get all events in the correct squence for replay
    const getPiiLookup = async (): Promise<Record<string,any>> => {
        return Promise.resolve(piiData);
    };

    const anonymisePiiEventData = async (keys: string[]):Promise<void> => {
        return Promise.resolve()
    }

    return {
        addPiiEventData,
        anonymisePiiEventData,
        getPiiLookup,
        getPiiData,
        init,
        reset,
        shutdown,
    };
}
