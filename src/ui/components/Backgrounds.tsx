import { useEffect, useRef } from 'react';

/** Rising embers over a smouldering underworld glow. */
export function EmberBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    type P = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; hue: number };
    const ps: P[] = [];
    const spawn = (): P => ({
      x: Math.random() * w,
      y: h + 10,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -(0.4 + Math.random() * 1.1),
      r: 0.6 + Math.random() * 2.2,
      life: 0,
      max: 300 + Math.random() * 400,
      hue: 10 + Math.random() * 35,
    });
    for (let i = 0; i < 90; i++) {
      const p = spawn();
      p.y = Math.random() * h;
      p.life = Math.random() * p.max;
      ps.push(p);
    }
    let raf = 0;
    let t = 0;
    const frame = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.life += 1;
        p.x += p.vx + Math.sin((p.y + t) * 0.01 + i) * 0.25;
        p.y += p.vy;
        const k = 1 - p.life / p.max;
        if (k <= 0 || p.y < -20) {
          ps[i] = spawn();
          continue;
        }
        const flicker = 0.6 + 0.4 * Math.sin(t * 0.2 + i * 3);
        const a = Math.max(0, k * flicker);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, `hsla(${p.hue + 20}, 100%, 75%, ${a})`);
        g.addColorStop(0.4, `hsla(${p.hue}, 100%, 55%, ${a * 0.5})`);
        g.addColorStop(1, `hsla(${p.hue}, 100%, 40%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return (
    <div className="bg bg-underworld">
      <div className="bg-smoke" />
      <canvas ref={ref} className="bg-canvas" />
      <div className="bg-vignette" />
    </div>
  );
}

const SWIRL_FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float t = uTime * 0.12;
  float r = length(uv);
  float a = atan(uv.y, uv.x) + 2.2 * r - t * 1.3;
  vec2 p = vec2(cos(a), sin(a)) * r * 3.2;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    p += vec2(sin(p.y * 1.25 + t * 2.0 + fi), cos(p.x * 1.15 - t * 1.6 + fi * 1.7)) * 0.42;
  }
  float v = sin(p.x + p.y) * 0.5 + 0.5;
  float w = sin(length(p) * 1.6 - t * 3.0) * 0.5 + 0.5;
  vec3 red = vec3(0.80, 0.20, 0.24);
  vec3 blue = vec3(0.09, 0.40, 0.62);
  vec3 dark = vec3(0.06, 0.08, 0.15);
  vec3 col = mix(dark, mix(red, blue, v), smoothstep(0.2, 0.9, w));
  col = floor(col * 7.0) / 7.0;
  gl_FragColor = vec4(col * 0.75, 1.0);
}`;

/** Pixelated, posterised paint swirl rendered with a tiny WebGL shader. */
export function SwirlBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext('webgl', { antialias: false });
    if (!gl) return;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, 'attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }');
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, SWIRL_FRAG);
    gl.compileShader(fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const PIXEL = 5;
    const resize = () => {
      canvas.width = Math.ceil(canvas.clientWidth / PIXEL);
      canvas.height = Math.ceil(canvas.clientHeight / PIXEL);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);
    const start = performance.now();
    let raf = 0;
    const frame = () => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return (
    <div className="bg bg-arcade">
      <canvas ref={ref} className="bg-canvas pixelated" />
      <div className="bg-crt" />
      <div className="bg-vignette" />
    </div>
  );
}
