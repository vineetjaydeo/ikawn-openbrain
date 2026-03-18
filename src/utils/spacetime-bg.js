// Spacetime grid WebGL background — shared between login + chat welcome screen

const SPACETIME_CSS = `
  .spacetime-canvas {
    position: fixed; inset: 0; z-index: 0;
    width: 100vw; height: 100vh;
    pointer-events: none;
  }
`;

const SPACETIME_HTML = '<canvas class="spacetime-canvas" id="spacetime-gl"></canvas>';

const SPACETIME_JS = `
(function initSpacetime() {
  var canvas = document.getElementById('spacetime-gl');
  if (!canvas) return;
  var gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) return;
  gl.getExtension('OES_standard_derivatives');

  function resize() {
    var r = Math.min(window.devicePixelRatio, 1.5);
    canvas.width = canvas.clientWidth * r;
    canvas.height = canvas.clientHeight * r;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  function mkS(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  var vsSrc = 'attribute vec2 a_pos; varying vec2 v_uv; void main() { v_uv = a_pos; gl_Position = vec4(a_pos, 0.0, 1.0); }';

  var fsSrc = [
    '#extension GL_OES_standard_derivatives : enable',
    'precision highp float;',
    'varying vec2 v_uv;',
    'uniform float u_time;',
    'uniform float u_aspect;',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float starField(vec2 uv, float layer) {',
    '  float stars = 0.0;',
    '  vec2 cell = floor(uv); vec2 f = fract(uv);',
    '  for (int y = -1; y <= 1; y++) {',
    '    for (int x = -1; x <= 1; x++) {',
    '      vec2 neighbor = vec2(float(x), float(y));',
    '      vec2 id = cell + neighbor;',
    '      float h = hash(id * layer);',
    '      float h2 = hash(id * layer + vec2(53.3, 97.1));',
    '      float h3 = hash(id * layer + vec2(17.9, 41.3));',
    '      if (h3 > 0.55) continue;',
    '      vec2 pos = neighbor + vec2(h, h2) - f;',
    '      float d = length(pos);',
    '      float size = 0.015 + h3 * 0.015;',
    '      float brightness = smoothstep(size, 0.0, d);',
    '      float twinkle = 0.75 + 0.25 * sin(u_time * 0.3 + h * 25.0);',
    '      stars += brightness * twinkle * (0.2 + h3 * 0.5);',
    '    }',
    '  }',
    '  return stars;',
    '}',
    'void main() {',
    '  vec3 bg = vec3(0.008, 0.008, 0.031);',
    '  vec2 uv = vec2(v_uv.x * u_aspect, v_uv.y);',
    '  float starsAccum = 0.0;',
    '  vec2 s1 = uv * 30.0 + vec2(u_time * 0.012, u_time * 0.006);',
    '  starsAccum += starField(s1, 1.0) * 0.5;',
    '  vec2 s2 = uv * 16.0 + vec2(u_time * 0.005, u_time * 0.003);',
    '  starsAccum += starField(s2, 3.1) * 0.35;',
    '  vec3 col = bg + vec3(0.7, 0.72, 0.85) * starsAccum;',
    '  float camH = 1.8;',
    '  vec3 rd = normalize(vec3(v_uv.x * u_aspect * 1.0, v_uv.y * 1.0 + 0.1, -1.0));',
    '  if (rd.y < -0.001) {',
    '    float t = -camH / rd.y;',
    '    vec2 hit = vec2(rd.x * t, rd.z * t);',
    '    hit.y -= u_time;',
    '    float gs = 3.0;',
    '    vec2 gp = hit / gs;',
    '    vec2 fw = vec2(length(vec2(dFdx(gp.x), dFdy(gp.x))), length(vec2(dFdx(gp.y), dFdy(gp.y))));',
    '    fw = max(fw, vec2(0.0001));',
    '    vec2 grid = abs(fract(gp - 0.5) - 0.5);',
    '    vec2 aa = smoothstep(vec2(0.0), fw * 1.5, grid);',
    '    float line = 1.0 - min(aa.x, aa.y);',
    '    float nearFar = 1.0 / t;',
    '    float fade = smoothstep(0.0, 0.12, nearFar);',
    '    float intensity = line * fade * 0.55;',
    '    vec3 gridCol = vec3(0.35, 0.35, 0.42);',
    '    col = mix(col, gridCol, intensity);',
    '  }',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\\n');

  var prog = gl.createProgram();
  gl.attachShader(prog, mkS(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, mkS(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var uTime = gl.getUniformLocation(prog, 'u_time');
  var uAspect = gl.getUniformLocation(prog, 'u_aspect');

  var time = 0, last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    time += (now - last) * 0.001 * 1.5;
    last = now;
    gl.uniform1f(uTime, time);
    gl.uniform1f(uAspect, canvas.width / canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  requestAnimationFrame(frame);
})();
`;

module.exports = { SPACETIME_CSS, SPACETIME_HTML, SPACETIME_JS };
