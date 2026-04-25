import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(__dirname, '../../../../.env') })

import {
  bookingPolicySchema,
  componentBookingDataSchema,
  componentEventLocationSchema,
  suggestedActionSchema,
} from '@echoaway/types'
import { z } from 'zod'
import { prisma } from './shared/db.js'

type CheckResult = { ok: boolean; label: string; detail?: string }

const checks: CheckResult[] = []
const record = (ok: boolean, label: string, detail?: string) => {
  checks.push({ ok, label, detail })
}

async function rowCounts() {
  const counts = {
    Destination: await prisma.destination.count(),
    Airport: await prisma.airport.count(),
    Supplier: await prisma.supplier.count(),
    AccommodationProduct: await prisma.accommodationProduct.count(),
    ActivityProduct: await prisma.activityProduct.count(),
    FlightRouteProduct: await prisma.flightRouteProduct.count(),
    FlightRouteLeg: await prisma.flightRouteLeg.count(),
    GroundTransferProduct: await prisma.groundTransferProduct.count(),
    Traveler: await prisma.traveler.count(),
    Trip: await prisma.trip.count(),
    Component: await prisma.component.count(),
    ComponentBooking: await prisma.componentBooking.count(),
    ComponentEvent: await prisma.componentEvent.count(),
    Disruption: await prisma.disruption.count(),
  }
  console.log('[sanity] row counts')
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`)
  return counts
}

/**
 * Catalog anchors: rows the demo trip will reference. If any are missing,
 * the demo seed will fail with a clearer message — sanity catches it earlier.
 */
async function checkCatalogAnchors() {
  const must = [
    { model: 'destination', id: 'dest-spain' },
    { model: 'destination', id: 'dest-barcelona' },
    { model: 'airport', id: 'air-bcn' },
    { model: 'airport', id: 'air-ber' },
    { model: 'flightRouteProduct', id: 'flt-ber-bcn-01' },
    { model: 'groundTransferProduct', id: 'trf-bcn-hotelbrisa' },
    { model: 'accommodationProduct', id: 'hotel-bcn-01' },
    { model: 'activityProduct', id: 'act-bcn-sagrada' },
    { model: 'activityProduct', id: 'act-bcn-cooking' },
  ] as const
  for (const m of must) {
    // @ts-expect-error — dynamic dispatch over Prisma client; the model
    // names are validated against the literal list above.
    const row = await prisma[m.model].findUnique({ where: { id: m.id } })
    record(!!row, `catalog anchor ${m.model}.${m.id}`)
  }
}

/**
 * Polymorphic-by-nullable-FK invariant: every Component has exactly one of
 * the four catalog FKs non-null and it matches `type`.
 */
async function checkComponentPolymorphism() {
  const components = await prisma.component.findMany()
  for (const c of components) {
    const fks = {
      flight: c.flightRouteProductId,
      accommodation: c.accommodationProductId,
      activity: c.activityProductId,
      transfer: c.groundTransferProductId,
    }
    const setKeys = Object.entries(fks)
      .filter(([, v]) => v !== null)
      .map(([k]) => k)
    record(
      setKeys.length === 1 && setKeys[0] === c.type,
      `component ${c.id} polymorphic FK matches type=${c.type}`,
      setKeys.length === 1 ? undefined : `set: [${setKeys.join(',')}]`,
    )
  }
}

/**
 * Every ComponentBooking.data is parseable by componentBookingDataSchema and
 * its `kind` matches the parent Component.type. Same idea for `policy`.
 */
async function checkBookingShapes() {
  const bookings = await prisma.componentBooking.findMany({
    include: { component: true },
  })
  for (const b of bookings) {
    const dataParsed = componentBookingDataSchema.safeParse(JSON.parse(b.data))
    record(dataParsed.success, `booking ${b.id} data Zod-valid`, dataParsed.success ? undefined : dataParsed.error.message)
    if (dataParsed.success) {
      record(
        dataParsed.data.kind === b.component.type,
        `booking ${b.id} kind=${dataParsed.data.kind} matches component.type=${b.component.type}`,
      )
    }
    const policyParsed = bookingPolicySchema.safeParse(JSON.parse(b.policy))
    record(
      policyParsed.success,
      `booking ${b.id} policy Zod-valid`,
      policyParsed.success ? undefined : policyParsed.error.message,
    )
  }
}

async function checkEventLocations() {
  const events = await prisma.componentEvent.findMany()
  for (const e of events) {
    const parsed = componentEventLocationSchema.safeParse(JSON.parse(e.location))
    record(
      parsed.success,
      `event ${e.id} location Zod-valid`,
      parsed.success ? undefined : parsed.error.message,
    )
  }
}

async function checkDisruptions() {
  const disruptions = await prisma.disruption.findMany()
  for (const d of disruptions) {
    const parsed = z
      .array(suggestedActionSchema)
      .safeParse(JSON.parse(d.suggestedActions))
    record(
      parsed.success,
      `disruption ${d.id} suggestedActions Zod-valid`,
      parsed.success ? undefined : parsed.error.message,
    )
  }
}

async function checkDemoTripAnchors() {
  const trip = await prisma.trip.findUnique({ where: { id: 'trip-demo-bcn' } })
  if (!trip) {
    record(false, 'demo trip exists (run `yarn seed:demo` to create)')
    return
  }
  record(true, 'demo trip exists')

  const lead = await prisma.traveler.findUnique({ where: { id: 'trav-stephan' } })
  record(
    lead?.phone === '+4915112345678',
    `lead traveler has phone +4915112345678 (got ${lead?.phone})`,
  )

  const stayBooking = await prisma.componentBooking.findFirst({
    where: { componentId: 'comp-stay' },
  })
  if (stayBooking) {
    const policy = bookingPolicySchema.parse(JSON.parse(stayBooking.policy))
    const freeUntil = policy.modification.freeUntil
      ? new Date(policy.modification.freeUntil)
      : null
    const inFuture = freeUntil ? freeUntil > new Date() : false
    record(
      policy.modification.canModify === true && inFuture,
      'hotel modification.freeUntil is in the future (demo override active)',
      freeUntil?.toISOString(),
    )
  } else {
    record(false, 'hotel booking exists')
  }
}

async function printSanity(): Promise<void> {
  await rowCounts()
  console.log('')
  await checkCatalogAnchors()
  await checkComponentPolymorphism()
  await checkBookingShapes()
  await checkEventLocations()
  await checkDisruptions()
  await checkDemoTripAnchors()

  const failed = checks.filter((c) => !c.ok)
  console.log(`\n[sanity] checks: ${checks.length - failed.length}/${checks.length} passed`)
  for (const c of failed) {
    console.log(`  ✗ ${c.label}${c.detail ? ` — ${c.detail}` : ''}`)
  }
  if (failed.length > 0) {
    process.exitCode = 1
  } else {
    console.log('  all green')
  }
}

export { printSanity }

if (import.meta.url === `file://${process.argv[1]}`) {
  printSanity()
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
