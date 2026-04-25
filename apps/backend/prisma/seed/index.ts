import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(__dirname, '../../../../.env') })

import { prisma } from './shared/db.js'
import { seedCatalog } from './catalog/index.js'
import { printSanity } from './sanity.js'

type Mode = 'catalog' | 'demo'

const argv = process.argv.slice(2)
const flag = argv.find((a) => !a.startsWith('--'))
const mode: Mode = flag === 'demo' ? 'demo' : 'catalog'

async function main() {
  console.log(`[seed] mode=${mode}`)
  await seedCatalog()
  if (mode === 'demo') {
    // Phase 2C will fill this in.
    console.log('[seed] demo-trip seed not yet implemented (Phase 2C)')
  }
  await printSanity()
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
