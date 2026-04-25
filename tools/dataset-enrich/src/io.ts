// Read/write the JSON files in /dataset. Stable formatting so re-runs
// of the enricher produce minimal diffs.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  DatasetAccommodation,
  DatasetActivity,
  DatasetAirport,
  DatasetDestination,
  DatasetGroundTransfer,
} from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Resolve dataset path relative to the repo root (../../../dataset). */
export const DATASET_DIR = resolve(__dirname, '..', '..', '..', 'dataset')

export const DATASET_FILES = {
  destinations: 'destinations.json',
  airports: 'airports.json',
  accommodations: 'accommodations.json',
  activities: 'activities.json',
  transfers: 'ground_transfers.json',
} as const

export type DatasetFileKey = keyof typeof DATASET_FILES

async function readJson<T>(file: string): Promise<T> {
  const fullPath = resolve(DATASET_DIR, file)
  const raw = await readFile(fullPath, 'utf-8')
  return JSON.parse(raw) as T
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const fullPath = resolve(DATASET_DIR, file)
  if (!existsSync(dirname(fullPath))) {
    await mkdir(dirname(fullPath), { recursive: true })
  }
  await writeFile(fullPath, JSON.stringify(value, null, 2) + '\n', 'utf-8')
}

export const readDestinations = () =>
  readJson<DatasetDestination[]>(DATASET_FILES.destinations)
export const readAirports = () =>
  readJson<DatasetAirport[]>(DATASET_FILES.airports)
export const readAccommodations = () =>
  readJson<DatasetAccommodation[]>(DATASET_FILES.accommodations)
export const readActivities = () =>
  readJson<DatasetActivity[]>(DATASET_FILES.activities)
export const readTransfers = () =>
  readJson<DatasetGroundTransfer[]>(DATASET_FILES.transfers)

export const writeDestinations = (value: DatasetDestination[]) =>
  writeJson(DATASET_FILES.destinations, value)
export const writeAccommodations = (value: DatasetAccommodation[]) =>
  writeJson(DATASET_FILES.accommodations, value)
export const writeActivities = (value: DatasetActivity[]) =>
  writeJson(DATASET_FILES.activities, value)
export const writeTransfers = (value: DatasetGroundTransfer[]) =>
  writeJson(DATASET_FILES.transfers, value)
