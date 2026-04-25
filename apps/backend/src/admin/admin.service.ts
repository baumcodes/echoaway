import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const BACKEND_DIR = resolve(__dirname, '..', '..')
const SEED_TIMEOUT_MS = 10_000

/**
 * Re-runs the demo-trip seed pipeline so the demo state is back to its
 * pristine 4-night stay. Used by the dev "Reset trip" button when the
 * tester has consumed the bookable slack across multiple confirms.
 *
 * Implementation: spawn `tsx prisma/seed/index.ts demo` as a child
 * process. The seed module is the single source of truth for demo-trip
 * composition; we don't want a second copy of that logic inside Nest.
 */
@Injectable()
export class AdminService {
  async resetDemoTrip(): Promise<void> {
    await new Promise<void>((resolveDone, rejectDone) => {
      const proc = spawn(
        'node',
        [
          '--import',
          'tsx',
          resolve(BACKEND_DIR, 'prisma/seed/index.ts'),
          'demo',
        ],
        {
          cwd: BACKEND_DIR,
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      let stderr = ''
      proc.stderr.on('data', (c: Buffer) => {
        stderr += c.toString()
      })
      const killer = setTimeout(() => {
        proc.kill('SIGKILL')
        rejectDone(
          new InternalServerErrorException(
            `Demo-trip reset timed out after ${SEED_TIMEOUT_MS}ms`,
          ),
        )
      }, SEED_TIMEOUT_MS)
      proc.on('error', (err) => {
        clearTimeout(killer)
        rejectDone(
          new InternalServerErrorException(
            `Demo-trip reset failed: ${err.message}`,
          ),
        )
      })
      proc.on('close', (code) => {
        clearTimeout(killer)
        if (code === 0) {
          resolveDone()
          return
        }
        rejectDone(
          new InternalServerErrorException(
            `seed:demo exited with code ${code}: ${stderr.slice(0, 600)}`,
          ),
        )
      })
    })
  }
}
