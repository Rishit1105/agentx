"use client";
import { useEffect, useRef } from "react";
import type { MotionValue } from "motion/react";
import * as THREE from "three";

/**
 * The Conductor and its sixteen agents, in plain three.js, drawn for a paper background.
 * A pearl-glass orb with a fine ink ring, three hairline orbits carrying 11 violet skills and 5 teal
 * services, threads that pulse from working agents to the core, a little grey dust and mouse parallax.
 * Everything uses normal (not additive) blending, so it reads as ink on paper rather than light on black.
 * `progress` (0..1) dollies the camera into the orb as the hero scrolls away.
 */

const TEAL = new THREE.Color("#0a7ea4");
const VIOLET = new THREE.Color("#6e56cf");
const INK = new THREE.Color("#14181f");
const PEARL = new THREE.Color("#fdfdfb");
const PEARL_EDGE = new THREE.Color("#c3ccd3");
const ORBIT = new THREE.Color("#8a909a");
const DUST = new THREE.Color("#9aa0a8");

const ORB_VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;
  void main() {
    vec3 p = position;
    float n = sin(p.x * 3.1 + uTime * 0.9) * sin(p.y * 2.7 - uTime * 0.7) * sin(p.z * 2.9 + uTime * 0.5);
    p += normal * n * 0.025;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vPos = position;
    gl_Position = projectionMatrix * mv;
  }
`;

const ORB_FRAG = /* glsl */ `
  uniform vec3 uPearl;
  uniform vec3 uEdge;
  uniform vec3 uInk;
  uniform vec3 uTeal;
  uniform vec3 uViolet;
  uniform float uTime;
  uniform float uBoost;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;
  void main() {
    vec3 n = normalize(vNormal);
    float facing = max(dot(n, normalize(vView)), 0.0);
    float fres = pow(1.0 - facing, 2.0);
    // pearl body: near-white at the centre, a cool grey toward the limb
    vec3 col = mix(uPearl, uEdge, fres);
    // a faint teal-to-violet sheen that drifts around the limb
    float drift = 0.5 + 0.5 * sin(vPos.y * 2.2 + vPos.x * 1.3 + uTime * 0.35);
    col = mix(col, mix(uTeal, uViolet, drift), fres * 0.28);
    // faint latitude lines: the "meridians" of the instrument, in ink
    float lat = smoothstep(0.988, 1.0, abs(sin(vPos.y * 9.0 + uTime * 0.25)));
    col = mix(col, uInk, lat * 0.16 * facing);
    // a soft key light from the upper left
    float spec = pow(max(dot(n, normalize(vec3(-0.45, 0.6, 0.66))), 0.0), 28.0);
    col = mix(col, vec3(1.0), spec * 0.85);
    // the fine ink outline at the silhouette
    float edge = smoothstep(0.86, 0.985, 1.0 - facing);
    col = mix(col, uInk, edge * 0.8);
    float a = clamp(0.42 + fres * 0.42 + edge * 0.4 + spec * 0.2 - uBoost * 0.25, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

function dotTexture(soft: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(soft, "rgba(255,255,255,0.35)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Node = {
  mesh: THREE.Mesh;
  halo: THREE.Sprite;
  line: THREE.Line;
  lineMat: THREE.LineBasicMaterial;
  pulse: THREE.Sprite;
  color: THREE.Color;
  act: number;
  until: number;
  phase: number;
};

export default function HeroScene({ progress, onReady }: { progress: MotionValue<number>; onReady?: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);

  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lite = window.matchMedia("(max-width: 767px)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return; // no WebGL: the CSS fallback orb stays visible
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
    const root = new THREE.Group();
    scene.add(root);
    const glow = dotTexture(0.25);
    const dot = dotTexture(0.5);

    /* ── the Conductor ─────────────────────────────────────────── */
    const orbUniforms = {
      uTime: { value: 0 },
      uPearl: { value: PEARL.clone() },
      uEdge: { value: PEARL_EDGE.clone() },
      uInk: { value: INK.clone() },
      uTeal: { value: TEAL.clone() },
      uViolet: { value: VIOLET.clone() },
      uBoost: { value: 0 },
    };
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(1, lite ? 48 : 96, lite ? 48 : 96),
      new THREE.ShaderMaterial({
        uniforms: orbUniforms,
        vertexShader: ORB_VERT,
        fragmentShader: ORB_FRAG,
        transparent: true,
        depthWrite: false,
      }),
    );
    orb.renderOrder = 2;
    root.add(orb);

    // the teal core, seen through the pearl
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 24, 24),
      new THREE.MeshBasicMaterial({ color: TEAL }),
    );
    core.renderOrder = 1;
    root.add(core);
    const coreHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow, color: TEAL, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    coreHalo.scale.setScalar(0.9);
    coreHalo.renderOrder = 1;
    root.add(coreHalo);

    // two fine ink meridians around the glass
    const meridianMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.5 });
    const meridianA = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.004, 6, 200), meridianMat);
    const meridianB = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.004, 6, 200), meridianMat);
    meridianA.rotation.y = Math.PI / 2;
    meridianB.rotation.x = Math.PI / 2;
    const meridians = new THREE.Group();
    meridians.add(meridianA, meridianB);
    meridians.rotation.z = 0.32;
    root.add(meridians);

    /* ── orbits and the sixteen agents ─────────────────────────── */
    const RINGS = [
      { r: 1.95, tiltX: 1.18, tiltZ: 0.28, speed: 0.16, color: TEAL, count: 5 },
      { r: 2.75, tiltX: 1.32, tiltZ: -0.34, speed: -0.09, color: VIOLET, count: 6 },
      { r: 3.45, tiltX: 1.05, tiltZ: 0.52, speed: 0.06, color: VIOLET, count: 5 },
    ];
    const spinners: { group: THREE.Group; speed: number }[] = [];
    const nodes: Node[] = [];
    const nodeGeo = new THREE.SphereGeometry(0.065, 16, 16);

    for (const ring of RINGS) {
      const tilt = new THREE.Group();
      tilt.rotation.set(ring.tiltX, 0, ring.tiltZ);
      root.add(tilt);

      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 200; i++) {
        const a = (i / 200) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * ring.r, 0, Math.sin(a) * ring.r));
      }
      const orbit = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: ORBIT, transparent: true, opacity: 0.32 }),
      );
      tilt.add(orbit);

      const spin = new THREE.Group();
      tilt.add(spin);
      spinners.push({ group: spin, speed: ring.speed });

      for (let k = 0; k < ring.count; k++) {
        const a = (k / ring.count) * Math.PI * 2 + ring.r;
        const mesh = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color: ring.color }));
        mesh.position.set(Math.cos(a) * ring.r, 0, Math.sin(a) * ring.r);
        spin.add(mesh);

        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glow, color: ring.color, transparent: true, opacity: 0.1, depthWrite: false }),
        );
        halo.scale.setScalar(0.36);
        mesh.add(halo);

        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
        const lineMat = new THREE.LineBasicMaterial({ color: ring.color, transparent: true, opacity: 0, depthWrite: false });
        const line = new THREE.Line(lineGeo, lineMat);
        line.frustumCulled = false;
        scene.add(line);

        const pulse = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: dot, color: ring.color, transparent: true, opacity: 0, depthWrite: false }),
        );
        pulse.scale.setScalar(0.13);
        scene.add(pulse);

        nodes.push({ mesh, halo, line, lineMat, pulse, color: ring.color, act: 0, until: 0, phase: Math.random() });
      }
    }

    /* ── a little grey dust ─────────────────────────────────────── */
    const STARS = lite ? 60 : 160;
    const starPos = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      const r = 5 + Math.random() * 14;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      starPos[i * 3 + 2] = r * Math.cos(ph);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 0.05, map: dot, color: DUST, transparent: true, opacity: 0.45, depthWrite: false, sizeAttenuation: true }),
    );
    scene.add(stars);

    /* ── sizing ─────────────────────────────────────────────────── */
    let W = 1, H = 1, baseZ = 10, shiftX = 0, shiftY = 0;
    const resize = () => {
      W = Math.max(1, host.clientWidth);
      H = Math.max(1, host.clientHeight);
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      const desktop = W >= 1024;
      baseZ = camera.aspect < 0.75 ? 15.5 : camera.aspect < 1.2 ? 12.5 : 10.4;
      camera.updateProjectionMatrix();
      const visH = 2 * baseZ * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const visW = visH * camera.aspect;
      // desktop: the instrument sits to the right of the headline; phones: above it
      shiftX = desktop ? visW * 0.2 : 0;
      shiftY = desktop ? 0 : visH * 0.27;
      if (reduced) frame(0);
    };

    /* ── interaction & lifecycle ───────────────────────────────── */
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointer = (e: PointerEvent) => {
      mouse.tx = e.clientX / window.innerWidth - 0.5;
      mouse.ty = e.clientY / window.innerHeight - 0.5;
    };
    if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });

    const tmp = new THREE.Vector3();
    let t = 0;
    let last = performance.now();
    let nextPick = 0;
    let raf = 0;
    let inView = true;
    let first = true;

    const frame = (dt: number) => {
      t += dt;
      const p = Math.min(1, Math.max(0, progress.get()));
      const e = p * p * (3 - 2 * p);

      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;

      root.position.set(shiftX * (1 - e), shiftY * (1 - e), 0);
      camera.position.set(mouse.x * 1.1 * (1 - e), -mouse.y * 0.8 * (1 - e), baseZ - (baseZ - 1.35) * e);
      camera.lookAt(0, 0, 0);

      orbUniforms.uTime.value = t;
      orbUniforms.uBoost.value = e * 0.8;
      meridians.rotation.y = t * 0.12;
      core.scale.setScalar(1 + Math.sin(t * 1.6) * 0.06);
      root.rotation.y = mouse.x * 0.25;
      root.rotation.x = mouse.y * 0.12;
      stars.rotation.y = t * 0.008;
      for (const s of spinners) s.group.rotation.y = t * s.speed;

      // choose a few working agents
      if (t > nextPick) {
        const n = nodes[Math.floor(Math.random() * nodes.length)];
        n.until = t + 1.4 + Math.random() * 1.6;
        nextPick = t + 0.55 + Math.random() * 0.7;
      }

      root.updateMatrixWorld();
      const cx = root.position.x, cy = root.position.y;
      for (const n of nodes) {
        const target = t < n.until ? 1 : 0;
        n.act += (target - n.act) * Math.min(1, dt * 4);
        n.mesh.getWorldPosition(tmp);
        const arr = (n.line.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
        // thread from the agent to the surface of the orb
        const dx = tmp.x - cx, dy = tmp.y - cy, dz = tmp.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        arr[0] = tmp.x; arr[1] = tmp.y; arr[2] = tmp.z;
        arr[3] = cx + (dx / len) * 1.02; arr[4] = cy + (dy / len) * 1.02; arr[5] = (dz / len) * 1.02;
        n.line.geometry.getAttribute("position").needsUpdate = true;
        n.lineMat.opacity = n.act * 0.75;

        n.phase = (n.phase + dt * 0.9) % 1;
        const k = n.phase;
        n.pulse.position.set(tmp.x + (arr[3] - tmp.x) * k, tmp.y + (arr[4] - tmp.y) * k, tmp.z + (arr[5] - tmp.z) * k);
        (n.pulse.material as THREE.SpriteMaterial).opacity = n.act * Math.sin(k * Math.PI);
        n.mesh.scale.setScalar(1 + n.act * 0.5);
        (n.halo.material as THREE.SpriteMaterial).opacity = 0.06 + n.act * 0.16;
      }
      const busy = nodes.reduce((s, n) => s + n.act, 0) / nodes.length;
      (coreHalo.material as THREE.SpriteMaterial).opacity = 0.1 + busy * 0.2;

      renderer.render(scene, camera);
      if (first) {
        first = false;
        readyRef.current?.();
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frame(dt);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (raf || reduced || !inView || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    if (reduced) {
      // a still, considered frame: a few agents at work
      nodes.forEach((n, i) => { if (i % 4 === 0) { n.until = 1e9; n.act = 1; } });
      frame(0);
    }

    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) start(); else stop();
    });
    io.observe(host);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    // re-render a still frame on scroll for reduced motion so the dolly still tracks the page
    const unsub = reduced ? progress.on("change", () => frame(0)) : () => {};
    start();

    return () => {
      stop();
      unsub();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onPointer);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      glow.dispose();
      dot.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [progress]);

  return <div ref={hostRef} aria-hidden className="lp-hero-canvas absolute inset-0" />;
}
