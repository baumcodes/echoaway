import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(__dirname, '../../../../.env') })

import { prisma } from './shared/db.js'
import { seedCatalog } from './catalog/index.js'
import { seedDemoTrip } from './demo-trip/index.js'
import { printSanity } from './sanity.js'

type Mode = 'catalog' | 'demo'

const argv = process.argv.slice(2)
const positional = argv.find((a) => !a.startsWith('--'))
const mode: Mode = positional === 'demo' ? 'demo' : 'catalog'
const reset = argv.includes('--reset')

async function main() {
  console.log(`[seed] mode=${mode}${reset ? ' (--reset)' : ''}`)
  await seedCatalog()
  if (mode === 'demo') {
    await seedDemoTrip({ reset })
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
