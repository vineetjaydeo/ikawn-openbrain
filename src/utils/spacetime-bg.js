// Spacetime background — server-generated random star field, pure CSS render

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateStars() {
  const layers = [];

  // Layer 1: Distant tiny stars (many, dim, small)
  const distant = [];
  for (let i = 0; i < 120; i++) {
    const x = rand(0, 100).toFixed(2);
    const y = rand(0, 100).toFixed(2);
    const size = rand(0.5, 1).toFixed(1);
    const alpha = rand(0.15, 0.4).toFixed(2);
    const hue = pick(['200,205,230', '190,195,220', '180,185,215', '210,210,235']);
    distant.push(`radial-gradient(${size}px ${size}px at ${x}% ${y}%, rgba(${hue},${alpha}), transparent)`);
  }
  layers.push({ gradients: distant, className: 'stars-distant' });

  // Layer 2: Mid-range stars (moderate count, brighter)
  const mid = [];
  for (let i = 0; i < 45; i++) {
    const x = rand(0, 100).toFixed(2);
    const y = rand(0, 100).toFixed(2);
    const size = rand(1, 1.8).toFixed(1);
    const alpha = rand(0.4, 0.7).toFixed(2);
    const hue = pick(['220,225,250', '210,215,240', '230,230,255', '200,210,240']);
    mid.push(`radial-gradient(${size}px ${size}px at ${x}% ${y}%, rgba(${hue},${alpha}), transparent)`);
  }
  layers.push({ gradients: mid, className: 'stars-mid' });

  // Layer 3: Bright foreground stars (few, large, vivid)
  const bright = [];
  for (let i = 0; i < 12; i++) {
    const x = rand(2, 98).toFixed(2);
    const y = rand(2, 80).toFixed(2);
    const size = rand(1.8, 2.8).toFixed(1);
    const alpha = rand(0.6, 0.9).toFixed(2);
    const hue = pick(['240,240,255', '255,250,240', '230,235,255', '250,245,230']);
    bright.push(`radial-gradient(${size}px ${size}px at ${x}% ${y}%, rgba(${hue},${alpha}), transparent)`);
  }
  layers.push({ gradients: bright, className: 'stars-bright' });

  // Layer 4: Star clusters (3-6 tight stars grouped together)
  const clusters = [];
  const numClusters = Math.floor(rand(3, 6));
  for (let c = 0; c < numClusters; c++) {
    const cx = rand(8, 92);
    const cy = rand(5, 65);
    const count = Math.floor(rand(4, 8));
    for (let i = 0; i < count; i++) {
      const x = (cx + rand(-2.5, 2.5)).toFixed(2);
      const y = (cy + rand(-2, 2)).toFixed(2);
      const size = rand(0.5, 1.3).toFixed(1);
      const alpha = rand(0.25, 0.55).toFixed(2);
      clusters.push(`radial-gradient(${size}px ${size}px at ${x}% ${y}%, rgba(210,215,240,${alpha}), transparent)`);
    }
  }
  layers.push({ gradients: clusters, className: 'stars-clusters' });

  return { layers };
}

function buildCSS(stars) {
  let css = `
  .spacetime-bg {
    position: fixed; inset: 0; z-index: 0;
    pointer-events: none;
    overflow: hidden;
    background: rgb(5,5,5);
  }
  .spacetime-grid {
    position: absolute;
    left: -50%; right: -50%;
    bottom: -10%; height: 60%;
    background-image:
      linear-gradient(rgba(55,55,70,0.3) 1px, transparent 1px),
      linear-gradient(90deg, rgba(55,55,70,0.3) 1px, transparent 1px);
    background-size: 80px 80px;
    transform: perspective(400px) rotateX(55deg);
    transform-origin: center top;
    mask-image: linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.12) 40%, transparent 70%);
    -webkit-mask-image: linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.12) 40%, transparent 70%);
  }
  .spacetime-stars-layer {
    position: absolute; inset: 0;
  }`;

  // Animated comet — travels across the viewport
  css += `
  .comet {
    position: absolute;
    pointer-events: none;
    opacity: 0;
  }
  .comet-body {
    width: 120px; height: 2px;
    border-radius: 1px;
    background: linear-gradient(270deg, rgba(255,255,255,0.95) 0%, rgba(220,225,250,0.4) 40%, transparent 100%);
    position: relative;
  }
  .comet-body::after {
    content: '';
    position: absolute;
    right: -3px; top: -2px;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: rgba(255,255,255,0.95);
    box-shadow: 0 0 6px rgba(220,225,250,0.7), 0 0 14px rgba(200,210,240,0.35);
  }`;

  return css;
}

function buildHTML(stars) {
  let html = '<div class="spacetime-bg">';

  // Star layers
  stars.layers.forEach(layer => {
    html += `<div class="spacetime-stars-layer" style="background-image:${layer.gradients.join(',')}"></div>`;
  });

  html += '<div class="comet" id="comet"><div class="comet-body"></div></div>';
  html += '<div class="spacetime-grid"></div></div>';
  return html;
}

const METEOR_JS = `
(function() {
  var comet = document.getElementById('comet');
  if (!comet) return;
  function rand(a,b) { return a + Math.random() * (b - a); }
  var anim = null;
  function spawn() {
    var w = window.innerWidth, h = window.innerHeight;
    // Start from a random edge (top or left/right upper half)
    var sx, sy, ex, ey;
    var edge = Math.random();
    if (edge < 0.5) {
      // Start from top edge, exit bottom-right or bottom-left
      sx = rand(0.1, 0.9) * w;
      sy = -20;
      ex = sx + rand(0.3, 0.7) * w * (Math.random() < 0.5 ? 1 : -1);
      ey = h + 20;
    } else if (edge < 0.75) {
      // Start from left edge
      sx = -20;
      sy = rand(0.05, 0.4) * h;
      ex = w + 20;
      ey = rand(0.5, 0.9) * h;
    } else {
      // Start from right edge
      sx = w + 20;
      sy = rand(0.05, 0.4) * h;
      ex = -20;
      ey = rand(0.5, 0.9) * h;
    }
    var dx = ex - sx, dy = ey - sy;
    var angle = Math.atan2(dy, dx) * 180 / Math.PI;
    comet.style.left = sx + 'px';
    comet.style.top = sy + 'px';
    comet.style.transform = 'rotate(' + angle + 'deg)';
    comet.style.opacity = '1';
    comet.style.transition = 'none';
    // Animate across screen
    var dist = Math.sqrt(dx*dx + dy*dy);
    var duration = Math.max(800, Math.min(1800, dist * 0.8));
    var start = null;
    if (anim) cancelAnimationFrame(anim);
    function fly(ts) {
      if (!start) start = ts;
      var p = (ts - start) / duration;
      if (p >= 1) {
        comet.style.opacity = '0';
        setTimeout(spawn, 5000);
        return;
      }
      var ease = 1 - Math.pow(1 - p, 2);
      var cx = sx + dx * ease;
      var cy = sy + dy * ease;
      comet.style.left = cx + 'px';
      comet.style.top = cy + 'px';
      // Fade in fast, hold, fade out at end
      var op = p < 0.05 ? p / 0.05 : p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      comet.style.opacity = op;
      anim = requestAnimationFrame(fly);
    }
    anim = requestAnimationFrame(fly);
  }
  setTimeout(spawn, 1000);
})();
`;

function getSpacetimeBg() {
  const stars = generateStars();
  return {
    SPACETIME_CSS: buildCSS(stars),
    SPACETIME_HTML: buildHTML(stars),
    METEOR_JS,
  };
}

module.exports = { getSpacetimeBg };
