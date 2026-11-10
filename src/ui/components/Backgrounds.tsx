import { useEffect, useRef } from 'react';

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
