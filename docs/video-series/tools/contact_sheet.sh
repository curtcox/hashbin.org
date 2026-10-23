#!/bin/sh
# Usage: tools/contact_sheet.sh <video.mp4> <out.png> [frames]
# Tiles evenly spaced frames from a video into one image, for reviewing renders.
video="$1"; out="$2"; n="${3:-6}"
duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$video")
interval=$(echo "$duration / $n" | bc -l)
ffmpeg -y -loglevel error -i "$video" -vf "fps=1/$interval,scale=640:-1,tile=3x$(( (n + 2) / 3 ))" -frames:v 1 "$out"
