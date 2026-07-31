import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dockerAvailable } from './index.js'

test('dockerAvailable returns boolean', async () => {
  const v = await dockerAvailable()
  assert.equal(typeof v, 'boolean')
})
