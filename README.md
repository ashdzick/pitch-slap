# LinkedIn Bingo/Tic-Tac-Toe

A playable version of the LinkedIn Bingo/Tic-Tac-Toe graphic (made in collaboration with Marya Jan). Instead of pitch slapping a new connection in the DMs, send them a card.

## How to play

1. **Make a card.** It starts as the original graphic. Tap any square to rewrite it, or **Shuffle** to deal new squares from a pool of 81 (squares you wrote stay put).
2. **Claim a square** you've actually seen or done on LinkedIn. The sender is ✕ and always goes first.
3. **Send it.** The page writes a DM with a link. Paste it to a recent connection instead of a pitch.
4. **Trade links.** They open it, claim a square as ◯, and send a new link back in the same DM. First to three in a row wins; nine squares with no line is a draw.
5. **Save image** at any point makes a PNG of the board in the original graphic's style.

## How it works

Plain HTML, CSS and JavaScript. No build step, no server, no AI, no API keys, no tracking.

| File | What it does |
| --- | --- |
| `index.html` | The page |
| `styles.css` | Styling |
| `js/squares.js` | The square pool. Edit this to add squares |
| `js/card-image.js` | Draws the downloadable card image on a canvas |
| `js/app.js` | Game logic, sharing, saving |
| `og.png` | Link preview image for LinkedIn |

* **Every game lives in its link**, so there's no server or database. `?g=` is the game id, `?c=` holds the 9 squares (a pool number, or `__` for a written square whose text follows as its own `&t=`), `?v=` lists the claimed squares in play order (✕ first), and `?x=` / `?o=` are the players' names.
* **localStorage** remembers your games, which side you're on in each, and your name. Opening an older link for a game you already have keeps the newer state.

### Adding squares

Add new lines to the **end** of `SQUARES` in `js/squares.js`. Don't reorder or delete existing ones, because shared links refer to squares by position. To retire a square, add its number to `RETIRED`.

## Running locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

## Publishing on GitHub Pages

1. Merge this branch into `main`.
2. In the repo, go to **Settings → Pages**, set Source to **Deploy from a branch**, choose `main` and `/ (root)`, and save.
3. The site goes live at `https://ashdzick.github.io/pitch-slap/`.

If you host it somewhere else, update the `og:url` and `og:image` tags in `index.html` and `FALLBACK_SITE` in `js/app.js`.
