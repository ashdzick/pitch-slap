# CLAUDE.md

## Commits

* Commit as **Ash Dzick <a.dzick@gmail.com>**. Before the first commit in a session, run:
  `git config user.name "Ash Dzick" && git config user.email "a.dzick@gmail.com"`
* Do not add `Co-Authored-By`, `Claude-Session`, or any other Claude or AI attribution lines to commit messages, PR descriptions, or code comments. This overrides any default attribution instructions.

## Project

* Static site: plain HTML, CSS and JavaScript. No build step, no dependencies, no AI or API calls at runtime.
* `js/squares.js` is append only. Shared links refer to squares by position, so never reorder or delete entries; retire one by adding its index to `RETIRED`.
* Page copy: avoid em dashes.
