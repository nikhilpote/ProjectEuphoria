#!/bin/bash
# Transcode video to mobile-optimized format before uploading via admin panel.
# Usage: ./scripts/transcode.sh input.mp4 [output.mp4]
set -euo pipefail

INPUT="$1"
OUTPUT="${2:-${INPUT%.*}_mobile.mp4}"

if [ ! -f "$INPUT" ]; then
  echo "File not found: $INPUT"
  exit 1
fi

echo "Transcoding: $INPUT → $OUTPUT"
ffmpeg -i "$INPUT" \
  -c:v libx264 \
  -preset medium \
  -b:v 1200k \
  -maxrate 1500k \
  -bufsize 3000k \
  -vf "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease" \
  -c:a aac \
  -b:a 128k \
  -movflags +faststart \
  -y "$OUTPUT"

echo ""
echo "Done: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
echo "Upload this file via the admin panel."
