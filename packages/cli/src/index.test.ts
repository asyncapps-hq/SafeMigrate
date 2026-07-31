import { test } from 'node:test'
import assert from 'node:assert/strict'
import { doctor } from './index.js'

test('doctor returns banner', async () => {
  const d = await doctor(process.cwd())
  assert.match(d.banner, /SafeMigrate/)
  assert.equal(typeof d.docker, 'boolean')
})
