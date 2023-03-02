#!/bin/sh
# kubo config docs: https://github.com/ipfs/kubo/blob/master/docs/config.md

# dont add provider records to the dht... e-ipfs will do that.
ipfs config --json Experimental.StrategicProviding true

# as per gateways
ipfs config --json Swarm.DisableBandwidthMetrics true

# we manually connect to nodes that send `origins` so we dont need loads of connections here.
ipfs config --json Swarm.ConnMgr.HighWater 100
ipfs config --json Swarm.ConnMgr.LowWater 50

# no MDNS plz
ipfs config --json Discovery.MDNS.Enabled false

# plz fail early if bits get flipped in blockstore
ipfs config --json Datastore.HashOnRead true

# set `Datastore.Spec.mounts.[0].child.sync false` to avoid needless extra sync calls for much perf boost.
# otherwise the rest is defaults, but we can't use ipfs config to set items in an array!
ipfs config --json Datastore.Spec.mounts '[
  {
    "child": {
      "path": "blocks",
      "shardFunc": "/repo/flatfs/shard/v1/next-to-last/2",
      "sync": false,
      "type": "flatfs"
    },
    "mountpoint": "/blocks",
    "prefix": "flatfs.datastore",
    "type": "measure"
  },
  {
    "child": {
      "compression": "none",
      "path": "datastore",
      "type": "levelds"
    },
    "mountpoint": "/",
    "prefix": "leveldb.datastore",
    "type": "measure"
  }
]'

ipfs config --json Peering.Peers "$(cat peers.json)"

echo "kubo config updated!"