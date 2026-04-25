import { addDays, endOfDay, setHours, setMinutes, startOfDay } from 'date-fns'

/**
 * The demo trip floats: every run anchors it on `today + 7 days` so the
 * trip always feels current. All the events derive from this anchor.
 *
 * Times are written as if they were Madrid/Berlin local — the day matters
 * more than the timezone for the UI. We construct dates in the host's
 * local time and let SQLite store the ISO string.
 */
export function tripDates(now: Date = new Date()) {
  const start = startOfDay(addDays(now, 7))
  const end = startOfDay(addDays(now, 11))

  const at = (day: Date, hour: number, minute = 0) =>
    setMinutes(setHours(day, hour), minute)

  const day1 = start
  const day2 = addDays(start, 1)
  const day3 = addDays(start, 2)
  const day4 = end

  return {
    now,
    tripStart: start,
    tripEnd: end,
    nights: 4,

    flight: {
      depart: at(day1, 18, 0), // BER 18:00 local
      arrive: at(day1, 20, 40), // BCN 20:40 local
    },
    transfer: {
      pickup: at(day1, 21, 30), // BCN airport, 21:30
    },
    stay: {
      checkIn: at(day1, 22, 0),
      checkOut: at(day4, 11, 0),
      // Demo override: free hotel modification window ends at end-of-today
      // so the demo always succeeds without paying a fee.
      modificationFreeUntil: endOfDay(now),
    },
    sagrada: {
      meet: at(day2, 10, 0),
      start: at(day2, 10, 30),
      end: at(day2, 12, 0),
    },
    food: {
      start: at(day3, 18, 0),
      end: at(day3, 21, 0),
    },
  }
}

export type TripDates = ReturnType<typeof tripDates>
