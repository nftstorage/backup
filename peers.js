const urls = [
  'https://raw.githubusercontent.com/web3-storage/web3.storage/main/PEERS',
  'https://raw.githubusercontent.com/nftstorage/nft.storage/main/PEERS'
]

/**
 * I output the combined ipfs-cluster peer list in the format expected by kubo conf
 *
 * see: https://github.com/ipfs/kubo/blob/master/docs/config.md#peeringpeers
 */
async function main () {
  const peers = new Set()
  for (const u of urls) {
    const res = await fetch(u)
    const bod = await res.text()
    const lines = bod.split('\n').filter(l => l.startsWith('/ip4'))
    for (const line of lines) {
      const [Addr, ID] = line.split('/p2p/')
      peers.add({ ID, Addrs: [Addr] })
    }
  }
  const out = JSON.stringify(Array.from(peers.values()), null, 2)
  console.log(out)
}

await main()
