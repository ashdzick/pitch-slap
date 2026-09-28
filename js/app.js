(function () {
  var B = window.BINGO;
  var STORE_KEY = "li-bingo-v1";
  var FREE = 4;
  var NONE = 0, SEEN = 1, DID = 2, FREE_MARK = 3;
  var FALLBACK_SITE = "ashdzick.github.io/pitch-slap";

  var $ = function (id) { return document.getElementById(id); };
  var grid = $("grid"), strikes = $("strikes"), statusEl = $("status");

  // state.cells: 8 squares for the non-center spots, in reading order. Each is
  // either a number (index into B.SQUARES) or a string (a square someone wrote).
  // state.marks: 9 marks, one per spot. Center is always FREE_MARK.
  var state;
  var wasWinning = false;
  var custom = []; // this browser's own squares

  var CUSTOM_KEY = "li-bingo-custom-v1";
  var MAX_CUSTOM = 8, MAX_LEN = 60;

  // ---------- card encoding (for share links) ----------
  // ?c= holds 8 two-character slots: a base36 pool index, or "__" for a
  // written square. Written squares follow in order as repeated &t= params.

  function encodeCard(cells) {
    var c = "", t = "";
    cells.forEach(function (n) {
      if (typeof n === "number") c += ("0" + n.toString(36)).slice(-2);
      else { c += "__"; t += "&t=" + encodeURIComponent(n); }
    });
    return "c=" + c + t;
  }

  function cleanText(text) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
  }

  function decodeCard(params) {
    var code = params.get("c") || "";
    if (!/^([0-9a-z]{2}|__){8}$/.test(code)) return null;
    var written = params.getAll("t").map(cleanText);
    var cells = [], w = 0;
    for (var i = 0; i < 16; i += 2) {
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
    if (w !== written.length || new Set(cells).size !== 8) return null;
    return cells;
  }

  function encodeMarks(marks) {
    return marks.map(function (m, i) { return i === FREE ? 0 : m; }).join("");
  }

  function decodeMarks(code) {
    if (!/^[0-2]{9}$/.test(code || "")) return null;
    var marks = code.split("").map(Number);
    marks[FREE] = FREE_MARK;
    return marks;
  }

  function blankMarks() {
    var m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    m[FREE] = FREE_MARK;
    return m;
  }

  function shuffle(a) {
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  // Pool squares not retired and not in `exclude`, in random order.
  function poolDraw(exclude) {
    var pool = [];
    for (var i = 0; i < B.SQUARES.length; i++) {
      if (B.RETIRED.indexOf(i) < 0 && exclude.indexOf(i) < 0) pool.push(i);
    }
    return shuffle(pool);
  }

  // Every one of your own squares, topped up from the pool, in random spots.
  function randomCells() {
    var cells = custom.slice(0, 8);
    return shuffle(cells.concat(poolDraw([]).slice(0, 8 - cells.length)));
  }

  function texts() {
    var out = [], c = 0;
    for (var i = 0; i < 9; i++) {
      if (i === FREE) { out.push(B.FREE_SPACE); continue; }
      var cell = state.cells[c++];
      out.push(typeof cell === "number" ? B.SQUARES[cell] : cell);
    }
    return out;
  }

  // ---------- storage (best effort: private windows can block it) ----------

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function loadSaved() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && Array.isArray(s.cells) && s.cells.length === 8 &&
          decodeCard(new URLSearchParams(encodeCard(s.cells))) &&
          Array.isArray(s.marks) && s.marks.length === 9) {
        s.marks[FREE] = FREE_MARK;
        return s;
      }
    } catch (e) {}
    return null;
  }

  function saveCustom() {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch (e) {}
  }

  function loadCustom() {
    try {
      var c = JSON.parse(localStorage.getItem(CUSTOM_KEY));
      if (Array.isArray(c)) return c.map(cleanText).filter(Boolean).slice(0, MAX_CUSTOM);
    } catch (e) {}
    return [];
  }

  // ---------- scoring ----------

  function winningLines(marks) {
    return B.LINES.filter(function (line) {
      return line.every(function (i) { return marks[i] > 0; });
    });
  }

  function counts(marks) {
    var seen = 0, did = 0;
    marks.forEach(function (m) { if (m === SEEN) seen++; if (m === DID) did++; });
    return { seen: seen, did: did };
  }

  function statusText(marks, forImage) {
    var wins = winningLines(marks);
    var c = counts(marks);
    if (marks.every(function (m) { return m > 0; })) return "BLACKOUT. Log off and touch grass.";
    if (wins.length) {
      var kinds = [];
      wins.forEach(function (l) { l.forEach(function (i) { if (i !== FREE) kinds.push(marks[i]); }); });
      if (kinds.every(function (k) { return k === DID; })) return "TIC-TAC-TOE! Guilty as charged.";
      if (kinds.every(function (k) { return k === SEEN; })) return "TIC-TAC-TOE! Professional witness.";
      return "TIC-TAC-TOE!";
    }
    if (!c.seen && !c.did) return forImage ? "Seen it or done it? Mark it." : HINT;
    var parts = [];
    if (c.seen) parts.push(c.seen + " seen");
    if (c.did) parts.push(c.did + " done");
    return parts.join(" · ");
  }

  var HINT = "Tap once if you've seen it. Tap twice if you've done it.";

  function emojiGrid(marks) {
    var sym = ["⬜", "⭕", "❌", "🆓"];
    return [0, 3, 6].map(function (r) {
      return sym[marks[r]] + sym[marks[r + 1]] + sym[marks[r + 2]];
    }).join("\n");
  }

  // ---------- rendering ----------

  var SVG_NS = "http://www.w3.org/2000/svg";

  function markSvg(mark) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "mark");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    if (mark === SEEN) {
      var c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", 50); c.setAttribute("cy", 50); c.setAttribute("r", 44);
      c.setAttribute("pathLength", 1);
      svg.appendChild(c);
    } else {
      [["M10 10 L90 90"], ["M90 10 L10 90"]].forEach(function (d) {
        var p = document.createElementNS(SVG_NS, "path");
        p.setAttribute("d", d[0]);
        p.setAttribute("pathLength", 1);
        svg.appendChild(p);
      });
    }
    return svg;
  }

  function render() {
    var t = texts();
    grid.innerHTML = "";
    t.forEach(function (text, i) {
      var m = state.marks[i];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell" + (i === FREE ? " free" : "");
      btn.dataset.mark = m;
      btn.dataset.i = i;
      var label = m === SEEN ? "seen it" : m === DID ? "done it" : m === FREE_MARK ? "free space" : "not marked";
      btn.setAttribute("aria-label", text + ", " + label);
      if (m === SEEN || m === DID) btn.appendChild(markSvg(m));
      var span = document.createElement("span");
      span.className = "txt";
      span.textContent = text;
      btn.appendChild(span);
      grid.appendChild(btn);
    });

    var wins = winningLines(state.marks);
    strikes.innerHTML = "";
    wins.forEach(function (l) {
      var a = l[0], b = l[2];
      var x1 = a % 3 + 0.5, y1 = Math.floor(a / 3) + 0.5;
      var x2 = b % 3 + 0.5, y2 = Math.floor(b / 3) + 0.5;
      var dx = (x2 - x1) * 0.14, dy = (y2 - y1) * 0.14;
      var line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", x1 - dx); line.setAttribute("y1", y1 - dy);
      line.setAttribute("x2", x2 + dx); line.setAttribute("y2", y2 + dy);
      line.setAttribute("pathLength", 1);
      strikes.appendChild(line);
    });

    var winning = wins.length > 0;
    statusEl.textContent = statusText(state.marks);
    statusEl.classList.toggle("hint", statusEl.textContent === HINT);
    statusEl.classList.toggle("win", winning);
    if (winning && !wasWinning) confetti();
    wasWinning = winning;

    syncUrl();
  }

  function syncUrl() {
    try { history.replaceState(null, "", "?" + encodeCard(state.cells)); } catch (e) {}
  }

  // ---------- actions ----------

  function tap(i) {
    if (i === FREE) { toast("Free space. AI posts are everywhere."); return; }
    state.marks[i] = (state.marks[i] + 1) % 3;
    save();
    render();
  }

  function newCard(cells) {
    state = { cells: cells || randomCells(), marks: blankMarks() };
    wasWinning = false;
    save();
    render();
  }

  function siteUrl() {
    if (/^https?:$/.test(location.protocol)) return location.origin + location.pathname.replace(/index\.html$/, "");
    return "https://" + FALLBACK_SITE + "/";
  }

  function displaySite() {
    return siteUrl().replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  function shareLink(withMarks) {
    var url = siteUrl() + "?" + encodeCard(state.cells);
    if (withMarks) url += "&m=" + encodeMarks(state.marks);
    return url;
  }

  function copyText(text, okMsg) {
    var done = function () { toast(okMsg); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text) ? done() : toast("Couldn't copy. Try again?"); });
    } else {
      legacyCopy(text) ? done() : toast("Couldn't copy. Try again?");
    }
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

  function sendToConnection() {
    var text = "Instead of pitch slapping you, I'm sending you LinkedIn Bingo/Tic-Tac-Toe.\n\n" +
      emojiGrid(state.marks) + "\n" + statusText(state.marks, true) +
      "\n\nSame card, your turn: " + shareLink(true);
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      navigator.share({ text: text }).catch(function (e) {
        if (e && e.name !== "AbortError") copyText(text, "Copied! Paste it in their DMs.");
      });
    } else {
      copyText(text, "Copied! Paste it in their DMs.");
    }
  }

  function copyResult() {
    var text = "LinkedIn Bingo/Tic-Tac-Toe\n" + emojiGrid(state.marks) + "\n" +
      statusText(state.marks, true) + "\nPlay: " + shareLink(false);
    copyText(text, "Copied! Paste it in the comments.");
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

  function makeImage() {
    var btn = $("btn-share");
    btn.disabled = true;
    fontsReady().then(function () {
      var canvas = document.createElement("canvas");
      B.drawCard(canvas, {
        texts: texts(),
        marks: state.marks,
        status: statusText(state.marks, true),
        footer: "Play: " + displaySite()
      });
      canvas.toBlob(function (blob) {
        btn.disabled = false;
        if (!blob) { toast("Couldn't make the image. Try again?"); return; }
        if (imgUrl) URL.revokeObjectURL(imgUrl);
        imgBlob = blob;
        imgUrl = URL.createObjectURL(blob);
        $("img-preview").src = imgUrl;
        $("img-download").href = imgUrl;
        var file = new File([blob], "linkedin-bingo.png", { type: "image/png" });
        $("img-share").hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
        $("img-download").classList.toggle("span-all", $("img-share").hidden);
        var dlg = $("img-dialog");
        if (dlg.showModal) dlg.showModal(); else window.open(imgUrl, "_blank");
      }, "image/png");
    });
  }

  function shareImage() {
    var file = new File([imgBlob], "linkedin-bingo.png", { type: "image/png" });
    navigator.share({ files: [file], text: "Play: " + shareLink(false) })
      .catch(function () {});
  }

  // ---------- your own squares ----------

  function renderCustom() {
    var list = $("custom-list");
    list.innerHTML = "";
    custom.forEach(function (text) {
      var li = document.createElement("li");
      var span = document.createElement("span");
      span.textContent = text;
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "custom-remove";
      rm.textContent = "✕";
      rm.setAttribute("aria-label", "Remove " + text);
      rm.addEventListener("click", function () { removeCustom(text); });
      li.appendChild(span);
      li.appendChild(rm);
      list.appendChild(li);
    });
    var full = custom.length >= MAX_CUSTOM;
    $("custom-input").disabled = full;
    $("custom-add").disabled = full;
    $("custom-input").placeholder = full ? "That's 8. Remove one to add another." : "e.g. \"Thought leader\" in their headline";
    $("custom-count").textContent = custom.length ? custom.length + " of " + MAX_CUSTOM : "";
  }

  // Put a written square on the current card, over an unmarked pool square if there is one.
  function placeOnCard(text) {
    var spots = [];
    state.cells.forEach(function (cell, k) { if (typeof cell === "number") spots.push(k); });
    if (!spots.length) return false;
    var markIndex = function (k) { return k < FREE ? k : k + 1; };
    var open = spots.filter(function (k) { return state.marks[markIndex(k)] === NONE; });
    var pick = shuffle(open.length ? open : spots)[0];
    state.cells[pick] = text;
    state.marks[markIndex(pick)] = NONE;
    return true;
  }

  function addCustom(raw) {
    var text = cleanText(raw);
    if (!text) return;
    var lower = text.toLowerCase();
    var taken = custom.concat(texts()).some(function (t) { return t.toLowerCase() === lower; });
    if (taken) { toast("That square is already there"); return; }
    custom.push(text);
    saveCustom();
    placeOnCard(text);
    save();
    render();
    renderCustom();
    $("custom-input").value = "";
    toast("Added to your card");
  }

  function removeCustom(text) {
    custom = custom.filter(function (t) { return t !== text; });
    saveCustom();
    var k = state.cells.indexOf(text);
    if (k >= 0) {
      var onCard = state.cells.filter(function (c) { return typeof c === "number"; });
      state.cells[k] = poolDraw(onCard)[0];
      state.marks[k < FREE ? k : k + 1] = NONE;
      save();
      render();
    }
    renderCustom();
  }

  // ---------- flair ----------

  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
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
    var params = new URLSearchParams(location.search);
    var linkCells = decodeCard(params);
    var theirMarks = decodeMarks(params.get("m"));
    var saved = loadSaved();
    custom = loadCustom();

    if (linkCells && saved && encodeCard(saved.cells) === encodeCard(linkCells) && !theirMarks) {
      state = saved; // reopening your own card
    } else if (linkCells) {
      state = { cells: linkCells, marks: blankMarks() };
      save();
    } else {
      state = saved || { cells: B.CLASSIC.slice(), marks: blankMarks() };
    }
    wasWinning = winningLines(state.marks).length > 0;

    if (linkCells && theirMarks) {
      var mini = $("incoming-grid"), glyph = ["", "◯", "✕", "FREE"];
      theirMarks.forEach(function (m) {
        var d = document.createElement("span");
        d.dataset.mark = m;
        d.textContent = glyph[m];
        mini.appendChild(d);
      });
      var tc = counts(theirMarks);
      mini.setAttribute("aria-label", "Their card: " + tc.seen + " seen, " + tc.did + " done");
      $("incoming-status").textContent = statusText(theirMarks, true);
      $("incoming").hidden = false;
    }

    grid.addEventListener("click", function (e) {
      var cell = e.target.closest(".cell");
      if (cell) tap(Number(cell.dataset.i));
    });
    $("btn-new").addEventListener("click", function () { newCard(); toast("New card"); });
    $("btn-classic").addEventListener("click", function () { newCard(B.CLASSIC.slice()); toast("The original card"); });
    $("btn-clear").addEventListener("click", function () {
      state.marks = blankMarks(); wasWinning = false; save(); render();
    });
    $("btn-share").addEventListener("click", makeImage);
    $("btn-send").addEventListener("click", sendToConnection);
    $("btn-copy").addEventListener("click", copyResult);
    $("img-share").addEventListener("click", shareImage);
    $("img-close").addEventListener("click", function () { $("img-dialog").close(); });
    $("img-dialog").addEventListener("click", function (e) { if (e.target === this) this.close(); });
    document.querySelector(".incoming-close").addEventListener("click", function () { $("incoming").hidden = true; });

    $("custom-form").addEventListener("submit", function (e) {
      e.preventDefault();
      addCustom($("custom-input").value);
    });

    render();
    renderCustom();
  }

  boot();
})();
