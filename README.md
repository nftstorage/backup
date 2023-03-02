# Backup

A tool to backup data from IPFS to an S3 bucket.

## Usage

Drop a `.env` file in the project root and populate:

```sh
DATA_URL=<value> # URL to ndjson file of objects with a CID property for backing up
S3_REGION=<value>
S3_BUCKET_NAME=<value>
S3_ACCESS_KEY_ID=<value> # optional
S3_SECRET_ACCESS_KEY=<value> # optional
S3_ENDPOINT=<url> # optional, used to test against minio
CONCURRENCY=<number> # optional
BATCH_SIZE=<number> # optional
```

Start the backup:

```sh
npm start
```

Use `DEBUG=*` to get detailed debugging info.

The tool writes _complete_ CAR files to the S3 bucket to a path like: `complete/<CID>.car`. Where `CID` is a normalized, v1 base32 encoded CID.

### Docker

There's a `Dockerfile` that runs the tool in docker.

```sh
docker build -t backup .
docker run -d backup
```

### Test

With docker running on your machine you can run the tests with

```sh
npm test
```

### peers.json

This file contains the peering config for kubo with all of our cluster nodes in.

You can updated it by running

```sh
npm run make-peers
``