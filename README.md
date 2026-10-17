# Nonogram

> Written with [Claude](https://claude.ai), Anthropic's AI assistant — the game, the puzzle maker and this README.

**Play it:** https://bburns.github.io/nonogram/

![Nine Lives on a phone, partway through the 15×15 sitting cat](screenshot.png)

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

## Puzzles from pictures

`make.html` turns a picture into a puzzle. Drop in a JPEG or PNG, pick a size, and adjust the threshold. **Add to the game** saves it in the browser and opens it in `index.html`; **Copy as code** gives the `PUZZLES` entry to paste in.

It crops to the subject, shrinks it by averaging, and splits light from dark at an automatic threshold. A thresholded picture usually can't be solved without guessing, so it then runs a solver that works the way a person does, one row or column at a time. Where the solver gets stuck, it changes the square that helps most, preferring squares whose shade was close to the threshold anyway. Changed squares show in gold. A finished puzzle has one answer and needs no guessing.

Silhouettes, icons and bold shapes on a plain background turn out best. A busy photo still comes out solvable, but at 15×15 it rarely looks like anything.

## Picking pictures

`src/rank.js` scores pictures for how good a nonogram they'd make and prints them best first. It's the nonogram version of the jigsaw project's ranker and takes the same options. Run `pnpm install` once, then:

```
pnpm rank <files or folders...> [--size 15] [--html FILE] [--list FILE] [--exclude NAME] [--sample N] [--stored] [--json] [--top N]
```

Each picture is turned into a puzzle exactly as `make.html` would, with the same code (`picture.js`), and the score is a weighted geometric mean of six parts:

- **shape**: a subject clear of a plain background, in a few solid pieces that aren't just a block. This is what separates a silhouette from a photo with big dark areas.
- **clarity**: how cleanly the picture splits into light and dark.
- **clean**: how many squares are mostly one side or the other at full size, and how few lone specks there are. Line art and text fail here — every square is half ink.
- **faithful**: how few squares had to change to make it solvable.
- **balance**: filled share near half.
- **interest**: more than one run per line. A plain blob is fine but easy.

Icons, logos and clip art score 80–90. The best photos reach the high 70s. `--html` writes a page of thumbnails where clicking a picture flips it to the puzzle it makes, with the rows to paste into `index.html`.

`src/score.js` stores scores in each folder's `.props.yaml` under a `nonogram` group, beside the jigsaw's `puzzle` group, and `rank.js --stored` ranks from those without opening the pictures. Both work like the jigsaw versions, including `folders.txt`. `pnpm best` writes `out/best.html`.

## Controls

- **Drag** to paint a run. The first cell of the stroke decides whether the whole stroke fills or erases.
- **Right-click** (or the Mark tool) to cross a square off.
- **Arrow keys** move the cursor; **space** fills, **x** marks.
- **Hint** fills one correct square and adds 30 seconds to the clock.
- Completed rows and columns dim their own clue numbers.

## Notes on the implementation

Win detection compares the clues your grid generates against the puzzle's clues, rather than against the stored solution — so an alternate valid solution still counts as solved.

Best times and in-progress grids are saved through `window.storage` inside claude.ai, and `localStorage` everywhere else, so a half-finished puzzle survives a reload.

Puzzles stop at 15×15 on purpose. On a phone a 20×20 grid shrinks the cells and clues until they strain the eyes, which is the problem with most picross apps. Clues are drawn large and bright, and the current row and column are highlighted under your finger.

## Origin

Generated in a Claude conversation on 2026-09-14 — see `transcripts/2026-09-14.md`.
