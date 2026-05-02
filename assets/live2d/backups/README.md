# Live2D Backups

Timestamped backups for generated character assets and Live2D processing scripts.

Policy:

- Create a new timestamped backup before changing generated character resources.
- Do not delete older backups during active Live2D iteration.
- Each backup should include `SHA256SUMS.txt` generated with null-safe file handling because several layer files contain spaces in their names.

Command:

```bash
TS=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="assets/live2d/backups/$TS"
mkdir -p "$BACKUP_DIR/assets/generated" "$BACKUP_DIR/scripts"
cp -R assets/live2d/generated/see-through-nf4-r1024/AYuan "$BACKUP_DIR/assets/generated/AYuan"
cp -R assets/live2d/generated/see-through-nf4-r1024/Weiyang "$BACKUP_DIR/assets/generated/Weiyang"
cp scripts/build-live2d-tensor-assets.mjs "$BACKUP_DIR/scripts/"
cp scripts/build-live2d-motion-tensors.mjs "$BACKUP_DIR/scripts/"
cp scripts/split-ayuan-live2d-layers.mjs "$BACKUP_DIR/scripts/"
find "$BACKUP_DIR" -type f ! -name SHA256SUMS.txt -print0 | sort -z | xargs -0 shasum -a 256 > "$BACKUP_DIR/SHA256SUMS.txt"
```

Known backups:

- `20260502-171552`: first organized backup after AYuan tensor and motion tensor generation.
