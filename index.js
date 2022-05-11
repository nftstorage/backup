import { pipe } from 'it-pipe'
import debug from 'debug'
import pg from 'pg'
import { S3Client } from '@aws-sdk/client-s3'
import retry from 'p-retry'
import batch from 'it-batch'
import { IpfsClient } from './ipfs-client.js'
import { getCandidate } from './candidate.js'
import { exportCar } from './export.js'
import { uploadCar } from './remote.js'
import { registerBackup } from './register.js'
import { swarmBind } from './ipfs-swarm-bind-shim.js'

const log = debug('backup:index')
const CONCURRENCY = 10

/**
 * @param {Object} config
 * @param {Date} [config.startDate] Date to consider backups for uploads from.
 * @param {string} config.dbConnString PostgreSQL connection string.
 * @param {string} config.roDbConnString Read-only PostgreSQL connection string.
 * @param {string} config.ipfsAddrs Multiaddrs of IPFS nodes that have the content.
 * @param {string} config.s3Region S3 region.
 * @param {string} config.s3AccessKeyId S3 access key ID.
 * @param {string} config.s3SecretAccessKey S3 secret access key.
 * @param {string} config.s3BucketName S3 bucket name.
 * @param {number} [config.maxDagSize] Skip DAGs that are bigger than this.
 * @param {number} [config.concurrency] Concurrently export and upload this many DAGs.
 */
export async function startBackup ({
  startDate = new Date('2021-03-01'), // NFT.Storage was launched in March 2021
  dbConnString,
  roDbConnString,
  ipfsAddrs,
  s3Region,
  s3AccessKeyId,
  s3SecretAccessKey,
  s3BucketName,
  maxDagSize,
  concurrency = CONCURRENCY
}) {
  log('starting IPFS...')
  const ipfs = new IpfsClient()
  const identity = await retry(() => ipfs.id(), { onFailedAttempt: console.error })
  log(`IPFS ready: ${identity.ID}`)

  log('binding to peers...')
  const unbind = await swarmBind(ipfs, ipfsAddrs)

  log('connecting to PostgreSQL database...')
  const db = new pg.Client({ connectionString: dbConnString })
  await db.connect()

  log('connecting to read-only PostgreSQL database...')
  const roDb = new pg.Client({ connectionString: roDbConnString })
  await roDb.connect()

  log('configuring S3 client...')
  const s3 = new S3Client({
    region: s3Region,
    credentials: {
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey
    }
  })

  try {
    let totalProcessed = 0
    let totalSuccessful = 0
    await pipe(getCandidate(roDb, startDate), async (source) => {
      for await (const candidates of batch(source, concurrency)) {
        await Promise.all(candidates.map(async candidate => {
          log(`processing candidate ${candidate.sourceCid}`)
          try {
            await pipe(
              [candidate],
              exportCar(ipfs, { maxDagSize }),
              uploadCar(s3, s3BucketName),
              registerBackup(db)
            )
            totalSuccessful++
          } catch (err) {
            log(`failed to backup ${candidate.sourceCid}`, err)
          }
        }))
        log('garbage collecting repo...')
        let count = 0
        for await (const res of ipfs.repoGc()) {
          if (res.err) {
            log(`failed to GC ${res.cid}:`, res.err)
            continue
          }
          count++
        }
        log(`garbage collected ${count} CIDs`)
        totalProcessed++
        log(`processed ${totalSuccessful} of ${totalProcessed} CIDs successfully`)
      }
    })
    log('backup complete 🎉')
  } finally {
    try {
      log('closing DB connection...')
      await db.end()
    } catch (err) {
      log('failed to close DB connection:', err)
    }
    try {
      log('closing read-only DB connection...')
      await roDb.end()
    } catch (err) {
      log('failed to close read-only DB connection:', err)
    }
    unbind()
  }
}
