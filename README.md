# Nonogram

**Nine Lives** — a nonogram (picross) puzzle game of pixel cats, in one self-contained HTML file.

Open `index.html` in a browser. No build, no server, no dependencies beyond two Google fonts.

## The puzzles

Four cats live in the `PUZZLES` array near the top of the script:

| Puzzle      | Size  |
| ----------- | ----- |
| Kitten      | 5×5   |
| Loaf        | 10×10 |
| Whiskers    | 10×10 |
| Sitting cat | 15×15 |

Each is an array of `#`/`.` strings; the row and column clues are derived at load, not stored. Adding a cat is a matter of appending N strings of length N.

The grids are hand-drawn rather than downsampled from photographs. A real photo thresholded to 10×10 becomes noise, and noise produces clue sets that are not logically solvable — nonogram art is always authored.

## Controls

- **Drag** to paint a run. The first cell of the stroke decides whether the whole stroke fills or erases.
- **Right-click** (or the Mark tool) to cross a square off.
- **Arrow keys** move the cursor; **space** fills, **x** marks.
- **Hint** fills one correct square and adds 30 seconds to the clock.
- Completed rows and columns dim their own clue numbers.

## Notes on the implementation

Win detection compares the clues your grid generates against the puzzle's clues, rather than against the stored solution — so an alternate valid solution still counts as solved.

Best times are read and written through `window.storage`, which exists only inside the claude.ai artifact runtime. Opened from disk the game degrades silently to in-memory, so records are lost on reload. See `project.yaml` for the task to move this to `localStorage`.

## Origin

Generated in a Claude conversation on 2026-09-14 — see `transcripts/2026-09-14.md`.
