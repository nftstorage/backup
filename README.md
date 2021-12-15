# Backup

A tool to backup all data for disaster recovery.

## Usage

Drop a `.env` file in the project root and populate:

```sh
APP=web3.storage # or nft.storage
DATABASE_CONNECTION=<value>
IPFS_ADDRS=<value>
S3_REGION=<value>
S3_ACCESS_KEY_ID=<value>
S3_SECRET_ACCESS_KEY=<value>
S3_BUCKET_NAME=<value>
```

Replace `DATABASE_CONNECTION` with the connection string for the database you want to read from/write to, `IPFS_ADDRS` with the multiaddrs of nodes where content can be found and `S3_*` with the relevant S3 bucket details.

Start the backup:

```sh
npm start
# with optional start date:
npm start -- 2021-12-25 # TODO: no work yet
```

The tool writes _complete_ CAR files to the S3 bucket to a path like: `complete/<CID>.car`. Where `CID` is a normalized, v1 base32 encoded CID.
