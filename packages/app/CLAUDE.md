# `@echoaway/app` — agent rules

This package is the **shared application layer** for EchoAway's clients
(`apps/web` today, `apps/mobile` later). It owns data fetching, state
machines, selectors, and React orchestration hooks. It does **not** own
JSX presentation — that's `@echoaway/ui` — and it does **not** own
layout — that's the consuming app.

If you're editing this package, the rules below tell you where things go
and why. They were learned the hard way; don't relitigate without a good
reason.

---

## 1. Layering

Three packages, three jobs. Don't blur the lines.

| Package | Owns | Forbidden |
|---|---|---|
| `@echoaway/types` | Zod schemas + enums; runtime contracts | React, fetch, side effects |
| `@echoaway/app` | API client, selectors, state machine, hooks, Context | Presentational JSX, layout, CSS, web/native APIs |
| `@echoaway/ui` | Dumb React components (props in → JSX out) | Data fetching, Context consumers, business logic |
| `apps/web` | Layout + panels that wire `useDemo()` to UI components | Anything that mobile would also need |

When in doubt: **could `apps/mobile` reuse this verbatim?** If yes, it
belongs in this package. If it's web-only (CSS, browser APIs, layout),
it belongs in `apps/web`.

---

## 2. The entry component is a layout file

`apps/web/src/App.tsx` is **layout only**: it instantiates the API client,
mounts `<DemoProvider>`, and slots in the side panel + phone stage.
That's it.

Things that **must not** live in `App.tsx` (or any top-level entry):

- ❌ `useState` / `useReducer` / `useEffect` for app state
- ❌ `find` / `filter` over the trip to derive flight/hotel/etc.
- ❌ `setTimeout` choreography for demo flows
- ❌ Loading / error branching mixed with happy-path JSX
- ❌ Callback handlers that orchestrate multiple async calls
- ❌ Date math, ID matching, status computation

If you catch yourself adding any of those to `App.tsx`, route them
through this package instead — it has homes for each.

---

## 3. Where each kind of logic goes

### Pure derivations → `selectors.ts`

Anything that's `Trip → X` with no side effects:

```ts
// Good — pure, testable in isolation, reusable from mobile.
export const selectFlight = (trip: Trip | null): TripComponent | null =>
  trip?.components.find((c) => c.type === 'flight') ?? null
```

Selector rules:
- Take `Trip | null` (or other source state); return `null` / `[]` for
  missing — never throw.
- No React, no I/O, no `Date.now()`-flavoured non-determinism that
  isn't tested.
- One unit test per selector covering the null case + the happy case +
  any tricky edge (e.g. month rollover for `selectProposedNewCheckIn`).
- Co-locate the spec next to the source: `selectors.ts` →
  `selectors.spec.ts`.

If the value depends on time / locale / random, take it as a parameter
so the selector stays pure.

### State transitions → `state-machine.ts`

Pure reducer over `(state, event) → state`. The same rules apply:
- Unknown events return the current state — no throws.
- Every transition has a unit test.

### Imperative orchestration → actions on the hook

When a UI gesture should fire several async calls or dispatches in a
known order, that's an **action** on `useVoiceConciergeDemo`. Examples:

```ts
// Good — orchestration lives where the state lives.
const startDemoFlow = useCallback(async () => {
  if (current.kind !== 'idle') return
  dispatchAssistant({ type: 'listening', transcript: '…' })
  await new Promise(r => setTimeout(r, 600))
  await triggerQuote(newCheckIn)
}, [triggerQuote])
```

Bad: spreading the same logic across a panel's `onClick` handler. If
two panels need it, they both call `demo.startDemoFlow()`.

Action rules:
- Use refs (`assistantRef`, `tripRef`) to read latest state without
  forcing the action to depend on every state slice — that breaks
  `useCallback` stability.
- Guard against running in the wrong state (`if (kind !== 'idle')
  return`). Don't trust the caller.
- Surface failures via `dispatchAssistant({ type: 'error', message })`,
  not by throwing.

### React state ownership → `DemoProvider` / `useDemo()`

There is **one** instance of the demo controller per tree. Panels read
it via `useDemo()`; they never accept prop-drilled trip slices.

```tsx
// Good
function PhoneStage() {
  const { trip } = useDemo()
  ...
}

// Bad — pulls App.tsx back into the wiring business.
function PhoneStage({ trip, assistant, onTalk, onConfirm }: Props) { ... }
```

Adding new state? Extend `DemoController` and `useVoiceConciergeDemo`
together — the type and the hook return value have to stay in sync,
otherwise `useDemo()` consumers break silently.

---

## 4. Public surface (`index.ts`)

`index.ts` re-exports everything consumers need. When you add a new
public symbol:

- Export it from its module (`selectors.ts`, `state-machine.ts`, …).
- Add the `export *` line in `index.ts`.
- Don't deep-import from `@echoaway/app/src/...` in consumers — only
  `@echoaway/app` is supported.

Things kept **internal** (no public export):

- Refs, helpers used only inside one file.
- Anything experimental — promote to public once it has a test and a
  consumer.

---

## 5. Tests

Per the global CLAUDE.md §101, every change ships with tests. Specific
to this package:

- **Selectors**: pure-function tests in `*.spec.ts`. Cover `null`
  inputs and any edge case the selector explicitly guards against.
- **State machine**: every transition gets a test. Add a test for
  no-op cases (e.g. `session_started` ignored when not idle).
- **Hook**: render via `@testing-library/react`'s `renderHook` against
  a fake `ApiClient` (just an object of `vi.fn()` matching the
  shape). Test the happy path, the error path, and that side effects
  fire (e.g. trip refetch after a mutation).
- **API client**: mock `fetch`, assert URL building, body shape, and
  `ApiError` on non-2xx.

Run with `yarn test:app` (or `yarn test` for the full root suite).
Don't ship a change with a red suite.

---

## 6. React-only, but not web-only

This package depends on React (peer dep) but not on web APIs.
`useVoiceConciergeDemo` and `DemoProvider` work in React Native too —
that's the whole reason they live here instead of `apps/web`.

When tempted to use `window`, `document`, `localStorage`, or
`fetch`-as-a-global: don't. Take the dependency as a parameter
(`createApiClient({ fetch })`), let the consumer pass the platform
implementation.

---

## 7. Common refactor smells

If you see any of these in a PR or in your own diff, push back:

| Smell | Fix |
|---|---|
| `App.tsx` getting longer | Move logic into a panel + selector |
| `find` / `filter` over `trip.components` outside `selectors.ts` | Add a selector |
| `setTimeout` inside a click handler | Move into a hook action |
| Panel takes 5+ props that all come from the demo controller | Use `useDemo()` |
| Two panels duplicate the same handler | Promote to a hook action |
| Selector depends on `Date.now()` or `Math.random()` | Parameterise it |
| Test reaches into `apps/web` to verify behaviour | The behaviour belongs here |
| New file in `apps/web` that other apps would also need | Move into this package |
