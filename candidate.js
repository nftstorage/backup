import debug from 'debug'
import { CID } from 'multiformats'
import formatNumber from 'format-number'

const fmt = formatNumber()
const log = debug('backup:candidate')
const DAY = 1000 * 60 * 60 * 24
const LIMIT = 10000

const GET_UPLOADS = `
   SELECT u.id::TEXT, u.source_cid, u.content_cid, u.user_id::TEXT, b.url
     FROM upload u
LEFT JOIN backup b
       ON u.id = b.upload_id
    WHERE u.updated_at >= $1
      AND u.updated_at < $2
   OFFSET $3
    LIMIT $4
`

/**
 * Fetch a list of CIDs that need to be backed up.
 *
 * @param {import('pg').Client} db Postgres client.
 * @param {Object} [options]
 * @param {Date} [options.startDate]
 * @param {(cid: CID) => Promise<boolean>} [options.filter]
 */
export async function * getCandidate (db, options = {}) {
  const startDate = options.startDate || new Date(0)
  let fromDate = startDate
  let toDate = new Date(fromDate.getTime() + DAY)
  const filter = options.filter || (async () => true)
  while (true) {
    log(`fetching uploads between ${fromDate.toISOString()} -> ${toDate.toISOString()}`)
    let offset = 0
    while (true) {
      log(`fetching page ${fmt(offset / LIMIT)} of uploads between ${fromDate.toISOString()} -> ${toDate.toISOString()}`)
      const { rows } = await db.query(GET_UPLOADS, [
        fromDate.toISOString(),
        toDate.toISOString(),
        offset,
        LIMIT
      ])
      if (!rows.length) break
      const uploads = rows.filter(r => !r.url)

      for (const [index, upload] of uploads.entries()) {
        const sourceCid = CID.parse(upload.source_cid)
        const keep = await filter(sourceCid)
        if (!keep) continue

        log(`processing item ${fmt(index + 1)} of ${fmt(uploads.length)} (page ${fmt(offset / LIMIT)} of uploads between ${fromDate.toISOString()} -> ${toDate.toISOString()})`)
        /** @type {import('./bindings').BackupCandidate} */
        const candidate = {
          sourceCid,
          contentCid: CID.parse(upload.content_cid),
          userId: String(upload.user_id),
          uploadId: String(upload.id)
        }
        yield candidate
      }

      offset += LIMIT
    }

    fromDate = toDate
    toDate = new Date(fromDate.getTime() + DAY)

    if (fromDate.getTime() > Date.now()) break
  }
}
