// Idempotent merge of new rows into an existing dataset array.
//
// Rules:
// - Existing rows (matched by `_id`) are NEVER mutated. The demo seed
//   pins specific IDs (e.g. `hotel-bcn-01` → "Hotel Brisa Barcelona");
//   silently rewriting them would break the seeded demo trip.
// - New rows are appended.
// - Duplicate `_id` values within `incoming` are de-duplicated; the
//   first wins.

export type Identified = { _id: string }

export type MergeResult<T extends Identified> = {
  merged: T[]
  added: number
  kept: number
}

export function mergeById<T extends Identified>(
  existing: T[],
  incoming: T[],
): MergeResult<T> {
  const byId = new Map<string, T>()
  for (const row of existing) byId.set(row._id, row)

  const order: string[] = existing.map((r) => r._id)
  let added = 0

  for (const candidate of incoming) {
    if (byId.has(candidate._id)) continue
    byId.set(candidate._id, candidate)
    order.push(candidate._id)
    added += 1
  }

  return {
    merged: order.map((id) => byId.get(id)!),
    added,
    kept: existing.length,
  }
}
