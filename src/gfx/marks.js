// Square highlights and the slabs the board is built from.

import * as THREE from 'three';

export const MARK_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uMode, uTime, uAlpha;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float d = length(p), box = max(abs(p.x), abs(p.y)), a = 0.0;
  if (uMode < 1.5) a = 0.3 + 0.6 * smoothstep(0.4, 0.485, box);                                  // filled square
  else if (uMode < 2.5) a = smoothstep(0.17, 0.13, d) * (0.7 + 0.3 * sin(uTime * 4.0));           // dot: can move here
  else if (uMode < 3.5) a = smoothstep(0.36, 0.39, d) * smoothstep(0.48, 0.45, d) * (0.75 + 0.25 * sin(uTime * 5.0)); // ring: can capture
  else if (uMode < 4.5) a = (1.0 - smoothstep(0.05, 0.5, d)) * (0.65 + 0.35 * sin(uTime * 7.0)); // soft glow
  else a = smoothstep(0.42, 0.47, box) * 0.7;                                                     // hover outline
  gl_FragColor = vec4(uColor * 1.5, a * uAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export const MARK_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// A bevelled slab `size` wide and `depth` deep whose top face sits at `topY`.
export function slab(size, height, radius, bevel, topY, depth = size) {
  const g = new THREE.ExtrudeGeometry(roundedRect(size - 2 * bevel, depth - 2 * bevel, radius), {
    depth: height - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, topY - (height - bevel), 0);
  return g;
}
