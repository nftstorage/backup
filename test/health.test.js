import test from 'ava'
import { setTimeout } from 'node:timers/promises'
import { createHealthCheckServer } from '../health.js'

test('heathcheck throws if gracePeriodMs not defined', async t => {
  const error = t.throws(createHealthCheckServer)
  t.is('createHealthCheckServer requires gracePeriodMs be set', error.message)
})

test('heathcheck throws if sourceDataFile not defined', async t => {
  const error = t.throws(() => createHealthCheckServer({ gracePeriodMs: 1 }))
  t.is('createHealthCheckServer requires sourceDataFile be set', error.message)
})

test('heathcheck', async t => {
  const gracePeriodMs = 100
  const health = createHealthCheckServer({ sourceDataFile: 'test1', gracePeriodMs })
  await new Promise((resolve, reject) => {
    health.srv.listen(9999, '127.0.0.1', resolve)
    health.srv.on('error', reject)
  })

  let res = await fetch('http://127.0.0.1:9999')
  t.is(res.status, 200)
  let obj = await res.json()
  t.true(obj.msSinceLastHeartbeat <= gracePeriodMs, JSON.stringify(obj))

  await setTimeout(gracePeriodMs)

  res = await fetch('http://127.0.0.1:9999')
  t.is(res.status, 500)
  obj = await res.json()
  t.true(obj.msSinceLastHeartbeat > gracePeriodMs, JSON.stringify(obj))

  health.heartbeat()

  res = await fetch('http://127.0.0.1:9999')
  t.is(res.status, 200)
  obj = await res.json()
  t.true(obj.msSinceLastHeartbeat <= gracePeriodMs, JSON.stringify(obj))
  t.false(obj.done, JSON.stringify(obj))

  health.done()
  await setTimeout(gracePeriodMs)

  res = await fetch('http://127.0.0.1:9999')
  t.is(res.status, 200, 'ok even after gracePeriodMs after done called')
  obj = await res.json()
  t.true(obj.done, JSON.stringify(obj))
})
