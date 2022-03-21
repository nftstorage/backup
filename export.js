import debug from 'debug'
import * as raw from 'multiformats/codecs/raw'
import * as pb from '@ipld/dag-pb'
import formatNumber from 'format-number'

const fmt = formatNumber()

const SIZE_TIMEOUT = 1000 * 30 // timeout if we can't figure out the size in 30s
const BLOCK_TIMEOUT = 1000 * 60 // timeout if we don't receive a block after 1 min
const REPORT_INTERVAL = 1000 * 60 // log download progress every minute
const MAX_DAG_SIZE = 1024 * 1024 * 1024 * 32 // don't try to transfer a DAG that's bigger than 32GB

/**
 * @param {() => Promise<import('ipfs-core').IPFS>} getIpfs
 * @param {Object} [options]
 * @param {number} [options.maxDagSize] Skip DAGs that are bigger than this.
 */
export function exportCar (ipfs, options = {}) {
  /**
   * @param {AsyncIterable<import('./bindings').BackupCandidate>} source
   * @returns {AsyncIterableIterator<import('./bindings').BackupContent>}
   */
  return async function * (source) {
    for await (const candidate of source) {
      yield { ...candidate, content: ipfsDagExport(ipfs, candidate.sourceCid, options) }
    }
  }
}

/**
 * Export a CAR for the passed CID.
 *
 * @param {import('ipfs-core').IPFS} ipfs
 * @param {import('multiformats').CID} cid
 * @param {Object} [options]
 * @param {number} [options.maxDagSize]
 */
async function * ipfsDagExport (ipfs, cid, options) {
  const log = debug(`backup:export:${cid}`)
  const maxDagSize = options.maxDagSize || MAX_DAG_SIZE

  let reportInterval
  try {
    log('determining size...')
    let bytesReceived = 0
    const bytesTotal = await getSize(ipfs, cid)
    log(bytesTotal == null ? 'unknown size' : `${fmt(bytesTotal)} bytes`)

    if (bytesTotal != null && bytesTotal > maxDagSize) {
      throw new Error(`DAG too big: ${fmt(bytesTotal)} > ${fmt(maxDagSize)}`)
    }

    reportInterval = setInterval(() => {
      const formattedTotal = bytesTotal ? fmt(bytesTotal) : 'unknown'
      log(`received ${fmt(bytesReceived)} of ${formattedTotal} bytes`)
    }, REPORT_INTERVAL)

    const controller = new AbortController() // eslint-disable-line
    const onTimeout = () => {
      log('timed out receiving blocks')
      controller.abort()
    }
    let timeoutId = setTimeout(onTimeout, BLOCK_TIMEOUT)

    for await (const chunk of ipfs.dag.export(cid, { signal: controller.signal })) {
      clearTimeout(timeoutId)
      bytesReceived += chunk.byteLength
      yield chunk
      timeoutId = setTimeout(onTimeout, BLOCK_TIMEOUT)
    }

    clearTimeout(timeoutId)
    log('done')
  } finally {
    clearInterval(reportInterval)
  }
}

/**
 * @param {import('ipfs-core').IPFS} ipfs
 * @param {import('multiformats').CID} cid
 * @returns {Promise<number | undefined>}
 */
async function getSize (ipfs, cid) {
  if (cid.code === raw.code) {
    const block = await ipfs.block.get(cid, { timeout: SIZE_TIMEOUT })
    return block.byteLength
  } else if (cid.code === pb.code) {
    const stat = await ipfs.object.stat(cid, { timeout: SIZE_TIMEOUT })
    return stat.CumulativeSize
  }
}
