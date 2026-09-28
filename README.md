# LinkedIn Bingo/Tic-Tac-Toe

Only you can prevent pitch slapping 🫵

A playable version of the LinkedIn Bingo/Tic-Tac-Toe graphic (made in collaboration with Marya Jan). Instead of pitch slapping a new connection in the DMs, send them a card.

## How to play

1. Get a card. The first one is the original graphic; **New card** draws 8 random squares from a pool of 80.
2. Tap a square once if you've **seen it** on LinkedIn (◯), twice if you've **done it** (✕), a third time to clear it.
3. Three in a row wins. The center (AI posts) is a free space.
4. **Save image** makes a PNG of your card to post. **Send to a connection** copies a DM with your result and a link to the same card.

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

* **Your card and marks** are saved in the browser's localStorage, so a refresh keeps your game.
* **Share links** carry the card in the URL (`?c=` holds the 8 square numbers, `&m=` holds the sender's marks), so no database is needed.

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
