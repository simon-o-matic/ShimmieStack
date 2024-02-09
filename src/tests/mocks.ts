import { StoredEventResponse } from '../event'

export const createEvent = (options?: Partial<StoredEventResponse>) => {
    const now = new Date()
    const event: StoredEventResponse = {
        streamId: options?.streamId ?? 'EXAMPLE_STREAM_1',
        type: options?.type ?? 'EXAMPLE_EVENT',
        streamVersionId: options?.streamVersionId ?? '1',
        meta: options?.meta ?? {
            date: now.getTime(),
            userAgent: 'blah',
            user: { id: '123' },
        },
        sequencenum: options?.sequencenum ?? 0,
        logdate: options?.logdate ?? now.toISOString(),
        data: options?.data ?? {
            key: 'value',
        },
    }

    return event
}
