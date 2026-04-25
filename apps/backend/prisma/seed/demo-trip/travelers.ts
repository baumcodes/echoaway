import { prisma } from '../shared/db.js'
import {
  LEAD_PHONE,
  TRAVELER_COMPANION_ID,
  TRAVELER_LEAD_ID,
} from './constants.js'

export async function seedTravelers(): Promise<void> {
  await prisma.traveler.upsert({
    where: { id: TRAVELER_LEAD_ID },
    create: {
      id: TRAVELER_LEAD_ID,
      fullName: 'Stephan Rüschenbaum',
      email: 'big-berlin-hack-april-26@planaway.com',
      phone: LEAD_PHONE,
      locale: 'en-DE',
    },
    update: {
      fullName: 'Stephan Rüschenbaum',
      email: 'big-berlin-hack-april-26@planaway.com',
      phone: LEAD_PHONE,
      locale: 'en-DE',
    },
  })

  await prisma.traveler.upsert({
    where: { id: TRAVELER_COMPANION_ID },
    create: {
      id: TRAVELER_COMPANION_ID,
      fullName: 'Anna Müller',
      email: null,
      phone: null,
      locale: 'en-DE',
    },
    update: {
      fullName: 'Anna Müller',
      locale: 'en-DE',
    },
  })
}
