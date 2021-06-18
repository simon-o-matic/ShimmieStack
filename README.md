# XXX Server With Event Sourcing - Do what you will

# Technologies

-   Hosting: Digital Ocean App Platform
-   Database: Event sourced is a development database in Postgres
-   There is currently no prod database

# Running

## Deployment

Deployment happens on every github push.

## Development

Set up a .env file with the following:

> DATABASE_URL=postgresql://themainevent:nttd9vqzbb3nuw0z@app-b0a7ee08-fb49-4405-ae82-69fcf0fc91df-do-user-8223711-0.b.db.ondigitalocean.com:25060/themainevent?sslmode=require
> NODE_TLS_REJECT_UNAUTHORIZED=0
> NODE_ENV=development

Then run a local server with: `npm run dev` (this uses dotenv to load the variables). The database is currently the same one in prod on DI. TODO: set up a local postgres on dev machines to run test.

Once its running you can hit the admin APIs with curl:

> curl -X POST localhost:8080/admin/create_database_tables
> curl -X POST localhost:8080/admin/drop_database_tables
> curl localhost:8080/admin/show_database_tables
> curl localhost:8080/admin/mrwolf

## Production

Uses environment variables configured throught the Digital Ocean UI.

# TODO

Implement errors following this: https://dev.to/nedsoft/central-error-handling-in-express-3aej
Event Sourcing according to this: https://dev.to/kspeakman/event-storage-in-postgres-4dk2
