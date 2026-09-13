import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { secureDatabaseUrl } from '../db/connection.js'

test('remote database connections require TLS and server certificate verification', () => {
  for (const query of ['', '?sslmode=disable', '?sslmode=no-verify', '?ssl=false', '?sslmode=require&uselibpqcompat=true']) {
    const client = new pg.Client({ connectionString: secureDatabaseUrl(`postgresql://test:synthetic@db.example.com/test${query}`) })
    assert(client.ssl)
    assert.notEqual(client.ssl.rejectUnauthorized, false)
    assert.equal(client.ssl.checkServerIdentity, undefined)
  }
})

test('a remote host query parameter cannot bypass TLS using a loopback URI hostname', () => {
  for (const query of ['host=db.example.com', 'host=localhost&host=db.example.com']) {
    const client = new pg.Client({ connectionString: secureDatabaseUrl(`postgresql://localhost/test?${query}&sslmode=disable`) })
    assert(client.ssl)
    assert.notEqual(client.ssl.rejectUnauthorized, false)
  }
})

test('Supabase connections trust the bundled public CA without disabling verification', () => {
  const client = new pg.Client({ connectionString: secureDatabaseUrl('postgresql://test:synthetic@aws-0-test.pooler.supabase.com/test') })
  assert(client.ssl.ca.includes('BEGIN CERTIFICATE'))
  assert.notEqual(client.ssl.rejectUnauthorized, false)
  assert.equal(client.ssl.checkServerIdentity, undefined)
})

test('local test databases remain usable without TLS', () => {
  const uri = 'postgresql://postgres@127.0.0.1:55439/rcs_security_test'
  assert.equal(secureDatabaseUrl(uri), uri)
  assert.equal(secureDatabaseUrl(undefined), undefined)
})

test('invalid database URLs never expose their input in error messages', () => {
  assert.throws(() => secureDatabaseUrl('synthetic-secret'), error => !error.message.includes('synthetic-secret'))
})
