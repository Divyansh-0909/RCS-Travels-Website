// One synthetic Prisma action. Credentials stay in the owned private fixture file.
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { AccountRetentionError, deleteAccountRecords, deleteSavedPlaceRecords } from '../../services/accountRetention.js'

const file = resolve(process.argv[2] ?? '')
const config = JSON.parse(await readFile(file, 'utf8'))
const allowed = resolve(process.env.LOCALAPPDATA, 'RCSProofloop', 'native-synthetic')
const owner = resolve(allowed, config.owner)
if (dirname(owner) !== allowed || dirname(file) !== owner || config.host !== '127.0.0.1'
  || !/^retention_cleanup_lab_[a-f0-9]{32}$/.test(config.database) || config.user !== 'cleanup_app') throw new Error('OWNED_SYNTHETIC_CONFIG_REQUIRED')
const marker = JSON.parse(await readFile(resolve(owner, 'ownership.json'), 'utf8'))
if (marker.owner !== config.owner || resolve(marker.data) !== resolve(owner, 'data')) throw new Error('OWNED_SYNTHETIC_IDENTITY_REQUIRED')
const db = new PrismaClient({ adapter: new PrismaPg({ host: config.host, port: config.port, database: config.database,
  user: config.user, password: config.password, max: 1, connectionTimeoutMillis: 5000,
  options: '-c statement_timeout=15000 -c lock_timeout=5000' }) })
let result
try {
  const [identity] = await db.$queryRaw`SELECT current_user AS role,current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port`
  if (identity.role !== config.user || identity.database !== config.database || identity.host !== config.host || identity.port !== config.port) throw new Error('OWNED_DATABASE_MISMATCH')
  const active = ['pending', 'payment_pending', 'confirmed', 'assigned', 'en_route', 'reached', 'started']
  const value = config.action === 'account'
    ? await deleteAccountRecords(db, config.clerkId, active)
    : await deleteSavedPlaceRecords(db, config.clerkId, config.placeId)
  result = { status: 'SUCCESS', value, principal: identity.role }
} catch (error) {
  result = error instanceof AccountRetentionError
    ? { status: 'REFUSED', code: error.code, httpStatus: error.status }
    : { status: 'ERROR', code: typeof error.code === 'string' ? error.code : 'UNEXPECTED_ERROR' }
} finally {
  await db.$disconnect()
}
console.log(JSON.stringify(result))
