# Backup

A tool to backup all data for disaster recovery!

## Usage

Drop a `.env` file in the project root and populate:

```sh
DATABASE_CONNECTION=<value>
RO_DATABASE_CONNECTION=<value>
IPFS_ADDRS=<value>
S3_REGION=<value>
S3_ACCESS_KEY_ID=<value>
S3_SECRET_ACCESS_KEY=<value>
S3_BUCKET_NAME=<value>
REDIS_CONN_STRING=<value> # optional - used to store CIDs that timed out during fetch
```

Replace `DATABASE_CONNECTION` with the connection string for the database you want to write to and `RO_DATABASE_CONNECTION` with the connection string for the database you want to read from, `IPFS_ADDRS` with the multiaddrs of nodes where content can be found and `S3_*` with the relevant S3 bucket details.

Start the backup:

```sh
npm start
# with optional start date:
npm start -- 2021-12-25
```

The tool writes _complete_ CAR files to the S3 bucket to a path like: `complete/<CID>.car`. Where `CID` is a normalized, v1 base32 encoded CID.

### Docker

There's a `Dockerfile` that runs the tool in docker.

```sh
docker build -t backup .
docker run -d backup
```
