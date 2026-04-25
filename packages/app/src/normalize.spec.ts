import {
  initialsOfName,
  lastDigitsOfPhone,
  maskEmail,
  normalizeEmail,
  normalizeNameQuery,
  normalizePhone,
  normalizeTripIdKey,
} from '@echoaway/types'
import { describe, expect, it } from 'vitest'

describe('normalizePhone', () => {
  it('keeps the leading +', () => {
    expect(normalizePhone('+49 151 1234 5678')).toBe('+4915112345678')
  })
  it('replaces leading 00 with +', () => {
    expect(normalizePhone('0049 151 1234 5678')).toBe('+4915112345678')
  })
  it('strips punctuation', () => {
    expect(normalizePhone('+49.151.1234.5678')).toBe('+4915112345678')
    expect(normalizePhone('+49 (151) 1234-5678')).toBe('+4915112345678')
  })
  it('returns empty for empty input', () => {
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone('   ')).toBe('')
  })
  it('handles plain digits without country prefix', () => {
    expect(normalizePhone('1511234567')).toBe('1511234567')
  })
})

describe('normalizeEmail', () => {
  it('lowercases + trims', () => {
    expect(normalizeEmail('  STEPHAN@PlanAway.COM  ')).toBe(
      'stephan@planaway.com',
    )
  })
  it('drops trailing punctuation that the LLM tends to add', () => {
    expect(normalizeEmail('stephan@planaway.com.')).toBe('stephan@planaway.com')
    expect(normalizeEmail('stephan@planaway.com,')).toBe('stephan@planaway.com')
  })
})

describe('normalizeTripIdKey', () => {
  it('strips dashes + lowercases', () => {
    expect(normalizeTripIdKey('trip-demo-bcn')).toBe('tripdemobcn')
    expect(normalizeTripIdKey('TRIP DEMO BCN')).toBe('tripdemobcn')
    expect(normalizeTripIdKey('tripdemobcn')).toBe('tripdemobcn')
  })
  it('strips other punctuation', () => {
    expect(normalizeTripIdKey('trip_demo.bcn/123')).toBe('tripdemobcn123')
  })
})

describe('normalizeNameQuery', () => {
  it('lowercases + collapses whitespace', () => {
    expect(normalizeNameQuery('  Stephan   Rüschenbaum  ')).toBe(
      'stephan rüschenbaum',
    )
  })
})

describe('lastDigitsOfPhone', () => {
  it('returns the last N digits ignoring +', () => {
    expect(lastDigitsOfPhone('+49 151 1234 5678', 3)).toBe('678')
    expect(lastDigitsOfPhone('+49 151 1234 5678', 4)).toBe('5678')
  })
  it('returns empty if input has no digits', () => {
    expect(lastDigitsOfPhone('', 3)).toBe('')
  })
})

describe('initialsOfName', () => {
  it('joins per-word initials with dots', () => {
    expect(initialsOfName('Stephan Rüschenbaum')).toBe('S.R.')
    expect(initialsOfName('  Anna  Maria  Müller  ')).toBe('A.M.M.')
  })
  it('returns empty for empty input', () => {
    expect(initialsOfName('')).toBe('')
    expect(initialsOfName('   ')).toBe('')
  })
})

describe('maskEmail', () => {
  it('keeps first char of local + first char of domain + tld', () => {
    expect(maskEmail('stephan@planaway.com')).toBe('s***@p***.com')
    expect(maskEmail('a@b.io')).toBe('a***@b***.io')
  })
  it('returns empty for malformed input', () => {
    expect(maskEmail('no-at-sign')).toBe('')
    expect(maskEmail('no-tld@example')).toBe('')
  })
})
