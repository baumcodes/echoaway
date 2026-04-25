import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

/** SQLite has no JSON column, so every JSON field is stored as text. */
export const j = (value: unknown): string => JSON.stringify(value)
