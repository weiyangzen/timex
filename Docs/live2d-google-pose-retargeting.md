# Live2D Google Pose Retargeting

This project should use Google MediaPipe Pose semantics as the motion contract for character movement.

## Landmark Contract

AYuan walk motion uses the MediaPipe / BlazePose lower-body chain:

- 11: left shoulder
- 12: right shoulder
- 23: left hip
- 24: right hip
- 25: left knee
- 26: right knee
- 27: left ankle
- 28: right ankle
- 31: left foot index
- 32: right foot index

The runtime currently uses this topology as a procedural signal source because the exported `AYuan.moc3` does not contain separate left/right leg ArtMeshes. The correct production path is:

1. Extract pose landmarks from a fixed-camera walk reference with MediaPipe Pose Landmarker.
2. Normalize shoulder width, hip width, and ankle height per frame.
3. Convert keypoint deltas into rig signals:
   - hip sway from left/right hip midpoint
   - torso counter-rotation from shoulder midpoint vs. hip midpoint
   - left/right leg swing from hip-knee-ankle phase
   - left/right foot lift from ankle and foot-index height
4. Bind those signals to real Cubism Deformers:
   - hip anchor
   - left thigh
   - right thigh
   - left lower leg
   - right lower leg
   - left foot
   - right foot

## Current Limitation

CSS overlay legs were removed because they rendered a second copy of the legs outside the Live2D coordinate system, causing ghosting and shoe separation.

The current runtime keeps a single Live2D render source and applies small vertex offsets to the existing `legwear` and `footwear` drawables. This avoids ghosting, but it cannot fully replace a Cubism rig with separate left/right ArtMeshes.

## Reference Choice

For the Beatles walking GIF reference, the grey-suit walker is the safest default:

- stable full-body cycle
- moderate step lift
- natural shoulder/hip counter-sway
- less exaggerated than the white high-knee walker

The white high-knee walker should only be used for exaggerated greeting motion.
