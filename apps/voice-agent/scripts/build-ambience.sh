#!/usr/bin/env bash
# Re-derive fixtures/ambient-office-48k-mono.s16le from the MP3 in
# apps/web/public. Run when the source MP3 changes. Requires ffmpeg.
#
# Format matches what AmbiencePublisher expects:
#   - PCM signed 16-bit little-endian, 48 kHz, mono
#   - Pre-attenuated by -18 dB so we don't need to do it per frame
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=../web/public/ambient-office-background.mp3
DST=fixtures/ambient-office-48k-mono.s16le
# Ambient gain in dB. -8 dB is loud enough to be present but still
# clearly behind the agent's voice. Lower (more negative) = quieter.
GAIN=${AMBIENCE_GAIN_DB:--8}
mkdir -p fixtures
ffmpeg -y -i "$SRC" -f s16le -acodec pcm_s16le -ac 1 -ar 48000 \
  -filter:a "volume=${GAIN}dB" "$DST"
echo "wrote $DST ($(wc -c < "$DST") bytes) at ${GAIN} dB"
