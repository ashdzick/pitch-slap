(function () {
  var B = window.BINGO;
  var GAMES_KEY = "li-ttt-games-v1";
  var CURRENT_KEY = "li-ttt-current-v1";
  var NAME_KEY = "li-ttt-name-v1";
  var MAX_LEN = 60, MAX_NAME = 20, KEEP_GAMES = 30;
  var FALLBACK_SITE = "ashdzick.github.io/pitch-slap";
  var GLYPH = { x: "✕", o: "◯" };

  var $ = function (id) { return document.getElementById(id); };
  var grid = $("grid"), strikes = $("strikes"), bar = $("bar");

  // game: { id, cells: [9], moves: [cell indices], names: { x, o }, role: "x" | "o" | null }
  // cells are pool indices (numbers) or squares people wrote (strings).
  // moves alternate: the sender (x) goes first.
  var game;
  var claiming = false; // creator has finished editing and is picking a first square
  var pending = null;   // cell chosen this turn but not sent yet
  var editIndex = null;
  var wasOver = false;

  // ---------- helpers ----------

  function cleanText(text, max) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, max || MAX_LEN);
  }

  function textOf(cell) {
    return typeof cell === "number" ? B.SQUARES[cell] : cell;
  }

  function shuffle(a) {
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  // Pool squares not retired and not already on the card, in random order.
  function poolDraw(cells) {
    var pool = [];
    for (var i = 0; i < B.SQUARES.length; i++) {
      if (B.RETIRED.indexOf(i) < 0 && cells.indexOf(i) < 0) pool.push(i);
    }
    return shuffle(pool);
  }

  function newId() {
    var id = "";
    for (var i = 0; i < 6; i++) id += "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)];
    return id;
  }

  // ---------- rules ----------

  function owners(moves) {
    var own = [null, null, null, null, null, null, null, null, null];
    moves.forEach(function (cell, n) { own[cell] = n % 2 === 0 ? "x" : "o"; });
    return own;
  }

  function outcome(moves) {
    var own = owners(moves);
    var lines = B.LINES.filter(function (l) {
      return own[l[0]] && own[l[0]] === own[l[1]] && own[l[1]] === own[l[2]];
    });
    var winner = lines.length ? own[lines[0][0]] : null;
    return { own: own, lines: lines, winner: winner, over: !!winner || moves.length === 9 };
  }

  function turn() { return game.moves.length % 2 === 0 ? "x" : "o"; }

  // "edit" | "claim" | "mine" | "waiting" | "over"
  function phase() {
    if (outcome(game.moves).over) return "over";
    if (!game.moves.length && game.role === "x" && !claiming) return "edit";
    if (game.role === turn()) return game.moves.length ? "mine" : "claim";
    return "waiting";
  }

  // Short label shown next to a player's mark: "You", their name, or "Them".
  function who(side) {
    if (side === game.role) return "You";
    return game.names[side] || (game.role ? "Them" : "Player");
  }

  // Third-person name for the image and DMs.
  function nameFor(side) {
    return game.names[side] || (side === "x" ? "Player ✕" : "Player ◯");
  }

  // ---------- links ----------
  // ?g= game id, ?c= 9 two-character slots (base36 pool index, or "__" for a
  // written square, whose text follows in order as repeated &t=), ?v= moves as
  // cell digits in play order, ?x= and ?o= player names.

  function encodeGame(g) {
    var c = "", t = "";
    g.cells.forEach(function (n) {
      if (typeof n === "number") c += ("0" + n.toString(36)).slice(-2);
      else { c += "__"; t += "&t=" + encodeURIComponent(n); }
    });
    var q = "g=" + g.id + "&c=" + c + t;
    if (g.moves.length) q += "&v=" + g.moves.join("");
    if (g.names.x) q += "&x=" + encodeURIComponent(g.names.x);
    if (g.names.o) q += "&o=" + encodeURIComponent(g.names.o);
    return q;
  }

  function decodeGame(params) {
    var id = params.get("g") || "", code = params.get("c") || "", v = params.get("v") || "";
    if (!/^[a-z0-9]{6}$/.test(id) || !/^([0-9a-z]{2}|__){9}$/.test(code) || !/^[0-8]{0,9}$/.test(v)) return null;
    var written = params.getAll("t").map(function (t) { return cleanText(t); });
    var cells = [], w = 0;
    for (var i = 0; i < 18; i += 2) {
      var slot = code.slice(i, i + 2);
      if (slot === "__") {
        if (!written[w]) return null;
        cells.push(written[w++]);
      } else {
        var n = parseInt(slot, 36);
        if (n >= B.SQUARES.length) return null;
        cells.push(n);
      }
    }
    if (w !== written.length || new Set(cells).size !== 9) return null;
    var moves = v.split("").filter(Boolean).map(Number);
    if (new Set(moves).size !== moves.length) return null;
    // Nothing counts after the game was won.
    for (var m = 1; m <= moves.length; m++) {
      if (outcome(moves.slice(0, m)).winner) { moves = moves.slice(0, m); break; }
    }
    return {
      id: id, cells: cells, moves: moves, role: null,
      names: { x: cleanText(params.get("x"), MAX_NAME), o: cleanText(params.get("o"), MAX_NAME) }
    };
  }

  function siteUrl() {
    if (/^https?:$/.test(location.protocol)) return location.origin + location.pathname.replace(/index\.html$/, "");
    return "https://" + FALLBACK_SITE + "/";
  }

  function displaySite() {
    return siteUrl().replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  function gameLink() { return siteUrl() + "?" + encodeGame(game); }

  // ---------- storage (best effort: private windows can block it) ----------

  function loadGames() {
    try { return JSON.parse(localStorage.getItem(GAMES_KEY)) || {}; } catch (e) { return {}; }
  }

  function save() {
    try {
      var games = loadGames();
      games[game.id] = { cells: game.cells, moves: game.moves, names: game.names, role: game.role, at: Date.now() };
      var ids = Object.keys(games).sort(function (a, b) { return games[b].at - games[a].at; });
      ids.slice(KEEP_GAMES).forEach(function (id) { delete games[id]; });
      localStorage.setItem(GAMES_KEY, JSON.stringify(games));
      localStorage.setItem(CURRENT_KEY, game.id);
    } catch (e) {}
  }

  // A saved game, re-validated through the link decoder so bad data can't load.
  function savedGame(id) {
    var s = loadGames()[id];
    if (!s) return null;
    var g = decodeGame(new URLSearchParams(encodeGame({ id: id, cells: s.cells || [], moves: s.moves || [], names: s.names || {} })));
    if (!g) return null;
    g.role = s.role === "x" || s.role === "o" ? s.role : null;
    return g;
  }

  function myName() {
    try { return cleanText(localStorage.getItem(NAME_KEY), MAX_NAME); } catch (e) { return ""; }
  }

  function setMyName(name) {
    try { localStorage.setItem(NAME_KEY, name); } catch (e) {}
  }

  function isPrefix(a, b) {
    return a.length <= b.length && a.every(function (m, i) { return m === b[i]; });
  }

  // ---------- rendering ----------

  var SVG_NS = "http://www.w3.org/2000/svg";

  function markSvg(side) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "mark");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    if (side === "o") {
      var c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", 50); c.setAttribute("cy", 50); c.setAttribute("r", 42);
      c.setAttribute("pathLength", 1);
      svg.appendChild(c);
    } else {
      ["M12 12 L88 88", "M88 12 L12 88"].forEach(function (d) {
        var p = document.createElementNS(SVG_NS, "path");
        p.setAttribute("d", d);
        p.setAttribute("pathLength", 1);
        svg.appendChild(p);
      });
    }
    return svg;
  }

  function button(label, cls, onClick, disabled) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn" + (cls ? " " + cls : "");
    b.textContent = label;
    b.disabled = !!disabled;
    b.addEventListener("click", onClick);
    return b;
  }

  function show(el, text) {
    el.hidden = !text;
    el.textContent = text || "";
  }

  function lastMoveNote() {
    var n = game.moves.length;
    if (!n) return "";
    var side = (n - 1) % 2 === 0 ? "x" : "o";
    var sq = "“" + textOf(game.cells[game.moves[n - 1]]) + "”";
    return (side === game.role ? "You" : nameFor(side)) + " claimed " + sq + ".";
  }

  function render() {
    var ph = phase();
    var out = outcome(game.moves);
    var own = out.own.slice();
    var mySide = game.role || turn();
    if (pending !== null) own[pending] = mySide;

    // Players
    $("players").hidden = ph === "edit";
    ["x", "o"].forEach(function (side) {
      var chip = $("chip-" + side);
      var count = game.moves.filter(function (m, n) { return (n % 2 === 0 ? "x" : "o") === side; }).length;
      chip.textContent = "";
      var label = document.createElement("span");
      label.className = "player-name";
      label.textContent = who(side);
      var num = document.createElement("span");
      num.className = "player-count";
      num.textContent = count;
      chip.appendChild(label);
      chip.appendChild(markSvg(side));
      chip.appendChild(num);
      chip.setAttribute("aria-label", who(side) + ", " + GLYPH[side] + ", " + count + " claimed");
      chip.className = "player side-" + side + (!out.over && turn() === side ? " now" : "");
    });

    // Headline, hint and note
    var big = "", pill = "", note = "";
    if (ph === "edit") {
      pill = "Tap any square to rewrite it";
    } else if (ph === "claim") {
      big = "Your move";
      pill = "Claim a square you've actually seen. You're " + GLYPH[mySide] + ".";
    } else if (ph === "mine") {
      big = "Your move";
      note = lastMoveNote() + " Claim a square you've seen.";
    } else if (ph === "waiting") {
      big = "Waiting on " + (game.role ? (game.names[turn()] || "them") : nameFor(turn()));
      note = game.role
        ? "Sent your move? When they reply with a link, open it and the game picks up here."
        : lastMoveNote();
    } else {
      if (!out.winner) big = "Draw";
      else if (out.winner === game.role) big = "You win";
      else big = nameFor(out.winner) + " wins";
      note = out.winner ? lastMoveNote() + " Three in a row." : "Nine squares, no line. Rematch?";
    }
    show($("big"), big);
    show($("pill"), pill);
    show($("note"), note);
    $("big").classList.toggle("win", ph === "over");

    // Board
    var canPick = ph === "claim" || ph === "mine";
    grid.innerHTML = "";
    game.cells.forEach(function (cell, i) {
      var text = textOf(cell);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cell";
      b.dataset.i = i;
      var o = own[i];
      if (o) {
        b.dataset.owner = o;
        b.appendChild(markSvg(o));
      }
      if (i === pending) b.classList.add("pending");
      if (ph === "edit") b.classList.add("editable");
      if (canPick && (!out.own[i])) b.classList.add("open");
      var state = o ? (i === pending ? "your pick, not sent" : "claimed by " + who(o)) : "open";
      b.setAttribute("aria-label", text + ", " + (ph === "edit" ? "tap to rewrite" : state));
      var span = document.createElement("span");
      span.className = "txt";
      span.textContent = text;
      b.appendChild(span);
      grid.appendChild(b);
    });

    strikes.innerHTML = "";
    out.lines.forEach(function (l) {
      var a = l[0], z = l[2];
      var x1 = a % 3 + 0.5, y1 = Math.floor(a / 3) + 0.5;
      var x2 = z % 3 + 0.5, y2 = Math.floor(z / 3) + 0.5;
      var dx = (x2 - x1) * 0.14, dy = (y2 - y1) * 0.14;
      var line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", x1 - dx); line.setAttribute("y1", y1 - dy);
      line.setAttribute("x2", x2 + dx); line.setAttribute("y2", y2 + dy);
      line.setAttribute("pathLength", 1);
      strikes.appendChild(line);
    });

    // Action bar
    bar.innerHTML = "";
    var movesLabel = "Moves (" + game.moves.length + ")";
    if (ph === "edit") {
      bar.appendChild(button("Shuffle", "", shuffleCard));
      bar.appendChild(button("Original", "", originalCard));
      bar.appendChild(button("Next →", "btn-go", function () { claiming = true; render(); }));
    } else if (ph === "claim") {
      bar.appendChild(button("Edit squares", "", function () { claiming = false; pending = null; render(); }));
      bar.appendChild(button("Send move →", "btn-go", commitMove, pending === null));
    } else if (ph === "mine") {
      bar.appendChild(button(movesLabel, "", openMoves));
      bar.appendChild(button("Send move →", "btn-go", commitMove, pending === null));
    } else if (ph === "waiting") {
      bar.appendChild(button(movesLabel, "", openMoves));
      if (game.role) bar.appendChild(button("Resend →", "btn-go", openSend));
      else bar.appendChild(button("Start your own →", "btn-go", newGame));
    } else {
      bar.appendChild(button(movesLabel, "", openMoves));
      bar.appendChild(button("Save image", "", makeImage));
      bar.appendChild(button("New card →", "btn-go", newGame));
    }
    $("new-link").hidden = ph === "edit" || ph === "over" || (ph === "waiting" && !game.role);

    if (ph === "over" && !wasOver && (out.winner === game.role || !out.winner)) confetti();
    wasOver = ph === "over";

    try { history.replaceState(null, "", "?" + encodeGame(game)); } catch (e) {}
  }

  // ---------- making the card ----------

  function onCellTap(i) {
    var ph = phase();
    if (ph === "edit") { openEdit(i); return; }
    if (ph !== "claim" && ph !== "mine") return;
    if (outcome(game.moves).own[i]) return;
    pending = pending === i ? null : i;
    render();
  }

  function shuffleCard() {
    // Squares you wrote stay put; every pool square is dealt again.
    var fresh = poolDraw([]);
    game.cells = game.cells.map(function (c) { return typeof c === "number" ? fresh.shift() : c; });
    save();
    render();
    toast("New squares. Yours stayed put.");
  }

  function originalCard() {
    game.cells = B.CLASSIC.slice();
    save();
    render();
  }

  function openEdit(i) {
    editIndex = i;
    $("edit-text").value = textOf(game.cells[i]);
    editCount();
    $("edit-sheet").showModal();
    $("edit-text").focus();
    $("edit-text").select();
  }

  function editCount() {
    var n = $("edit-text").value.length;
    $("edit-count").textContent = n + " of " + MAX_LEN + " characters";
  }

  function saveEdit() {
    var text = cleanText($("edit-text").value);
    if (!text) { toast("Type something first"); return; }
    var lower = text.toLowerCase();
    var clash = game.cells.some(function (c, k) { return k !== editIndex && textOf(c).toLowerCase() === lower; });
    if (clash) { toast("That square is already on the card"); return; }
    // Keep it as a pool square if it matches one exactly, so links stay short.
    var idx = B.SQUARES.indexOf(text);
    game.cells[editIndex] = idx >= 0 ? idx : text;
    save();
    $("edit-sheet").close();
    render();
  }

  function randomSquare() {
    var onCard = game.cells.filter(function (c) { return typeof c === "number"; });
    game.cells[editIndex] = poolDraw(onCard)[0];
    save();
    $("edit-sheet").close();
    render();
  }

  function newGame() {
    var last = game;
    // Squares you wrote carry over to the next card; the rest are dealt fresh.
    var written = last && last.role === "x" ? last.cells.filter(function (c) { return typeof c === "string"; }) : [];
    var fresh = poolDraw([]).slice(0, 9 - written.length);
    game = {
      id: newId(),
      cells: shuffle(written.concat(fresh)),
      moves: [],
      names: { x: myName(), o: "" },
      role: "x"
    };
    claiming = false;
    pending = null;
    wasOver = false;
    save();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- playing ----------

  function commitMove() {
    if (pending === null) return;
    game.moves = game.moves.concat([pending]);
    pending = null;
    claiming = false;
    save();
    render();
    openSend();
  }

  function dmText() {
    var n = game.moves.length;
    var out = outcome(game.moves);
    var last = n ? "“" + textOf(game.cells[game.moves[n - 1]]) + "”" : "";
    var link = gameLink();
    if (out.winner && out.winner === game.role) return "Three in a row. I win this one. See the board: " + link;
    if (out.over && !out.winner) return "Board's full. It's a draw. See it here: " + link;
    if (n === 1) return "Instead of pitching you, I made you a LinkedIn Bingo/Tic-Tac-Toe card. I claimed " + last + ". Your move: " + link;
    return "I claimed " + last + ". Your move: " + link;
  }

  function openSend() {
    var out = outcome(game.moves);
    $("send-title").textContent = out.over ? "Send the result" : game.moves.length === 1 ? "Send to a connection" : "Send your move";
    $("my-name").value = game.names[game.role] || myName();
    $("dm-text").textContent = dmText();
    $("send-sheet").showModal();
  }

  function onNameInput() {
    var name = cleanText($("my-name").value, MAX_NAME);
    if (game.role) game.names[game.role] = name;
    setMyName(name);
    save();
    $("dm-text").textContent = dmText();
    render();
  }

  function copyDm() {
    var text = dmText();
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      navigator.share({ text: text }).catch(function (e) {
        if (e && e.name !== "AbortError") copyText(text, "Copied. Paste it in your DM.");
      });
    } else {
      copyText(text, "Copied. Paste it in your DM.");
    }
  }

  function copyText(text, okMsg) {
    var done = function () { toast(okMsg); };
    var fail = function () { legacyCopy(text) ? done() : toast("Couldn't copy. Select the message and copy it instead."); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fail);
    else fail();
  }

  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    ta.remove();
    return ok;
  }

  function openMoves() {
    var list = $("moves-list");
    list.innerHTML = "";
    if (!game.moves.length) {
      var empty = document.createElement("li");
      empty.className = "moves-empty";
      empty.textContent = "No moves yet.";
      list.appendChild(empty);
    }
    game.moves.forEach(function (cell, n) {
      var side = n % 2 === 0 ? "x" : "o";
      var li = document.createElement("li");
      var tag = document.createElement("span");
      tag.className = "side-" + side;
      tag.textContent = who(side) + " " + GLYPH[side];
      li.appendChild(tag);
      li.appendChild(document.createTextNode(" claimed “" + textOf(game.cells[cell]) + "”"));
      list.appendChild(li);
    });
    $("moves-sheet").showModal();
  }

  // ---------- image ----------

  var imgUrl = null, imgBlob = null;

  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load("italic 800 40px 'Roboto Condensed'"),
      document.fonts.load("800 40px 'Roboto Condensed'"),
      document.fonts.load("700 40px 'Roboto'")
    ]).catch(function () {});
  }

  function imageStatus() {
    var out = outcome(game.moves);
    if (out.winner) return nameFor(out.winner) + " wins";
    if (out.over) return "Draw";
    return nameFor("x") + " ✕  vs  " + nameFor("o") + " ◯";
  }

  function makeImage() {
    fontsReady().then(function () {
      var out = outcome(game.moves);
      var canvas = document.createElement("canvas");
      B.drawCard(canvas, {
        texts: game.cells.map(textOf),
        marks: out.own.map(function (o) { return o === "o" ? 1 : o === "x" ? 2 : 0; }),
        lines: out.lines,
        status: imageStatus(),
        footer: "Play: " + displaySite()
      });
      canvas.toBlob(function (blob) {
        if (!blob) { toast("Couldn't make the image. Try again?"); return; }
        if (imgUrl) URL.revokeObjectURL(imgUrl);
        imgBlob = blob;
        imgUrl = URL.createObjectURL(blob);
        $("img-preview").src = imgUrl;
        $("img-download").href = imgUrl;
        var file = new File([blob], "linkedin-bingo.png", { type: "image/png" });
        $("img-share").hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
        if ($("send-sheet").open) $("send-sheet").close();
        $("img-sheet").showModal();
      }, "image/png");
    });
  }

  function shareImage() {
    var file = new File([imgBlob], "linkedin-bingo.png", { type: "image/png" });
    navigator.share({ files: [file], text: "Play: " + gameLink() }).catch(function () {});
  }

  // ---------- flair ----------

  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var bits = [["◯", "#9db0ff"], ["✕", "#ff7a4d"], ["✕", "#ffffff"]];
    for (var i = 0; i < 36; i++) {
      var s = document.createElement("span");
      s.className = "confetti";
      s.textContent = bits[i % bits.length][0];
      s.style.color = bits[i % bits.length][1];
      s.style.left = Math.random() * 100 + "vw";
      s.style.animationDuration = 1.6 + Math.random() * 1.6 + "s";
      s.style.animationDelay = Math.random() * 0.4 + "s";
      s.style.fontSize = 16 + Math.random() * 18 + "px";
      document.body.appendChild(s);
      setTimeout(s.remove.bind(s), 4000);
    }
  }

  // ---------- boot ----------

  function boot() {
    var linked = decodeGame(new URLSearchParams(location.search));
    if (linked) {
      var saved = savedGame(linked.id);
      var sameCard = saved && JSON.stringify(saved.cells) === JSON.stringify(linked.cells);
      if (sameCard && isPrefix(linked.moves, saved.moves)) {
        // An older (or the same) link for a game we already have: keep ours.
        game = saved;
      } else {
        game = linked;
        if (sameCard) game.role = saved.role;
        else game.role = outcome(linked.moves).over ? null : turn();
      }
      // Pick up any names either side has added.
      ["x", "o"].forEach(function (s) { game.names[s] = game.names[s] || linked.names[s] || (saved && saved.names[s]) || ""; });
      if (game.role && !game.names[game.role] && myName()) game.names[game.role] = myName();
    } else {
      var current;
      try { current = localStorage.getItem(CURRENT_KEY); } catch (e) {}
      game = current && savedGame(current);
      if (!game) {
        game = { id: newId(), cells: B.CLASSIC.slice(), moves: [], names: { x: myName(), o: "" }, role: "x" };
      }
    }
    wasOver = phase() === "over";
    save();

    grid.addEventListener("click", function (e) {
      var cell = e.target.closest(".cell");
      if (cell) onCellTap(Number(cell.dataset.i));
    });
    document.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { b.closest("dialog").close(); });
    });
    document.querySelectorAll("dialog").forEach(function (d) {
      d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
    });
    $("edit-form").addEventListener("submit", function (e) { e.preventDefault(); saveEdit(); });
    $("edit-text").addEventListener("input", editCount);
    $("edit-text").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
    });
    $("edit-random").addEventListener("click", randomSquare);
    $("my-name").addEventListener("input", onNameInput);
    $("btn-copy-dm").addEventListener("click", copyDm);
    $("btn-image").addEventListener("click", makeImage);
    $("img-share").addEventListener("click", shareImage);
    $("btn-new-game").addEventListener("click", newGame);

    render();
  }

  boot();
})();
