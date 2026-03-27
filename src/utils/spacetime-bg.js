// Spacetime background — lightweight SVG parallax star field
// 3 SVG layers drifting at different speeds for depth illusion

function rand(min, max) { return min + Math.random() * (max - min); }

function generateSVGLayer(count, sizeRange, opacityRange, hues) {
  const dots = [];
  for (let i = 0; i < count; i++) {
    const cx = rand(0, 1000).toFixed(1);
    const cy = rand(0, 1000).toFixed(1);
    const r = rand(sizeRange[0], sizeRange[1]).toFixed(2);
    const opacity = rand(opacityRange[0], opacityRange[1]).toFixed(2);
    const hue = hues[Math.floor(Math.random() * hues.length)];
    dots.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgb(${hue})" opacity="${opacity}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">${dots.join('')}</svg>`;
}

function getSpacetimeBg() {
  // Layer 1: Many tiny dim stars — slowest drift (far away)
  const layer1 = generateSVGLayer(
    80, [0.4, 0.8], [0.15, 0.35],
    ['200,205,230', '190,195,220', '180,185,215']
  );
  // Layer 2: Medium stars — medium drift
  const layer2 = generateSVGLayer(
    30, [0.8, 1.4], [0.35, 0.6],
    ['220,225,250', '210,215,240', '230,230,255']
  );
  // Layer 3: Few bright stars — fastest drift (close)
  const layer3 = generateSVGLayer(
    10, [1.2, 2.2], [0.55, 0.85],
    ['240,240,255', '255,250,240', '250,245,230']
  );

  const b64_1 = Buffer.from(layer1).toString('base64');
  const b64_2 = Buffer.from(layer2).toString('base64');
  const b64_3 = Buffer.from(layer3).toString('base64');

  const SPACETIME_CSS = `
  .spacetime-bg {
    position: fixed; inset: 0; z-index: 0;
    pointer-events: none;
    overflow: hidden;
    background: rgb(5,5,5);
  }
  .star-layer {
    position: absolute;
    inset: -10%;
    width: 120%; height: 120%;
    background-repeat: repeat;
    background-size: cover;
    will-change: transform;
  }
  .star-layer-1 {
    background-image: url("data:image/svg+xml;base64,${b64_1}");
    animation: drift1 120s linear infinite;
  }
  .star-layer-2 {
    background-image: url("data:image/svg+xml;base64,${b64_2}");
    animation: drift2 80s linear infinite;
  }
  .star-layer-3 {
    background-image: url("data:image/svg+xml;base64,${b64_3}");
    animation: drift3 50s linear infinite;
  }
  @keyframes drift1 {
    from { transform: translate(0, 0); }
    to { transform: translate(-40px, -20px); }
  }
  @keyframes drift2 {
    from { transform: translate(0, 0); }
    to { transform: translate(-70px, -35px); }
  }
  @keyframes drift3 {
    from { transform: translate(0, 0); }
    to { transform: translate(-100px, -50px); }
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

  const SPACETIME_HTML = `<div class="spacetime-bg">
    <div class="star-layer star-layer-1"></div>
    <div class="star-layer star-layer-2"></div>
    <div class="star-layer star-layer-3"></div>
    <div class="comet" id="comet"><div class="comet-body"></div></div>
    <div class="spacetime-grid"></div>
  </div>`;

  // Meteor spawns after 3s delay instead of 1s, with 8s rest between meteors
  const METEOR_JS = `
(function() {
  var comet = document.getElementById('comet');
  if (!comet) return;
  function rand(a,b) { return a + Math.random() * (b - a); }
  var anim = null;
  function spawn() {
    var w = window.innerWidth, h = window.innerHeight;
    var sx, sy, ex, ey;
    var edge = Math.random();
    if (edge < 0.5) {
      sx = rand(0.1, 0.9) * w; sy = -20;
      ex = sx + rand(0.3, 0.7) * w * (Math.random() < 0.5 ? 1 : -1); ey = h + 20;
    } else if (edge < 0.75) {
      sx = -20; sy = rand(0.05, 0.4) * h;
      ex = w + 20; ey = rand(0.5, 0.9) * h;
    } else {
      sx = w + 20; sy = rand(0.05, 0.4) * h;
      ex = -20; ey = rand(0.5, 0.9) * h;
    }
    var dx = ex - sx, dy = ey - sy;
    var angle = Math.atan2(dy, dx) * 180 / Math.PI;
    comet.style.left = sx + 'px';
    comet.style.top = sy + 'px';
    comet.style.transform = 'rotate(' + angle + 'deg)';
    comet.style.opacity = '1';
    comet.style.transition = 'none';
    var dist = Math.sqrt(dx*dx + dy*dy);
    var duration = Math.max(800, Math.min(1800, dist * 0.8));
    var start = null;
    if (anim) cancelAnimationFrame(anim);
    function fly(ts) {
      if (!start) start = ts;
      var p = (ts - start) / duration;
      if (p >= 1) {
        comet.style.opacity = '0';
        setTimeout(spawn, 8000);
        return;
      }
      var ease = 1 - Math.pow(1 - p, 2);
      comet.style.left = (sx + dx * ease) + 'px';
      comet.style.top = (sy + dy * ease) + 'px';
      var op = p < 0.05 ? p / 0.05 : p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      comet.style.opacity = op;
      anim = requestAnimationFrame(fly);
    }
    anim = requestAnimationFrame(fly);
  }
  setTimeout(spawn, 3000);
})();
`;

  return { SPACETIME_CSS, SPACETIME_HTML, METEOR_JS };
}

module.exports = { getSpacetimeBg };
