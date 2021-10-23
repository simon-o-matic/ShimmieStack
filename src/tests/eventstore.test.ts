import EventBase from '../eventbase-memory';
import EventStore from '../eventstore';
import { Meta } from '../event';

// TODO: switch to a test database
// WHY DO WE NEED .default here? Some module crap!
const eventBase = EventBase();
const eventStore = EventStore(eventBase);

// ignore event meta data
const meta: Meta = {
    user: {},
    replay: false,
    date: 123,
    userAgent: 'test agent',
};

beforeAll(async () => {
    console.info('Connecting to the songbase test database');
    await eventBase.init();
});

beforeEach(async () => {
    await eventBase.reset();
});

afterAll(async () => {
    console.info('Finishing with the songbase test database');
    await eventBase.shutdown();
});

describe('when creating the eventstore', () => {
    beforeEach(async () => {
        await eventBase.reset();
    });

    it('there should be no events in the database', async () => {
        const numEvents = await eventStore.getAllEvents();
        expect(numEvents.length).toEqual(0);
    });
});

describe('when recording an event', () => {
    beforeEach(async () => {
        await eventBase.reset();
    });

    it('there should be one event in the database if one is recorded', async () => {
        await eventStore.recordEvent(
            'streamid',
            'type',
            { data: 'blah' },
            meta
        );
        const numEvents = await eventStore.getAllEvents();

        expect(numEvents.length).toEqual(1);
    });

    it('there should be two events in the database when two are recorded', async () => {
        await eventStore.recordEvent(
            'streamid',
            'type',
            { data: 'blah' },
            meta
        );
        await eventStore.recordEvent(
            'streamid',
            'type',
            { data: 'blah' },
            meta
        );
        const allEvents = await eventStore.getAllEvents();

        expect(allEvents.length).toEqual(2);
    });

    it('there should be one event emitted per type', async () => {
        const mockReceiver = jest.fn();

        eventStore.subscribe('delete_type', mockReceiver);

        await eventStore.recordEvent(
            'streamid',
            'delete_type',
            { data: 'blah' },
            meta
        );

        expect(mockReceiver).toHaveBeenCalledTimes(1);
    });
});
