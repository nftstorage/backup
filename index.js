import debug from 'debug'
import { Readable } from 'stream'
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import retry from 'p-retry'
import { transform } from 'streaming-iterables'
import { parse } from 'it-ndjson'
import { pipe } from 'it-pipe'
import batch from 'it-batch'
import formatNumber from 'format-number'
import { CID } from 'multiformats'
import { IpfsClient } from './ipfs-client.js'

const fmt = formatNumber()

const BATCH_SIZE = 100
const CONCURRENCY = 10
const BLOCK_TIMEOUT = 1000 * 30 // timeout if we don't receive a block after 30s
const REPORT_INTERVAL = 1000 * 60 // log download progress every minute

/** @typedef {{ cid: string, pinned_peers: string[] }} InputData */

/**
 * @param {Object} config
 * @param {string|URL} config.dataURL
 * @param {string} config.s3Region S3 region.
 * @param {string} config.s3BucketName S3 bucket name.
 * @param {string} [config.s3AccessKeyId]
 * @param {string} [config.s3SecretAccessKey]
 * @param {number} [config.concurrency]
 * @param {number} [config.batchSize]
 */
export async function startBackup ({ dataURL, s3Region, s3BucketName, s3AccessKeyId, s3SecretAccessKey, concurrency, batchSize }) {
  const sourceDataFile = dataURL.substring(dataURL.lastIndexOf('/') + 1)
  const log = debug(`backup:${sourceDataFile}`)
  log('starting IPFS...')
  const ipfs = new IpfsClient()
  await new Promise(resolve => setTimeout(resolve, 1000))
  const identity = await retry(() => ipfs.id(), { onFailedAttempt: console.error })
  log(`IPFS ready: ${identity.ID}`)

  log('configuring S3 client...')
  const s3Conf = { region: s3Region }
  if (s3AccessKeyId && s3SecretAccessKey) {
    s3Conf.credentials = { accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey }
  }
  const s3 = new S3Client(s3Conf)

  let totalProcessed = 0
  let totalSuccessful = 0
  await pipe(
    fetchCID(dataURL),
    filterAlreadyStored(s3, s3BucketName, log),
    source => batch(source, batchSize ?? BATCH_SIZE),
    async function (source) {
      for await (const batch of source) {
        await pipe(
          batch,
          transform(concurrency ?? CONCURRENCY, async (item) => {
            log(`processing ${item.cid}`)
            try {
              const size = await retry(async () => {
                await swarmConnect(ipfs, item, log)
                let size = 0
                const source = (async function * () {
                  for await (const chunk of exportCar(ipfs, item, log)) {
                    size += chunk.length
                    yield chunk
                  }
                })()
                await s3Upload(s3, s3BucketName, item, source, log)
                return size
              })
              totalSuccessful++
              return { cid: item.cid, status: 'ok', size }
            } catch (err) {
              log(`failed to backup ${item.cid}`, err)
              return { fileName: sourceDataFile, cid: item.cid, status: 'error', error: err.message }
            } finally {
              totalProcessed++
              log(`processed ${totalSuccessful} of ${totalProcessed} CIDs successfully`)
            }
          }),
          async function (source) {
            for await (const item of source) {
              console.log(JSON.stringify(item))
            }
          }
        )

        log(`garbage collecting batch of ${batch.length} root CIDs`)
        let count = 0
        for await (const res of ipfs.repoGc()) {
          if (res.err) {
            log(`failed to GC ${res.cid}:`, res.err)
            continue
          }
          count++
        }
        log(`garbage collected ${count} CIDs`)
      }
    }
  )
  log('backup complete 🎉')
}

/**
 * @param {string|URL} url
 * @returns {AsyncIterable<InputData>}
 */
async function * fetchCID (url) {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Backup:${url} failed to fetch CIDs`)
  // @ts-ignore
  yield * parse(res.body)
}

/** @param {string} cid */
const bucketKey = cid => `complete/${CID.parse(cid).toV1()}.car`

/**
 * @param {S3Client} s3
 * @param {string} bucket
 */
function filterAlreadyStored (s3, bucket, log) {
  /** @param {import('it-pipe').Source<InputData>} source */
  return async function * (source) {
    yield * pipe(
      source,
      transform(CONCURRENCY, async item => {
        const cmd = new HeadObjectCommand({ Bucket: bucket, Key: bucketKey(item.cid) })
        try {
          await s3.send(cmd)
          log(`${item.cid} is already in S3`)
          return null
        } catch {
          return item
        }
      }),
      async function * (source) {
        for await (const item of source) {
          if (item != null) yield item
        }
      }
    )
  }
}

/**
 * @param {IpfsClient} ipfs
 */
async function * exportCar (ipfs, item, log) {
  let reportInterval
  try {
    let bytesReceived = 0

    reportInterval = setInterval(() => {
      log(`received ${fmt(bytesReceived)} bytes of ${item.cid}`)
    }, REPORT_INTERVAL)

    for await (const chunk of ipfs.dagExport(item.cid, { timeout: BLOCK_TIMEOUT })) {
      bytesReceived += chunk.byteLength
      yield chunk
    }
  } finally {
    clearInterval(reportInterval)
  }
}

/**
 * @param {IpfsClient} ipfs
 */
async function swarmConnect (ipfs, item, log) {
  if (!item.pinned_peers?.length) return
  let connected = 0
  for (const peer of item.pinned_peers) {
    try {
      await ipfs.swarmConnect(`/p2p/${peer}`)
      connected++
    } catch {}
  }
  log(`${connected} of ${item.pinned_peers.length} peers connected for ${item.cid}`)
}

/**
 * @param {import('@aws-sdk/client-s3').S3Client} s3
 * @param {string} bucketName
 * @param {InputData} item
 * @param {AsyncIterable<Uint8Array>} content
 */
async function s3Upload (s3, bucketName, item, content, log) {
  const key = bucketKey(item.cid)
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucketName,
      Key: key,
      Body: Readable.from(content),
      Metadata: { structure: 'Complete' }
    }
  })
  await upload.done()
  log(`${item.cid} successfully uploaded to ${bucketName}/${key}`)
}
