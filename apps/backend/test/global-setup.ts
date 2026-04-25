import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const BACKEND_DIR = resolve(__dirname, '..')
const TEST_DB_PATH = resolve(BACKEND_DIR, 'prisma/test.db')
const TEST_DATABASE_URL = 'file:./test.db'

/**
 * One-shot setup: nuke any prior test DB, run migrations against a fresh
 * file:./test.db, then seed catalog + demo trip. Every spec inherits the
 * env so PrismaClient picks up the test DB.
 *
 * `seed:demo` already wipes the demo trip before recreating it, so specs
 * that mutate the demo trip can call `resetDemoTrip()` (see test/helpers.ts)
 * to get back to a known state without touching catalog rows.
 */
export default async function setup() {
  process.env.DATABASE_URL = TEST_DATABASE_URL

  // Wipe any prior test DB so the migration runs cleanly.
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH)
  if (existsSync(`${TEST_DB_PATH}-journal`)) rmSync(`${TEST_DB_PATH}-journal`)

  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL }

  execSync('yarn prisma migrate deploy', {
    cwd: BACKEND_DIR,
    env,
    stdio: 'inherit',
  })

  execSync('yarn tsx prisma/seed/index.ts demo', {
    cwd: BACKEND_DIR,
    env,
    stdio: 'inherit',
  })
}
