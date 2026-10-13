import pg from 'pg'

/**
 * Postgres integration tests run only when this points at a throwaway
 * database, e.g. postgres://user@127.0.0.1:5432/postgres
 */
export const testDatabaseUrl = process.env.SHIMMIE_TEST_DATABASE_URL

/**
 * jest runs test files in parallel workers, so each file that touches postgres
 * gets its own schema (via search_path) and can reset() without racing others.
 * Returns a connection string scoped to a freshly created schema.
 */
export const isolatedConnectionString = async (schema: string) => {
    if (!testDatabaseUrl) {
        throw new Error('SHIMMIE_TEST_DATABASE_URL is not set')
    }
    const client = new pg.Client({ connectionString: testDatabaseUrl })
    await client.connect()
    try {
        await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await client.query(`CREATE SCHEMA ${schema}`)
    } finally {
        await client.end()
    }
    const separator = testDatabaseUrl.includes('?') ? '&' : '?'
    return `${testDatabaseUrl}${separator}options=${encodeURIComponent(
        `-c search_path=${schema}`
    )}`
}

export const dropSchema = async (schema: string) => {
    const client = new pg.Client({ connectionString: testDatabaseUrl })
    await client.connect()
    try {
        await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    } finally {
        await client.end()
    }
}
