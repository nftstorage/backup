import http from 'node:http'

/**
 * @param {object} config
 * @param {string} config.sourceDataFile
 * @param {number} config.gracePeriodMs
 */
export function createHealthCheckServer ({ sourceDataFile, gracePeriodMs } = {}) {
  if (gracePeriodMs === undefined) {
    throw new Error('createHealthCheckServer requires gracePeriodMs be set')
  }
  if (sourceDataFile === undefined) {
    throw new Error('createHealthCheckServer requires sourceDataFile be set')
  }
  // Track the timestamp of the last log line. Should be less than REPORT_INTERVAL
  let lastHeartbeat = Date.now()
  let done = false
  const srv = http.createServer((_, res) => {
    const msSinceLastHeartbeat = Date.now() - lastHeartbeat
    const status = !done && msSinceLastHeartbeat > gracePeriodMs ? 500 : 200
    res.setHeader('Content-Type', 'application/json')
    res.writeHead(status)
    res.end(JSON.stringify({ status, msSinceLastHeartbeat, sourceDataFile, done }))
  })
  return {
    srv,
    done: () => { done = true },
    heartbeat: (timestamp = Date.now()) => { lastHeartbeat = timestamp }
  }
}
