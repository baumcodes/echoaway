# Gradium API documentation

Reference docs for [Gradium](https://docs.gradium.ai) — the realtime
voice provider used by `apps/voice-agent` for TTS and STT (Phase 7 of
[`PLAN.md`](../../PLAN.md)).

These pages were exported from `docs.gradium.ai` so agents can work
offline. The canonical upstream index is
<https://docs.gradium.ai/llms.txt>.

## Where to start

| If you want to…                                  | Read                                         |
|--------------------------------------------------|----------------------------------------------|
| Stream synthesized speech in realtime            | [`tts-websocket.md`](./tts-websocket.md)     |
| Convert text → speech with a single HTTP call    | [`tts-post.md`](./tts-post.md)               |
| Stream microphone audio → transcript             | [`stt-websocket.md`](./stt-websocket.md)     |
| Check the org's remaining credit balance         | [`get-credits.md`](./get-credits.md)         |

## Voices

Voice management endpoints — pick or upload the voice that the agent
will speak with.

- [`get-voices.md`](./get-voices.md) — list voices for the org
- [`get-voice.md`](./get-voice.md) — fetch a single voice
- [`create-voice.md`](./create-voice.md) — upload a new voice (multipart audio)
- [`update-voice.md`](./update-voice.md) — update voice metadata
- [`delete-voice.md`](./delete-voice.md) — remove a voice

## Pronunciation dictionaries

Custom pronunciation overrides — useful for brand names, place names
(e.g. "Sagrada Família"), and IATA codes.

- [`list-pronunciations.md`](./list-pronunciations.md) — list dictionaries
- [`get-pronunciation.md`](./get-pronunciation.md) — fetch a dictionary
- [`create-pronunciation.md`](./create-pronunciation.md) — create a dictionary
- [`update-pronunciation.md`](./update-pronunciation.md) — update entries
- [`delete-pronunciation.md`](./delete-pronunciation.md) — remove a dictionary

## Auth

All endpoints authenticate with `x-api-key: <GRADIUM_API_KEY>` (header
on HTTP, header on the WebSocket upgrade). The key lives in the root
`.env` as `GRADIUM_API_KEY` — see [`../../README.md`](../../README.md)
§Environment.
