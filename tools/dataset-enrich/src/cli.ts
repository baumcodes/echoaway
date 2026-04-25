// Tiny argv parser for the enrich CLI. No external dep needed.

export type CliFlags = {
  only: Set<'destinations' | 'hotels' | 'activities' | 'transfers'>
  limit: number | null
  dryRun: boolean
  noGemini: boolean
  refreshOsm: boolean
  perDestination: number | null
  help: boolean
}

const ALL_TARGETS = ['destinations', 'hotels', 'activities', 'transfers'] as const

export function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    only: new Set(ALL_TARGETS),
    limit: null,
    dryRun: false,
    noGemini: false,
    refreshOsm: false,
    perDestination: null,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!
    if (a === '--help' || a === '-h') {
      flags.help = true
    } else if (a === '--dry-run') {
      flags.dryRun = true
    } else if (a === '--no-gemini') {
      flags.noGemini = true
    } else if (a === '--refresh-osm') {
      flags.refreshOsm = true
    } else if (a === '--only') {
      const next = argv[++i]
      if (!next) throw new Error('--only requires a value')
      flags.only = parseTargets(next)
    } else if (a.startsWith('--only=')) {
      flags.only = parseTargets(a.slice('--only='.length))
    } else if (a === '--limit') {
      flags.limit = Number.parseInt(argv[++i] ?? '', 10)
    } else if (a.startsWith('--limit=')) {
      flags.limit = Number.parseInt(a.slice('--limit='.length), 10)
    } else if (a === '--per-destination') {
      flags.perDestination = Number.parseInt(argv[++i] ?? '', 10)
    } else if (a.startsWith('--per-destination=')) {
      flags.perDestination = Number.parseInt(
        a.slice('--per-destination='.length),
        10,
      )
    } else {
      throw new Error(`unknown argument: ${a}`)
    }
  }

  if (flags.limit !== null && !Number.isFinite(flags.limit)) {
    throw new Error('--limit must be a number')
  }
  if (flags.perDestination !== null && !Number.isFinite(flags.perDestination)) {
    throw new Error('--per-destination must be a number')
  }

  return flags
}

function parseTargets(raw: string): CliFlags['only'] {
  const tokens = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const out = new Set<CliFlags['only'] extends Set<infer U> ? U : never>()
  for (const t of tokens) {
    if (!ALL_TARGETS.includes(t as (typeof ALL_TARGETS)[number])) {
      throw new Error(`unknown target: ${t} (allowed: ${ALL_TARGETS.join(',')})`)
    }
    out.add(t as (typeof ALL_TARGETS)[number])
  }
  if (out.size === 0) throw new Error('--only is empty')
  return out
}

export const HELP_TEXT = `
Usage: yarn workspace @echoaway/dataset-enrich enrich [flags]

Flags:
  --only <list>           Comma-separated targets: destinations,hotels,activities,transfers
                          (default: all)
  --limit <n>             Hard cap on TOTAL new rows produced for hotels/activities
  --per-destination <n>   Override default new rows per destination
  --no-gemini             Skip Gemini enrichment (use synthetic fallback fields)
  --refresh-osm           Force re-fetch of OSM data even if cache is fresh
  --dry-run               Compute candidates and print summary, don't write JSON
  -h, --help              Show this message

Targets:
  destinations    Add curated Spanish destinations (no OSM, no Gemini)
  hotels          Pull tourism=hotel from OSM and enrich with Gemini
  activities      Pull tourism=attraction from OSM and enrich with Gemini
  transfers       Generate airport↔hotel transfers from existing dataset

Environment:
  GEMINI_API_KEY  Required for hotels/activities unless --no-gemini is set
`
