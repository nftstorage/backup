import pipe from 'it-pipe'
import { create as createIpfs } from 'ipfs-http-client'
import debug from 'debug'
import pg from 'pg'
import { S3Client } from '@aws-sdk/client-s3'
import { getCandidate } from './candidate.js'
import { exportCar } from './export.js'
import { uploadCar } from './remote.js'
import { registerBackup } from './register.js'
import { swarmBind } from './ipfs-swarm-bind-shim.js'

const log = debug('backup:index')

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
 */
export async function startBackup ({
  startDate = new Date('2021-03-01'), // NFT.Storage was launched in March 2021
  dbConnString,
  roDbConnString,
  ipfsAddrs,
  s3Region,
  s3AccessKeyId,
  s3SecretAccessKey,
  s3BucketName
}) {
  log('starting IPFS...')
  const ipfs = createIpfs()

  log('binding to peers...')
  const unbind = await swarmBind(ipfs, ipfsAddrs)

  log('connecting to PostgreSQL database...')
  const db = new pg.Client({ connectionString: dbConnString })
  await db.connect()

  log('connecting to read-only PostgreSQL database...')
  const roDb = new pg.Client({ connectionString: roDbConnString })
  await roDb.connect()

  try {
    await pipe(getCandidate(roDb, startDate), async (source) => {
      // TODO: parallelise
      for await (const candidate of source) {
        log(`processing candidate ${candidate.sourceCid}`)
        const s3 = new S3Client({
          region: s3Region,
          credentials: {
            accessKeyId: s3AccessKeyId,
            secretAccessKey: s3SecretAccessKey
          }
        })
        try {
          await pipe(
            [candidate],
            exportCar(ipfs),
            uploadCar(s3, s3BucketName),
            registerBackup(db)
          )
        } catch (err) {
          log(`failed to backup ${candidate.sourceCid}`, err)
        } finally {
          log('garbage collecting repo...')
          let count = 0
          for await (const res of ipfs.repo.gc()) {
            if (res.err) {
              log(`failed to GC ${res.cid}:`, res.err)
            } else {
              count++
            }
          }
          log(`garbage collected ${count} CIDs`)
        }
      }
    })
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
