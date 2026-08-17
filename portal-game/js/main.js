import * as THREE from "three";
import { LEVELS } from "./levels.js";
import { Player } from "./player.js";
import { PortalPair, firePortalRay } from "./portals.js";
import { TouchControls, prefersTouchControls } from "./touch.js";

const canvasHost = document.body;
const overlay = document.getElementById("overlay");
const completeScreen = document.getElementById("complete");
const winScreen = document.getElementById("win");
const startBtn = document.getElementById("start-btn");
const nextBtn = document.getElementById("next-btn");
const replayBtn = document.getElementById("replay-btn");
const chamberLabel = document.getElementById("chamber-label");
const hintEl = document.getElementById("hint");
const pipBlue = document.getElementById("pip-blue");
const pipOrange = document.getElementById("pip-orange");
const completeTitle = document.getElementById("complete-title");
const completeBody = document.getElementById("complete-body");

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0xb8c4d0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasHost.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb0bcc8, 40, 90);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 120);
const player = new Player(camera, scene);
const portals = new PortalPair(scene, renderer, camera);

let levelIndex = 0;
let solidBoxes = [];
let colliderMeta = [];
let levelRoot = null;
let cubes = [];
let buttons = [];
let doors = [];
let exitMesh = null;
let doorOpen = new Set();
let clock = new THREE.Clock();
let hintTimer = 0;
let completed = false;
let pointerLocked = false;
const useTouch = prefersTouchControls();
if (useTouch) document.body.classList.add("prefer-touch");
if (useTouch) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

const ambient = new THREE.AmbientLight(0xc5d0dc, 1.1);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(8, 18, 6);
scene.add(sun);
const hemi = new THREE.HemisphereLight(0xb8c8d8, 0x3a4048, 0.65);
scene.add(hemi);
const fill = new THREE.PointLight(0x4aa8ff, 0.55, 50);
fill.position.set(-6, 6, 4);
scene.add(fill);
const fill2 = new THREE.PointLight(0xff7a29, 0.45, 50);
fill2.position.set(6, 5, -4);
scene.add(fill2);

function showHint(text, seconds = 5) {
  hintEl.textContent = text;
  hintEl.classList.add("show");
  hintTimer = seconds;
}

function clearLevel() {
  portals.clear();
  updatePips();
  if (levelRoot) {
    scene.remove(levelRoot);
    levelRoot.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
  levelRoot = new THREE.Group();
  scene.add(levelRoot);
  solidBoxes = [];
  colliderMeta = [];
  cubes = [];
  buttons = [];
  doors = [];
  exitMesh = null;
  doorOpen = new Set();
  player.held = null;
  completed = false;
}

function addWall(def) {
  const geo = new THREE.BoxGeometry(def.size[0], def.size[1], def.size[2]);
  const mat = new THREE.MeshLambertMaterial({
    color: def.color ?? 0x8a96a2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...def.pos);
  mesh.receiveShadow = true;
  levelRoot.add(mesh);

  // panel lines for portalable surfaces
  if (def.portalable) {
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x5a6a7a, transparent: true, opacity: 0.35 })
    );
    line.position.copy(mesh.position);
    levelRoot.add(line);
  } else {
    // hazard stripe cue for non-portalable
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(def.size[0] * 0.98, 0.08, def.size[2] * 0.98),
      new THREE.MeshBasicMaterial({ color: 0xc45c1a })
    );
    stripe.position.set(def.pos[0], def.pos[1] - def.size[1] / 2 + 0.2, def.pos[2]);
    if (def.size[1] < 2) stripe.position.y = def.pos[1] + def.size[1] / 2 + 0.02;
    levelRoot.add(stripe);
  }

  const half = new THREE.Vector3(def.size[0] / 2, def.size[1] / 2, def.size[2] / 2);
  const box = new THREE.Box3(
    mesh.position.clone().sub(half),
    mesh.position.clone().add(half)
  );
  solidBoxes.push(box);
  colliderMeta.push({ box, mesh, portalable: !!def.portalable, kind: "wall" });
  return mesh;
}

function loadLevel(index) {
  clearLevel();
  levelIndex = index;
  const level = LEVELS[index];
  chamberLabel.textContent = level.name;

  for (const w of level.walls) addWall(w);

  for (const c of level.cubes || []) {
    const size = c.size ?? 1.1;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshLambertMaterial({
      color: 0xd4c4a8,
      emissive: 0x3a3020,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...c.pos);
    levelRoot.add(mesh);
    // heart decal
    const heart = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 0.35, size * 0.35),
      new THREE.MeshBasicMaterial({ color: 0xb83232, side: THREE.DoubleSide })
    );
    heart.position.set(0, 0, size / 2 + 0.01);
    mesh.add(heart);
    const cube = {
      mesh,
      size,
      velocity: new THREE.Vector3(),
      held: false,
    };
    cubes.push(cube);
  }

  for (const b of level.buttons || []) {
    const geo = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
    const mat = new THREE.MeshLambertMaterial({
      color: 0x888890,
      emissive: 0x222222,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...b.pos);
    levelRoot.add(mesh);
    buttons.push({ mesh, opens: b.opens, pressed: false, baseY: b.pos[1], size: b.size });
  }

  for (const d of level.doors || []) {
    const geo = new THREE.BoxGeometry(d.size[0], d.size[1], d.size[2]);
    const mat = new THREE.MeshLambertMaterial({
      color: 0x6a7380,
      emissive: 0x1a2028,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...d.pos);
    levelRoot.add(mesh);
    const half = new THREE.Vector3(d.size[0] / 2, d.size[1] / 2, d.size[2] / 2);
    const box = new THREE.Box3().setFromCenterAndSize(mesh.position.clone(), new THREE.Vector3(...d.size));
    doors.push({
      id: d.id,
      mesh,
      box,
      closedPos: mesh.position.clone(),
      openPos: mesh.position.clone().add(new THREE.Vector3(...d.openOffset)),
      size: d.size,
      open: false,
      t: 0,
    });
    solidBoxes.push(box);
    colliderMeta.push({ box, mesh, portalable: false, kind: "door", doorId: d.id });
  }

  // exit elevator pad
  const eg = new THREE.BoxGeometry(...level.exit.size);
  const em = new THREE.MeshLambertMaterial({
    color: 0xc8f542,
    emissive: 0x6a8a20,
  });
  exitMesh = new THREE.Mesh(eg, em);
  exitMesh.position.set(...level.exit.pos);
  levelRoot.add(exitMesh);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.25, 32),
    new THREE.MeshBasicMaterial({ color: 0xc8f542, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(level.exit.pos[0], level.exit.pos[1] - level.exit.size[1] / 2 + 0.02, level.exit.pos[2]);
  levelRoot.add(ring);

  player.setPose(level.spawn[0], level.spawn[1], level.spawn[2], level.yaw ?? 0);
  showHint(level.hint, 6);
}

function collidersForPhysics() {
  // rebuild door boxes from current mesh positions
  const boxes = [];
  for (const meta of colliderMeta) {
    if (meta.kind === "door") {
      const door = doors.find((d) => d.id === meta.doorId);
      if (door && door.open && door.t > 0.85) continue; // fully open — no collision
      meta.box.setFromCenterAndSize(meta.mesh.position, new THREE.Vector3(...door.size));
    }
    boxes.push(meta.box);
  }
  // cube colliders when not held
  for (const c of cubes) {
    if (c.held) continue;
    const half = c.size / 2;
    boxes.push(
      new THREE.Box3(
        c.mesh.position.clone().subScalar(half),
        c.mesh.position.clone().addScalar(half)
      )
    );
  }
  return boxes;
}

function updatePips() {
  pipBlue.classList.toggle("on", !!portals.blue);
  pipOrange.classList.toggle("on", !!portals.orange);
}

function placePortal(color) {
  const hit = firePortalRay(camera, colliderMeta);
  if (!hit) return;
  const meta = colliderMeta.find((c) => c.mesh === hit.object);
  if (!meta || !meta.portalable) {
    showHint("Can't place a portal there.", 1.5);
    return;
  }
  portals.place(color, hit.point, hit.face.normal.clone().transformDirection(hit.object.matrixWorld), meta.box);
  updatePips();
}

function tryGrabOrDrop() {
  if (player.held) {
    player.held.held = false;
    player.held.velocity.copy(player.velocity).multiplyScalar(0.5);
    player.held.velocity.y += 2;
    player.held = null;
    return;
  }
  // find nearest cube in front
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  let best = null;
  let bestScore = Infinity;
  for (const c of cubes) {
    const to = c.mesh.position.clone().sub(player.position);
    const dist = to.length();
    if (dist > 3.2) continue;
    const align = forward.dot(to.normalize());
    if (align < 0.35) continue;
    const score = dist - align;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (best) {
    best.held = true;
    player.held = best;
  }
}

function updateCubes(dt, boxes) {
  for (const c of cubes) {
    if (c.held) {
      const hold = new THREE.Vector3(0, -0.15, -2.1).applyQuaternion(camera.quaternion);
      c.mesh.position.copy(player.position).add(hold);
      c.velocity.set(0, 0, 0);
      continue;
    }
    c.velocity.y -= 28 * dt;
    // simple axis separation vs walls
    for (const axis of ["x", "z", "y"]) {
      const delta = c.velocity[axis] * dt;
      if (!delta) continue;
      c.mesh.position[axis] += delta;
      const half = c.size / 2;
      const cubeBox = new THREE.Box3(
        c.mesh.position.clone().subScalar(half),
        c.mesh.position.clone().addScalar(half)
      );
      for (const box of boxes) {
        // skip self-sized dynamic — boxes includes other cubes already
        if (!cubeBox.intersectsBox(box)) continue;
        // ignore if box is essentially this cube (rough)
        const center = box.getCenter(new THREE.Vector3());
        if (center.distanceTo(c.mesh.position) < 0.05) continue;
        if (axis === "y") {
          if (delta < 0) {
            c.mesh.position.y = box.max.y + half + 0.001;
            c.velocity.y = 0;
          } else {
            c.mesh.position.y = box.min.y - half - 0.001;
            c.velocity.y = 0;
          }
        } else {
          if (delta > 0) c.mesh.position[axis] = box.min[axis] - half - 0.001;
          else c.mesh.position[axis] = box.max[axis] + half + 0.001;
          c.velocity[axis] = 0;
        }
        cubeBox.set(
          c.mesh.position.clone().subScalar(half),
          c.mesh.position.clone().addScalar(half)
        );
      }
    }
    // friction on ground-ish
    c.velocity.x *= 0.9;
    c.velocity.z *= 0.9;

    // portal travel for cubes
    if (portals.bothReady()) {
      const fake = {
        position: c.mesh.position,
        velocity: c.velocity,
        camera: { quaternion: new THREE.Quaternion() },
        yaw: 0,
        pitch: 0,
        onGround: false,
      };
      // reuse near check
      for (const [entry, exit] of [
        [portals.blue, portals.orange],
        [portals.orange, portals.blue],
      ]) {
        if (portals._nearPortal(c.mesh.position, entry)) {
          portals._teleport(fake, entry, exit);
          break;
        }
      }
    }
  }
}

function updateButtonsAndDoors(dt) {
  for (const b of buttons) {
    let pressed = false;
    // player standing on button
    const feet = player.feetY();
    if (
      Math.abs(player.position.x - b.mesh.position.x) < b.size[0] / 2 + 0.3 &&
      Math.abs(player.position.z - b.mesh.position.z) < b.size[2] / 2 + 0.3 &&
      feet < b.mesh.position.y + 0.35 &&
      feet > b.mesh.position.y - 0.2
    ) {
      pressed = true;
    }
    for (const c of cubes) {
      if (
        Math.abs(c.mesh.position.x - b.mesh.position.x) < b.size[0] / 2 + c.size / 2 &&
        Math.abs(c.mesh.position.z - b.mesh.position.z) < b.size[2] / 2 + c.size / 2 &&
        c.mesh.position.y - c.size / 2 < b.mesh.position.y + 0.4
      ) {
        pressed = true;
      }
    }
    b.pressed = pressed;
    b.mesh.material.emissive.setHex(pressed ? 0x2a6a20 : 0x222222);
    b.mesh.material.color.setHex(pressed ? 0x6adf4a : 0x888890);
    b.mesh.position.y = b.baseY - (pressed ? 0.05 : 0);

    if (pressed) doorOpen.add(b.opens);
    else doorOpen.delete(b.opens);
  }

  for (const d of doors) {
    const want = doorOpen.has(d.id);
    d.open = want;
    d.t = THREE.MathUtils.clamp(d.t + (want ? dt * 1.8 : -dt * 1.8), 0, 1);
    d.mesh.position.lerpVectors(d.closedPos, d.openPos, d.t);
  }
}

function checkExit() {
  if (!exitMesh || completed) return;
  // for chamber 03, require button pressed (cube in room)
  const level = LEVELS[levelIndex];
  if (level.buttons?.length) {
    const allPressed = level.buttons.every((b) =>
      buttons.find((x) => x.opens === b.opens)?.pressed
    );
    if (!allPressed) return;
  }
  const dist = player.position.distanceTo(exitMesh.position);
  if (dist < 1.4) {
    completed = true;
    setPlaying(false);
    document.exitPointerLock?.();
    if (levelIndex >= LEVELS.length - 1) {
      winScreen.classList.remove("hidden");
    } else {
      completeTitle.textContent = `${level.name} cleared`;
      completeBody.textContent =
        levelIndex === 0
          ? "You've got the hang of linked space. Keep going."
          : "The enrichment center congratulates you (sincerely, probably).";
      completeScreen.classList.remove("hidden");
    }
  }
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function lockPointer() {
  renderer.domElement.requestPointerLock?.();
}

function playEnabled() {
  return (
    !completed &&
    overlay.classList.contains("hidden") &&
    completeScreen.classList.contains("hidden") &&
    winScreen.classList.contains("hidden")
  );
}

function setPlaying(on) {
  player.enabled = on && playEnabled();
  if (on && useTouch && playEnabled()) touch.show();
  else touch.hide();
}

function beginChamber(index) {
  overlay.classList.add("hidden");
  completeScreen.classList.add("hidden");
  winScreen.classList.add("hidden");
  loadLevel(index);
  setPlaying(true);
  if (!useTouch) lockPointer();
}

const touch = new TouchControls({
  player,
  onBlue: () => {
    if (player.enabled) placePortal("blue");
  },
  onOrange: () => {
    if (player.enabled) placePortal("orange");
  },
  onGrab: () => {
    if (player.enabled) tryGrabOrDrop();
  },
  onJump: () => {},
  onReset: () => {
    if (!playEnabled()) return;
    loadLevel(levelIndex);
    setPlaying(true);
  },
});

startBtn.addEventListener("click", () => beginChamber(0));
nextBtn.addEventListener("click", () => beginChamber(levelIndex + 1));
replayBtn.addEventListener("click", () => beginChamber(0));

document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (useTouch) return;
  player.enabled = pointerLocked && playEnabled();
});

document.addEventListener("mousemove", (e) => {
  if (!pointerLocked || useTouch) return;
  player.look(e.movementX, e.movementY);
});

renderer.domElement.addEventListener("click", () => {
  if (useTouch) return;
  if (playEnabled() && !pointerLocked) lockPointer();
});

renderer.domElement.addEventListener("mousedown", (e) => {
  if (useTouch || !player.enabled) return;
  if (e.button === 0) placePortal("blue");
  if (e.button === 2) placePortal("orange");
});

renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyE" && player.enabled) tryGrabOrDrop();
  if (e.code === "KeyR" && playEnabled()) {
    loadLevel(levelIndex);
    setPlaying(true);
  }
});

window.addEventListener("resize", onResize);
window.visualViewport?.addEventListener("resize", onResize);

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (hintTimer > 0) {
    hintTimer -= dt;
    if (hintTimer <= 0) hintEl.classList.remove("show");
  }

  if (player.enabled) {
    const boxes = collidersForPhysics();
    // exclude held cube / dynamic from player collision — already handled
    player.update(dt, boxes, (p) => portals.tryTravel(p));
    updateCubes(dt, boxes.filter((b) => true));
    updateButtonsAndDoors(dt);
    checkExit();

    // out of bounds reset
    const level = LEVELS[levelIndex];
    const b = level.bounds;
    if (
      player.position.y < b.min[1] - 5 ||
      player.position.x < b.min[0] - 2 ||
      player.position.x > b.max[0] + 2
    ) {
      loadLevel(levelIndex);
      setPlaying(true);
    }
  }

  portals.renderViews();
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
}

// Warm first frame
loadLevel(0);
player.enabled = false;
tick();
