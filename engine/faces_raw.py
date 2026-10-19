#!/usr/bin/env python3.13
"""Raw face detection (Vision) on take frames, no gap filling: engine/faces_raw.py N1 N2 … → {"N": [cx, cy] | null} on stdout.
qa/face.json fills frames without a face from neighbours, so it cannot tell where the eye is on a cut."""
import sys, json
import Vision
from Foundation import NSURL
req = Vision.VNDetectFaceRectanglesRequest.alloc().init()
out = {}
for n in sys.argv[1:]:
    h = Vision.VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(f'work/fr/f_{int(n):04d}.jpg'), {})
    h.performRequests_error_([req], None)
    res = [o.boundingBox() for o in (req.results() or []) if o.boundingBox().size.width > 0.06]   # faces, not specks in a crowd
    if not res: out[n] = None; continue
    b = max(res, key=lambda b: b.size.width * b.size.height)
    out[n] = [round((b.origin.x + b.size.width / 2) * 1080), round((1 - b.origin.y - b.size.height / 2) * 1920)]
print(json.dumps(out))
