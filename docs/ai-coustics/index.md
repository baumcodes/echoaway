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
| Drop ai-coustics into a LiveKit voice agent (recommended)  | [`livekit-quickstart.md`](./livekit-quickstart.md)                             |
| Use the Node SDK directly — minimal end-to-end example     | [`example_basic_node.js`](./example_basic_node.js)                             |
| Enhance a recorded WAV file from CLI (before/after demo)   | [`example_file-processing_node.js`](./example_file-processing_node.js)         |

## For this project

Two viable paths for Phase 6:

1. **LiveKit plugin** (`livekit-plugins-ai-coustics`) — preferred if the
   voice loop ends up running through LiveKit. Auth is via a LiveKit
   Cloud account; no separate ai-coustics SDK key needed.
2. **Node SDK** — needed for offline file processing of the pre-recorded
   airport-noise sample (the demo fallback). Requires
   `AIC_SDK_LICENSE` env var.

For a clean before/after on a noisy recording — useful for the Loom
demo and the `AudioIntelligenceMetric` numbers — start with
`example_file-processing_node.js`.

## Auth

- **LiveKit plugin path:** authenticate via LiveKit Cloud (`lk cloud auth`).
- **Node SDK path:** `AIC_SDK_LICENSE` env var, obtained from
  <https://developers.ai-coustics.io>. Add it to the root `.env` — see
  [`../../README.md`](../../README.md) §Environment.
