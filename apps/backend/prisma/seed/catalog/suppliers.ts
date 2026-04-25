import { prisma } from '../shared/db.js'
import { SUPPLIERS } from './shared.js'

export async function seedSuppliers(): Promise<void> {
  for (const s of SUPPLIERS) {
    await prisma.supplier.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        name: s.name,
        category: s.category,
      },
      update: {
        name: s.name,
        category: s.category,
      },
    })
  }
}
