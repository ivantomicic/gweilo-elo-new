# Higgsfield gold podium concepts

`05-solar-champion-production-safe.png` is the mechanically motion-safe source for animation. The artwork is contained inside the central 76% of a 3:4 canvas, leaving a pure-black 12% perimeter on all four sides.

When integrating the resulting animation, size the video layer to align its internal black circle with the player avatar. The padded canvas is intentionally larger than the visible effect so any view clipping cuts only pure black.

`render-solar-champion-loop.sh` creates the deterministic six-second loop. The flame displacement and glitter brightness functions are periodic over 144 frames; frame 145 repeats frame 1. The output contains no audio stream.

`06-solar-champion-flame-loop-lossless.mp4` is the review master with pixel-identical decoded first and last frames. `06-solar-champion-flame-loop.mp4` is the smaller high-quality H.264 version, and the GIF is an inline preview.
