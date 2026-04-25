import 'reflect-metadata'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

// Each spec runs in its own forked process. Load the root .env so things
// like LIVEKIT_* are available, but don't let it overwrite DATABASE_URL —
// that has to stay pointed at the test DB.
loadEnv({ path: resolve(__dirname, '../../../.env') })
process.env.DATABASE_URL = 'file:./test.db'

import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { execSync } from 'node:child_process'
import { AppModule } from '../src/app.module'

const BACKEND_DIR = resolve(__dirname, '..')

export async function bootApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  const app = moduleRef.createNestApplication()
  await app.init()
  return app
}

/**
 * Re-run the demo-trip seed against the test DB. The seed script wipes the
 * trip first so this is safe to call between specs that mutate state.
 */
export function resetDemoTrip() {
  execSync('yarn tsx prisma/seed/index.ts demo', {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'pipe',
  })
}

/**
 * Some LiveKit tests want the env present even if global-setup didn't load
 * .env into this child process. We dup the values from process.env if set.
 */
export function ensureLivekitEnvOrSkip(): boolean {
  return Boolean(
    process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET &&
      process.env.LIVEKIT_URL,
  )
}
