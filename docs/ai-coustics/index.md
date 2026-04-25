# ai-coustics documentation

Reference docs for [ai-coustics](https://docs.ai-coustics.com) — the
speech enhancement provider that powers EchoAway's "voice AI in the
wild" track. Used in `apps/voice-agent` to clean noisy airport / café /
street audio before STT (Phase 6 of [`PLAN.md`](../../PLAN.md)).

These pages were exported from `docs.ai-coustics.com` so agents can
work offline. The canonical upstream index is
<https://docs.ai-coustics.com/llms.txt>.

## Where to start

| If you want to…                                            | Read                                                                           |
|------------------------------------------------------------|--------------------------------------------------------------------------------|
| Drop ai-coustics into a LiveKit voice agent (recommended)  | [`livekit-quickstart.md`](./livekit-quickstart.md) (Python flavor — same wiring concept) |
| Use the ai-coustics Node SDK directly — minimal example    | [`example_basic_node.js`](./example_basic_node.js)                             |
| Enhance a recorded WAV file from CLI (before/after demo)   | [`example_file-processing_node.js`](./example_file-processing_node.js)         |

## For this project

EchoAway's voice-agent runs on `@livekit/agents` (Node), so the LiveKit
plugin is the primary path. Two viable options for Phase 6:

1. **LiveKit Node plugin** (preferred):
   [`@livekit/plugins-ai-coustics`](https://github.com/livekit/plugins-ai-coustics-node)
   — npm package, wraps an `@livekit/rtc-node` `AudioStream`. Drops
   into the agent's input pipeline. The Python plugin docs say LiveKit
   Cloud auth alone is sufficient; verify the same is true for Node on
   install (the `.env.example` scaffolds `AICOUSTICS_API_KEY` just in
   case).
2. **ai-coustics Node SDK directly** — for offline file processing of
   a pre-recorded airport-noise sample (the demo fallback). Requires
   `AIC_SDK_LICENSE` env var.

For a clean before/after on a noisy recording — useful for the Loom
demo and the `AudioIntelligenceMetric` numbers — start with
`example_file-processing_node.js`.

> Note: the vendored `livekit-quickstart.md` documents the Python
> plugin (`livekit-plugins-ai-coustics`). The Node plugin's wiring is
> conceptually identical; pattern-match against the upstream README at
> <https://github.com/livekit/plugins-ai-coustics-node>.

## Auth

- **LiveKit plugin path:** authenticate via LiveKit Cloud (`lk cloud auth`)
  using `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` from
  the root `.env`. `AICOUSTICS_API_KEY` may not be required — confirm
  on plugin install.
- **Node SDK path:** `AIC_SDK_LICENSE` env var, obtained from
  <https://developers.ai-coustics.io>. Add it to the root `.env` — see
  [`../../README.md`](../../README.md) §Environment.
