import { prisma, j } from '../shared/db.js'
import { dataset } from '../shared/dataset.js'
import { SPAIN_ROOT_ID, inferDestinationType } from './shared.js'

const SPAIN_TIMEZONE = 'Europe/Madrid'

export async function seedDestinations(): Promise<void> {
  await prisma.destination.upsert({
    where: { id: SPAIN_ROOT_ID },
    create: {
      id: SPAIN_ROOT_ID,
      parentDestinationId: null,
      type: 'country',
      name: 'Spain',
      countryCode: 'ES',
      countryName: 'Spain',
      timezone: SPAIN_TIMEZONE,
      coordinates: null,
      summary: 'Country root used for hierarchy.',
      tags: j([]),
    },
    update: {
      type: 'country',
      name: 'Spain',
      countryCode: 'ES',
      countryName: 'Spain',
      timezone: SPAIN_TIMEZONE,
      summary: 'Country root used for hierarchy.',
    },
  })

  for (const src of dataset.destinations()) {
    const data = {
      id: src._id,
      parentDestinationId: SPAIN_ROOT_ID,
      type: inferDestinationType(src),
      name: src.name,
      countryCode: src.iso_country_code,
      countryName: src.country,
      timezone: SPAIN_TIMEZONE,
      coordinates: j(src.location),
      summary: src.description,
      tags: j(src.tags ?? []),
    }
    await prisma.destination.upsert({
      where: { id: src._id },
      create: data,
      update: {
        type: data.type,
        name: data.name,
        countryCode: data.countryCode,
        countryName: data.countryName,
        timezone: data.timezone,
        coordinates: data.coordinates,
        summary: data.summary,
        tags: data.tags,
        parentDestinationId: data.parentDestinationId,
      },
    })
  }
}
