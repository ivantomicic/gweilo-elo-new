#!/bin/sh
set -eu

cd "$(dirname "$0")"

ffmpeg -y \
  -loop 1 -framerate 24 \
  -i 05-solar-champion-production-safe.png \
  -filter_complex_script solar-champion-loop.ffgraph \
  -map '[out]' \
  -frames:v 145 \
  -an \
  -c:v libx264 \
  -preset slow \
  -crf 15 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  06-solar-champion-flame-loop.mp4
