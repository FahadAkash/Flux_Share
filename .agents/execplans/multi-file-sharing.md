# Implement Multi-File Sharing and Robust Chunk Transfer

This ExecPlan follows the guidelines in `PLANS.md`.

## Purpose / Big Picture
Transform Pairlane from a single-file transfer tool into a batch-capable sharing platform. Users will be able to select multiple files at once, see a combined progress bar, and receive files sequentially.

## Progress
- [x] (2026-01-15 11:35Z) Update `RoomApp` state to support `File[]`.
- [x] (2026-01-15 11:35Z) Modify `sendFileToPeer` to iterate through files.
- [x] (2026-01-15 11:35Z) Update UI to display file list and aggregate progress.
- [x] (2026-01-15 11:35Z) Implement receiver-side batch handling.

## Surprises & Discoveries
- (None yet)

## Decision Log
- **Decision**: Sequential vs Parallel transfer.
  - **Choice**: Sequential.
  - **Rationale**: Sequential transfer is more stable over WebRTC DataChannels and easier to manage for progress reporting.
- **Decision**: File receiver strategy.
  - **Choice**: Trigger download on each file completion.
  - **Rationale**: Minimal memory footprint compared to zipping in-browser.

## Context and Orientation
- `src/client/room.tsx`: Manages the WebRTC state and UI.
- Signaling flow: `meta` -> `data chunks` -> `done`.
- Batch flow: `batch-meta` (total files/size) -> `[meta -> data -> done] x N`.

## Plan of Work
1. **State Update**:
   - Change `selectedFile: File | null` to `selectedFiles: File[]`.
   - Update `sendProgress` to track total bytes across all files.
2. **Transfer Protocol Engine**:
   - Refactor `sendFileToPeer` to take an array of files.
   - Send a `batch-start` message (optional but good for UI) or just infer from multiple `meta` messages.
3. **UI Polish**:
   - Update file input to `multiple`.
   - Add a scrollable file list showing status (Pending, Transmitting, Completed).

## Concrete Steps
- Edit `src/client/room.tsx`.
- Update types.
- Update `handleFileInput` and `handleDrop`.

## Validation and Acceptance
- Select 5 files.
- Sender sees progress bar increasing from 0 to 100% across all 5 files.
- Receiver receives 5 files.

## Idempotence and Recovery
- Resetting the page clears the batch.
