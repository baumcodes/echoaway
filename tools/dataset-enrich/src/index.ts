// CLI entry. Loads .env from repo root, parses flags, runs the
// requested enrichment targets, and writes the dataset JSON files
// unless --dry-run.

import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import { HELP_TEXT, parseArgs, type CliFlags } from './cli.js'
import { buildDestinationCandidates } from './enrich/destinations.js'
import { buildHotelCandidates } from './enrich/hotels.js'
import { buildActivityCandidates } from './enrich/activities.js'
import { buildTransferCandidates } from './enrich/transfers.js'
import { createGeminiClient, type GeminiClient } from './gemini.js'
import {
  readAccommodations,
  readActivities,
  readAirports,
  readDestinations,
  readTransfers,
  writeAccommodations,
  writeActivities,
  writeDestinations,
  writeTransfers,
} from './io.js'
import { mergeById } from './merge.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
loadEnv({ path: resolve(REPO_ROOT, '.env') })

async function main() {
  const flags = parseArgs(process.argv.slice(2))
  if (flags.help) {
    console.log(HELP_TEXT.trim())
    return
  }

  const gemini = resolveGeminiClient(flags)

  if (flags.only.has('destinations')) {
    await runDestinations(flags)
  }

  if (flags.only.has('hotels')) {
    await runHotels(flags, gemini)
  }

  if (flags.only.has('activities')) {
    await runActivities(flags, gemini)
  }

  if (flags.only.has('transfers')) {
    await runTransfers(flags)
  }
}

function resolveGeminiClient(flags: CliFlags): GeminiClient | null {
  if (flags.noGemini) return null
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set — falling back to synthetic enrichment')
    return null
  }
  return createGeminiClient({ apiKey })
}

async function runDestinations(flags: CliFlags) {
  const existing = await readDestinations()
  const candidates = buildDestinationCandidates()
  const { merged, added, kept } = mergeById(existing, candidates)
  console.log(`destinations: kept=${kept} added=${added} total=${merged.length}`)
  if (!flags.dryRun) await writeDestinations(merged)
}

async function runHotels(flags: CliFlags, gemini: GeminiClient | null) {
  const existing = await readAccommodations()
  const totalLimit = flags.limit ?? 600
  const perDestination = flags.perDestination ?? 12
  const candidates = await buildHotelCandidates({
    existing,
    gemini,
    totalLimit,
    perDestination,
    overpassDelayMs: 1500,
    onProgress: ({ destinationId, fetched }) => {
      console.log(`  osm hotels [${destinationId}] = ${fetched}`)
    },
  })
  const { merged, added, kept } = mergeById(existing, candidates)
  console.log(`hotels: kept=${kept} added=${added} total=${merged.length}`)
  if (!flags.dryRun) await writeAccommodations(merged)
}

async function runActivities(flags: CliFlags, gemini: GeminiClient | null) {
  const existing = await readActivities()
  const totalLimit = flags.limit ?? 300
  const perDestination = flags.perDestination ?? 6
  const candidates = await buildActivityCandidates({
    existing,
    gemini,
    totalLimit,
    perDestination,
    overpassDelayMs: 1500,
    onProgress: ({ destinationId, fetched }) => {
      console.log(`  osm attractions [${destinationId}] = ${fetched}`)
    },
  })
  const { merged, added, kept } = mergeById(existing, candidates)
  console.log(`activities: kept=${kept} added=${added} total=${merged.length}`)
  if (!flags.dryRun) await writeActivities(merged)
}

async function runTransfers(flags: CliFlags) {
  const [airports, accommodations, existing] = await Promise.all([
    readAirports(),
    readAccommodations(),
    readTransfers(),
  ])
  const candidates = buildTransferCandidates({
    airports,
    accommodations,
    existing,
    totalLimit: flags.limit ?? 50,
  })
  const { merged, added, kept } = mergeById(existing, candidates)
  console.log(`transfers: kept=${kept} added=${added} total=${merged.length}`)
  if (!flags.dryRun) await writeTransfers(merged)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
