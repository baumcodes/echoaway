import { describe, expect, it } from 'vitest'
import { lookupTool, toolDeclarations, tools } from './index.js'

describe('tools registry', () => {
  it('declares every tool with name + description + JSON-schema parameters', () => {
    for (const decl of toolDeclarations()) {
      expect(decl.name).toBeTruthy()
      expect(decl.description.length).toBeGreaterThan(10)
      expect(decl.parameters.type).toBe('object')
      expect(Array.isArray(decl.parameters.required)).toBe(true)
    }
  })

  it('declares one entry per file in the tools/ directory', () => {
    // Smoke-check that the registry stays in sync with what the agent
    // expects. If you drop a new file in tools/ without registering it
    // here, this test will go stale silently — rely on the type system
    // (the `satisfies` clause in tools/index.ts) and code review.
    expect(Object.keys(tools).sort()).toEqual([
      'confirmHotelCheckInChange',
      'createSupportLog',
      'getTripByPhone',
      'getTripDisruptions',
      'listAccommodations',
      'quoteHotelCheckInChange',
      'searchTravelContext',
    ])
  })

  it('lookupTool returns null for unknown names', () => {
    expect(lookupTool('mystery')).toBeNull()
    expect(lookupTool('getTripByPhone')).not.toBeNull()
  })
})
