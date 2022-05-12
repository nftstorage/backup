#!/usr/bin/env node

import dotenv from 'dotenv'
import { startBackup } from './index.js'

dotenv.config()

startBackup({
  startDate: process.argv[2] ? new Date(process.argv[2]) : undefined,
  dbConnString: mustGetEnv('DATABASE_CONNECTION'),
  roDbConnString: mustGetEnv('RO_DATABASE_CONNECTION'),
  ipfsAddrs: mustGetEnv('IPFS_ADDRS').split(','),
  s3Region: mustGetEnv('S3_REGION'),
  s3AccessKeyId: mustGetEnv('S3_ACCESS_KEY_ID'),
  s3SecretAccessKey: mustGetEnv('S3_SECRET_ACCESS_KEY'),
  s3BucketName: mustGetEnv('S3_BUCKET_NAME'),
  maxDagSize: process.env.MAX_DAG_SIZE ? parseInt(process.env.MAX_DAG_SIZE) : undefined,
  concurrency: process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY) : undefined,
  redisConnString: process.env.REDIS_CONN_STRING
})

/**
 * @param {string} name
 */
function mustGetEnv (name) {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name} environment variable`)
  return value
}
