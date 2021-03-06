import { Multiaddr } from 'multiaddr'
import shuffle from 'array-shuffle'
import debug from 'debug'

const log = debug('backup:swarm-bind')
const CONNECT_TIMEOUT = 1000 * 10

/**
 * Say connected to one or more of the passed addrs
 *
 * @param {import('./ipfs-client').IpfsClient} ipfs
 * @param {Array<string|Multiaddr>} addrs
 * @param {Object} [options]
 * @param {number} [options.minConnections]
 * @param {number} [options.checkInterval]
 */
export async function swarmBind (ipfs, addrs, options) {
  options = options || {}

  const minConnections = options.minConnections
    ? Math.min(options.minConnections, addrs.length)
    : addrs.length
  const checkInterval = options.checkInterval || 1000 * 60
  const maddrs = addrs.map(a => new Multiaddr(a))

  let timeoutId
  let canceled = false

  const checkAndConnect = async () => {
    const { Peers: peers } = await ipfs.swarmPeers()
    if (canceled) return

    const unconnectedAddrs = shuffle(maddrs)
      .filter(addr => {
        const peerId = addr.getPeerId()
        const isConnected = peers.some(({ Peer }) => Peer === peerId)
        return !isConnected
      })

    const connectedCount = maddrs.length - unconnectedAddrs.length

    if (minConnections - connectedCount > 0) {
      log(`${connectedCount} of ${maddrs.length} addresses connected (target ${minConnections})`)

      await Promise.all(
        unconnectedAddrs
          .slice(0, minConnections - connectedCount)
          .map(addr => (async () => {
            try {
              log(`connecting to ${addr}`)
              await ipfs.swarmConnect(addr, { timeout: CONNECT_TIMEOUT })
            } catch (err) {
              log(`failed to connect to ${addr}`, err)
            }
          })())
      )
    }

    if (!canceled) {
      timeoutId = setTimeout(checkAndConnect, checkInterval)
    }
  }

  await checkAndConnect()

  return () => {
    clearTimeout(timeoutId)
    canceled = true
  }
}
