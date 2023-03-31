#!/usr/bin/env node

import dotenv from 'dotenv'
import { startBackup } from './index.js'

dotenv.config()

try {
  await startBackup({
    dataURL: mustGetEnv('DATA_URL'),
    s3Region: mustGetEnv('S3_REGION'),
    s3BucketName: mustGetEnv('S3_BUCKET_NAME'),
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    s3Endpoint: process.env.S3_ENDPOINT,
    concurrency: process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY) : undefined,
    healthcheckPort: process.env.HEALTHCHECK_PORT ? parseInt(process.env.HEALTHCHECK_PORT) : undefined
  })
} catch (err) {
  console.error('exiting! startBackup threw error', err)
  process.exit(1)
}

/**
 * @param {string} name
 */
function mustGetEnv (name) {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name} environment variable`)
  return value
}
