/**
 * SQLite + Prisma stores all our JSON-shaped columns as `String`. These
 * helpers parse them on the way out and stringify on the way in. They
 * intentionally don't validate — call sites that need validation should
 * pass the parsed value through a Zod schema from `@echoaway/types`.
 */

export const parseJson = <T = unknown>(raw: string | null | undefined): T | null => {
  if (raw == null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const stringifyJson = (value: unknown): string => JSON.stringify(value)
