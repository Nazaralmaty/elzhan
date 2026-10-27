// Renderer, lights with soft shadows that follow the camera, sky, and an RTS camera rig.
import * as THREE from 'three';

function skyTexture(top, mid, bottom) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(0.55, mid); g.addColorStop(1, bottom);
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createEngine(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure || 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(opts.fog || '#c9d8e2');
  scene.background = skyTexture(opts.skyTop || '#7fa7c9', opts.skyMid || '#b8cfdf', opts.skyBottom || '#dfe6e3');
  scene.fog = new THREE.Fog(fogColor, opts.fogNear || 150, opts.fogFar || 400);

  const camera = new THREE.PerspectiveCamera(opts.fov || 36, 1, 0.5, 1200);
  const hemi = new THREE.HemisphereLight('#dceaff', '#6b5a3c', 1.15);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.7);
  const sunDir = new THREE.Vector3(...(opts.sunDir || [0.3, 0.78, 0.55])).normalize();
  sun.castShadow = true;
  const SH = opts.shadowSize || 2048;
  sun.shadow.mapSize.set(SH, SH);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(hemi, sun, sun.target);

  const rig = { tx: 0, tz: 0, dist: opts.dist || 60, pitch: opts.pitch || 0.9, yaw: opts.yaw || 0, minDist: opts.minDist || 18, maxDist: opts.maxDist || 140, bounds: opts.bounds || null, groundY: () => 0 };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();

  function updateCamera() {
    if (rig.bounds) {
      rig.tx = Math.max(rig.bounds[0], Math.min(rig.bounds[2], rig.tx));
      rig.tz = Math.max(rig.bounds[1], Math.min(rig.bounds[3], rig.tz));
    }
    rig.dist = Math.max(rig.minDist, Math.min(rig.maxDist, rig.dist));
    const gy = rig.groundY(rig.tx, rig.tz);
    const cp = Math.cos(rig.pitch), sp = Math.sin(rig.pitch);
    camera.position.set(rig.tx + Math.sin(rig.yaw) * cp * rig.dist, gy + sp * rig.dist, rig.tz + Math.cos(rig.yaw) * cp * rig.dist);
    camera.lookAt(rig.tx, gy, rig.tz);
    // shadow box sized to what the camera sees, snapped to texels to avoid shimmering
    const half = Math.max(30, rig.dist * 0.95);
    const sc = sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = half * 4 + 200;
    sc.updateProjectionMatrix();
    const texel = (half * 2) / SH;
    const tx = Math.round(rig.tx / texel) * texel, tz = Math.round(rig.tz / texel) * texel;
    sun.target.position.set(tx, gy, tz);
    sun.position.set(tx + sunDir.x * (half * 2 + 60), gy + sunDir.y * (half * 2 + 60), tz + sunDir.z * (half * 2 + 60));
  }

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth, h = canvas.clientHeight || canvas.parentElement.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // screen point -> ground point (against a mesh if given, else the plane y = 0)
  function pick(clientX, clientY, mesh) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (mesh) { const h = ray.intersectObject(mesh, false)[0]; if (h) return h.point.clone(); }
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }

  // world -> CSS pixels relative to the canvas
  const pv = new THREE.Vector3();
  function project(x, y, z) {
    pv.set(x, y, z).project(camera);
    return { x: (pv.x + 1) / 2 * canvas.clientWidth, y: (1 - pv.y) / 2 * canvas.clientHeight, behind: pv.z > 1 };
  }

  function render() { renderer.render(scene, camera); }

  resize();
  updateCamera();
  return { renderer, scene, camera, sun, hemi, rig, updateCamera, resize, pick, project, render, fogColor };
}
