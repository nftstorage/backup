import debug from 'debug'
import { CID } from 'multiformats'
import formatNumber from 'format-number'

const fmt = formatNumber()
const log = debug('backup:candidate')
const DAY = 1000 * 60 * 60 * 24

const GET_UPLOADS = `
   SELECT u.id::TEXT, u.source_cid, u.content_cid, u.user_id::TEXT
     FROM upload u
LEFT JOIN backup b
       ON u.id = b.upload_id
    WHERE u.updated_at >= $1
      AND u.updated_at < $2
      AND b.url IS NULL
`

/**
 * Fetch a list of CIDs that need to be backed up.
 *
 * @param {import('pg').Client} db Postgres client.
 * @param {Date} [startDate]
 */
export async function * getCandidate (db, startDate = new Date(0)) {
  let fromDate = startDate
  let toDate = new Date(fromDate.getTime() + DAY)
  while (true) {
    log(`fetching uploads between ${fromDate.toISOString()} -> ${toDate.toISOString()}`)
    const { rows: uploads } = await db.query(GET_UPLOADS, [
      fromDate.toISOString(),
      toDate.toISOString()
    ])

    for (const [index, upload] of uploads.entries()) {
      log(`processing ${fmt(index + 1)} of ${fmt(uploads.length)}`)
      /** @type {import('./bindings').BackupCandidate} */
      const candidate = {
        sourceCid: CID.parse(upload.source_cid),
        contentCid: CID.parse(upload.content_cid),
        userId: String(upload.user_id),
        uploadId: String(upload.id)
      }
      yield candidate
    }

    fromDate = toDate
    toDate = new Date(fromDate.getTime() + DAY)

    if (fromDate.getTime() > Date.now()) break
  }
}
