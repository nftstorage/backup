import debug from 'debug'
import { CID } from 'multiformats'
import formatNumber from 'format-number'

const fmt = formatNumber()

const log = debug('backup:candidate')

const COUNT_UPLOADS = `
   SELECT COUNT(*)
     FROM upload u
LEFT JOIN backup b
       ON u.id = b.upload_id
    WHERE u.inserted_at > $1
      AND b.url IS NULL
`

const GET_UPLOADS = `
   SELECT u.id::TEXT, u.source_cid, u.content_cid, u.user_id::TEXT
     FROM upload u
LEFT JOIN backup b
       ON u.id = b.upload_id
    WHERE u.inserted_at > $1
      AND b.url IS NULL
 ORDER BY u.inserted_at ASC
   OFFSET $2
    LIMIT $3
`

async function countUploads (db, startDate) {
  log('counting uploads without backups...')
  const { rows } = await db.query(COUNT_UPLOADS, [startDate.toISOString()])
  log(`found ${fmt(rows[0].count)} uploads without a backup`)
  return rows[0].count
}

/**
 * Fetch a list of CIDs that need to be backed up.
 *
 * @param {import('pg').Client} db Postgres client.
 * @param {import('./bindings').BackupCandidate['app']} app
 * @param {Date} [startDate]
 */
export async function * getCandidate (db, app, startDate = new Date(0)) {
  const totalCandidates = await countUploads(db, startDate)
  let offset = 0
  const limit = 10000
  let total = 0
  while (true) {
    log(`fetching ${fmt(limit)} uploads since ${startDate.toISOString()}...`)
    const { rows: uploads } = await db.query(GET_UPLOADS, [
      startDate.toISOString(),
      offset,
      limit
    ])
    if (!uploads.length) break

    for (const upload of uploads) {
      log(`processing ${fmt(total + 1)} of ${fmt(totalCandidates)}`)
      /** @type {import('./bindings').BackupCandidate} */
      const candidate = {
        sourceCid: CID.parse(upload.source_cid),
        contentCid: CID.parse(upload.content_cid),
        userId: String(upload.user_id),
        uploadId: String(upload.id),
        app
      }
      yield candidate
      total++
    }

    offset += limit
  }
}
