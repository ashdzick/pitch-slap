// Draws a card onto a canvas so people can save and post it.
// Pure canvas, no libraries: this runs entirely in the browser.
(function () {
  var W = 1080, H = 1350;
  var S = W / 800; // layout below is measured on the 800x1000 original

  var C = {
    blue: "#4a62c6",
    orange: "#ef6436",
    navy: "#2b3446",
    header: "#283141",
    white: "#ffffff",
    seenTint: "#2f3f6e",
    didTint: "#4d3338",
    seen: "#9db0ff",
    did: "#ff7a4d"
  };

  var LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  function poly(ctx, pts) {
    ctx.beginPath();
    pts.forEach(function (p, i) {
      i ? ctx.lineTo(p[0] * S, p[1] * S) : ctx.moveTo(p[0] * S, p[1] * S);
    });
    ctx.closePath();
    ctx.fill();
  }

  // Film grain like the original. Seeded so every export looks identical.
  function grain(ctx) {
    var img = ctx.getImageData(0, 0, W, H), d = img.data, s = 1337;
    for (var i = 0; i < d.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      var n = ((s >> 8) % 29) - 14;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  function wrap(ctx, text, maxW) {
    var words = text.split(/\s+/), lines = [], line = "";
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (ctx.measureText(test).width <= maxW || !line) line = test;
      else { lines.push(line); line = w; }
    });
    if (line) lines.push(line);
    return lines;
  }

  // Largest font size where the wrapped text fits the box.
  function fitText(ctx, text, maxW, maxH, family, start, min) {
    for (var size = start; size >= min; size -= 2) {
      ctx.font = family.replace("{}", size);
      var lines = wrap(ctx, text, maxW);
      var widest = Math.max.apply(null, lines.map(function (l) { return ctx.measureText(l).width; }));
      if (lines.length * size * 1.18 <= maxH && widest <= maxW) return { size: size, lines: lines };
    }
    ctx.font = family.replace("{}", min);
    return { size: min, lines: wrap(ctx, text, maxW) };
  }

  function drawO(ctx, cx, cy, r) {
    ctx.save();
    ctx.strokeStyle = C.seen;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawX(ctx, cx, cy, r) {
    ctx.save();
    ctx.strokeStyle = C.did;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = r * 0.17;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
    ctx.stroke();
    ctx.restore();
  }

  // opts: { texts: [9 strings], marks: [9 ints: 0 none, 1 seen, 2 did, 3 free],
  //         status: string, footer: string }
  function drawCard(canvas, opts) {
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d");

    ctx.fillStyle = C.blue;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.orange;
    poly(ctx, [[0, 0], [275, 0], [800, 690], [800, 1000], [395, 1000], [60, 470], [0, 350]]);
    grain(ctx);

    // Header bar
    var hy = 55 * S, hh = 97 * S;
    ctx.fillStyle = C.header;
    ctx.fillRect(0, hy, W, hh);
    ctx.fillStyle = C.white;
    ctx.textBaseline = "middle";
    var a = "LINKEDIN", b = " BINGO/TIC-TAC-TOE", size = 96, wa, wb;
    do {
      size -= 2;
      ctx.font = "italic 800 " + size + "px 'Roboto Condensed', 'Arial Narrow', sans-serif";
      wa = ctx.measureText(a).width;
      ctx.font = "800 " + size + "px 'Roboto Condensed', 'Arial Narrow', sans-serif";
      wb = ctx.measureText(b).width;
    } while (wa + wb > W - 90);
    var tx = (W - wa - wb) / 2, ty = hy + hh / 2 + 3;
    ctx.textAlign = "left";
    ctx.font = "italic 800 " + size + "px 'Roboto Condensed', 'Arial Narrow', sans-serif";
    ctx.fillText(a, tx, ty);
    ctx.fillRect(tx, ty + size * 0.42, wa - 4, 5);
    ctx.font = "800 " + size + "px 'Roboto Condensed', 'Arial Narrow', sans-serif";
    ctx.fillText(b, tx + wa, ty);

    // Grid
    var gx = 100 * S, gy = 198 * S, gs = 605 * S, gap = 7;
    var cs = (gs - gap * 4) / 3;
    ctx.fillStyle = C.orange;
    ctx.fillRect(gx, gy, gs, gs);

    // Pass 1: cell backgrounds and marks.
    var boxes = [], centers = [];
    for (var i = 0; i < 9; i++) {
      var x = gx + gap + (i % 3) * (cs + gap);
      var y = gy + gap + Math.floor(i / 3) * (cs + gap);
      var m = opts.marks[i];
      boxes.push([x, y]);
      centers.push([x + cs / 2, y + cs / 2]);

      ctx.fillStyle = m === 1 ? C.seenTint : m === 2 ? C.didTint : C.navy;
      ctx.fillRect(x, y, cs, cs);
      if (m === 3) {
        ctx.strokeStyle = "rgba(239,100,54,0.6)";
        ctx.lineWidth = 6;
        ctx.strokeRect(x + 3, y + 3, cs - 6, cs - 6);
      }
      if (m === 1) drawO(ctx, x + cs / 2, y + cs / 2, cs * 0.36);
      if (m === 2) drawX(ctx, x + cs / 2, y + cs / 2, cs * 0.32);
    }

    // Pass 2: strike through every winning line, under the text so it stays readable.
    LINES.forEach(function (line) {
      if (!line.every(function (k) { return opts.marks[k] > 0; })) return;
      var p = centers[line[0]], q = centers[line[2]];
      var dx = (q[0] - p[0]) * 0.14, dy = (q[1] - p[1]) * 0.14;
      ctx.save();
      ctx.strokeStyle = C.white;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 14;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p[0] - dx, p[1] - dy);
      ctx.lineTo(q[0] + dx, q[1] + dy);
      ctx.stroke();
      ctx.restore();
    });

    // Pass 3: text, with a dark halo so it reads over marks and strikes.
    for (var j = 0; j < 9; j++) {
      var bx = boxes[j][0], byy = boxes[j][1], pad = 30;
      var fit = fitText(ctx, opts.texts[j], cs - pad * 2, cs - pad * 2,
        "700 {}px 'Roboto', 'Helvetica Neue', Arial, sans-serif", 38, 20);
      var lh = fit.size * 1.18;
      var top = byy + cs / 2 - (fit.lines.length * lh) / 2 + lh / 2;
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineWidth = opts.marks[j] ? 7 : 0;
      ctx.strokeStyle = "rgba(20,24,34,0.85)";
      ctx.fillStyle = C.white;
      fit.lines.forEach(function (l, n) {
        if (opts.marks[j]) ctx.strokeText(l, bx + cs / 2, top + n * lh);
        ctx.fillText(l, bx + cs / 2, top + n * lh);
      });
    }

    // Status + footer
    var by = gy + gs;
    ctx.textAlign = "center";
    ctx.fillStyle = C.white;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    fitText(ctx, opts.status, W - 120, 80,
      "800 {}px 'Roboto Condensed', 'Arial Narrow', sans-serif", 64, 30);
    ctx.fillText(opts.status, W / 2, by + 88);
    ctx.shadowBlur = 0;

    ctx.font = "700 30px 'Roboto', Arial, sans-serif";
    var fw = ctx.measureText(opts.footer).width + 56;
    ctx.fillStyle = C.header;
    roundRect(ctx, (W - fw) / 2, by + 150, fw, 62, 31);
    ctx.fillStyle = C.white;
    ctx.fillText(opts.footer, W / 2, by + 182);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  window.BINGO.drawCard = drawCard;
  window.BINGO.LINES = LINES;
})();
