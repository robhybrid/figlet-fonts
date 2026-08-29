import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const canvas = document.getElementById("game");
const overlay = document.getElementById("overlay");
const enterBtn = document.getElementById("enter-btn");
const hud = document.getElementById("hud");
const statusEl = document.getElementById("status");
const thoughtsEl = document.getElementById("thoughts");
const mobileControls = document.getElementById("mobile-controls");
const joystickZone = document.getElementById("joystick-zone");
const joystickStick = document.getElementById("joystick-stick");
const lookZone = document.getElementById("look-zone");
const sprintBtn = document.getElementById("sprint-btn");
const interactBtn = document.getElementById("interact-btn");

const JOYSTICK_RADIUS = 52;
const LOOK_SENSITIVITY = 0.004;
const PI_2 = Math.PI / 2;
const PICKUP_RANGE = 2.8;
const CRATE_HOLD_OFFSET = new THREE.Vector3(0.35, -0.28, -0.72);

function shouldUseTouchControls() {
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const noHover = window.matchMedia("(hover: none)").matches;
  const narrowScreen = window.matchMedia("(max-width: 900px)").matches;
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return coarsePointer || noHover || isIOS || (hasTouch && narrowScreen);
}

let useTouchControls = shouldUseTouchControls();

function syncTouchMode() {
  useTouchControls = shouldUseTouchControls();
  document.body.classList.toggle("touch-controls", useTouchControls);
}

syncTouchMode();
window.addEventListener("resize", syncTouchMode);

const BOX = { width: 12, depth: 12, height: 5 };
const PLAYER = { height: 1.65, radius: 0.35, speed: 3.2, sprint: 5.4 };
const WALL_MARGIN = 0.08;

const inscriptions = [
  { pos: [-BOX.width / 2 + 0.02, 2.2, -2], rot: [0, Math.PI / 2, 0], text: "Four walls.\nOne ceiling.\nOne floor." },
  { pos: [3, 2.4, -BOX.depth / 2 + 0.02], rot: [0, 0, 0], text: "Have you tried\nthe corners?" },
  { pos: [BOX.width / 2 - 0.02, 1.8, 2.5], rot: [0, -Math.PI / 2, 0], text: "There is no door.\nThere never was." },
  { pos: [-2.5, 2.6, BOX.depth / 2 - 0.02], rot: [0, Math.PI, 0], text: "You're not lost.\nYou're contained." },
  { pos: [0, BOX.height - 0.15, 0], rot: [-Math.PI / 2, 0, 0], text: "Look up.\nStill a box." },
];

const ambientThoughts = [
  "The air is still.",
  "Cardboard dreams.",
  "Six surfaces. Zero exits.",
  "This is the whole world.",
  "Footsteps echo softly.",
];

const keys = new Set();
let thoughtTimer = 0;
let inscriptionCooldown = 0;
let bobPhase = 0;
let playing = false;
let mobileSprint = false;
let holdingCrate = false;
let canInteractWithCrate = false;
const joystick = { x: 0, y: 0, pointerId: null };
const lookTouch = { pointerId: null, lastX: 0, lastY: 0 };
const lookEuler = new THREE.Euler(0, 0, 0, "YXZ");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0a08);
scene.fog = new THREE.FogExp2(0x0c0a08, 0.045);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 40);
camera.position.set(0, PLAYER.height, 0);

const controls = new PointerLockControls(camera, document.body);

scene.add(new THREE.AmbientLight(0x3a3028, 0.35));

const bulb = new THREE.PointLight(0xffd9a0, 28, 18, 1.6);
bulb.position.set(0, BOX.height - 0.6, 0);
bulb.castShadow = true;
bulb.shadow.mapSize.set(1024, 1024);
scene.add(bulb);

const bulbMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 16, 16),
  new THREE.MeshStandardMaterial({
    color: 0xfff2cc,
    emissive: 0xffcc66,
    emissiveIntensity: 2.5,
  })
);
bulbMesh.position.copy(bulb.position);
scene.add(bulbMesh);

const bulbWire = new THREE.Mesh(
  new THREE.CylinderGeometry(0.008, 0.008, 0.35, 8),
  new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.4 })
);
bulbWire.position.set(0, BOX.height - 0.25, 0);
scene.add(bulbWire);

function makeCardboardTexture(base, noise = 0.08) {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const n = (Math.random() - 0.5) * noise;
    data[i * 4] = Math.min(255, Math.max(0, (base.r + n) * 255));
    data[i * 4 + 1] = Math.min(255, Math.max(0, (base.g + n) * 255));
    data[i * 4 + 2] = Math.min(255, Math.max(0, (base.b + n) * 255));
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.needsUpdate = true;
  return tex;
}

const wallMat = new THREE.MeshStandardMaterial({
  map: makeCardboardTexture({ r: 0.62, g: 0.5, b: 0.38 }),
  roughness: 0.92,
  metalness: 0.02,
});

const floorMat = new THREE.MeshStandardMaterial({
  map: makeCardboardTexture({ r: 0.48, g: 0.38, b: 0.28 }, 0.12),
  roughness: 0.95,
  metalness: 0.01,
});

const ceilingMat = new THREE.MeshStandardMaterial({
  map: makeCardboardTexture({ r: 0.55, g: 0.45, b: 0.34 }, 0.06),
  roughness: 0.88,
  metalness: 0.01,
});

function addWall(w, h, d, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

addWall(BOX.width, BOX.height, 0.15, 0, BOX.height / 2, -BOX.depth / 2, wallMat);
addWall(BOX.width, BOX.height, 0.15, 0, BOX.height / 2, BOX.depth / 2, wallMat);
addWall(0.15, BOX.height, BOX.depth, -BOX.width / 2, BOX.height / 2, 0, wallMat);
addWall(0.15, BOX.height, BOX.depth, BOX.width / 2, BOX.height / 2, 0, wallMat);
addWall(BOX.width, 0.15, BOX.depth, 0, 0, 0, floorMat);
addWall(BOX.width, 0.15, BOX.depth, 0, BOX.height, 0, ceilingMat);

function createTapeStrip(length) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.04, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xc9b896, roughness: 0.7 })
  );
  mesh.castShadow = true;
  return mesh;
}

[
  [0, 2.5, -BOX.depth / 2 + 0.1, 0],
  [0, 2.5, BOX.depth / 2 - 0.1, 0],
  [-BOX.width / 2 + 0.1, 2.5, 0, Math.PI / 2],
  [BOX.width / 2 - 0.1, 2.5, 0, Math.PI / 2],
].forEach(([x, y, z, ry]) => {
  const tape = createTapeStrip(BOX.width * 0.7);
  tape.position.set(x, y, z);
  tape.rotation.y = ry;
  scene.add(tape);
});

function makeInscription(text) {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 512;
  canvasEl.height = 256;
  const ctx = canvasEl.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.fillStyle = "#2a1f14";
  ctx.font = "italic 42px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  text.split("\n").forEach((line, i, arr) => {
    ctx.fillText(line, 256, 128 + (i - (arr.length - 1) / 2) * 52);
  });
  const tex = new THREE.CanvasTexture(canvasEl);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), mat);
  mesh.userData.text = text.replace(/\n/g, " ");
  return mesh;
}

const inscriptionMeshes = inscriptions.map(({ pos, rot, text }) => {
  const mesh = makeInscription(text);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  scene.add(mesh);
  return mesh;
});

const crate = new THREE.Mesh(
  new THREE.BoxGeometry(0.9, 0.9, 0.9),
  new THREE.MeshStandardMaterial({
    map: makeCardboardTexture({ r: 0.58, g: 0.46, b: 0.34 }, 0.1),
    roughness: 0.9,
    emissive: 0x000000,
    emissiveIntensity: 0.35,
  })
);
crate.position.set(-2.2, 0.45, 1.8);
crate.castShadow = true;
crate.receiveShadow = true;
crate.userData.pickupable = true;
scene.add(crate);

const dustCount = 120;
const dustGeo = new THREE.BufferGeometry();
const dustPositions = new Float32Array(dustCount * 3);
for (let i = 0; i < dustCount; i++) {
  dustPositions[i * 3] = (Math.random() - 0.5) * (BOX.width - 1);
  dustPositions[i * 3 + 1] = Math.random() * BOX.height;
  dustPositions[i * 3 + 2] = (Math.random() - 0.5) * (BOX.depth - 1);
}
dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({ color: 0xffe8c8, size: 0.035, transparent: true, opacity: 0.35 })
);
scene.add(dust);

const raycaster = new THREE.Raycaster();
const lookDir = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const forwardDir = new THREE.Vector3();
const rightDir = new THREE.Vector3();
const clock = new THREE.Clock();

function clampPosition() {
  const halfW = BOX.width / 2 - WALL_MARGIN - PLAYER.radius;
  const halfD = BOX.depth / 2 - WALL_MARGIN - PLAYER.radius;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -halfW, halfW);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -halfD, halfD);
  camera.position.y = PLAYER.height;
}

function showThought(text, duration = 3.5) {
  thoughtsEl.textContent = text;
  thoughtsEl.classList.add("visible");
  inscriptionCooldown = duration;
}

function updateInscriptionLook() {
  if (inscriptionCooldown > 0 || holdingCrate) return;
  camera.getWorldDirection(lookDir);
  raycaster.set(camera.position, lookDir);
  const hits = raycaster.intersectObjects(inscriptionMeshes, false);
  if (hits.length > 0 && hits[0].distance < 4.5) {
    showThought(hits[0].object.userData.text, 4);
  }
}

function canPickupCrate() {
  if (holdingCrate) return true;
  camera.getWorldDirection(lookDir);
  raycaster.set(camera.position, lookDir);
  const hits = raycaster.intersectObject(crate, false);
  return hits.length > 0 && hits[0].distance < PICKUP_RANGE;
}

function clampCratePosition() {
  const halfW = BOX.width / 2 - 0.55;
  const halfD = BOX.depth / 2 - 0.55;
  crate.position.x = THREE.MathUtils.clamp(crate.position.x, -halfW, halfW);
  crate.position.z = THREE.MathUtils.clamp(crate.position.z, -halfD, halfD);
  crate.position.y = 0.45;
}

function pickupCrate() {
  holdingCrate = true;
  scene.remove(crate);
  camera.add(crate);
  crate.position.copy(CRATE_HOLD_OFFSET);
  crate.rotation.set(0, 0, 0);
  showThought("A box inside a box. Naturally.", 4);
  updateInteractPrompt();
}

function dropCrate() {
  holdingCrate = false;
  camera.remove(crate);
  scene.add(crate);

  camera.getWorldDirection(forwardDir);
  forwardDir.y = 0;
  forwardDir.normalize();
  crate.position.copy(camera.position);
  crate.position.addScaledVector(forwardDir, 1.1);
  crate.rotation.set(0, camera.rotation.y + Math.PI, 0);
  clampCratePosition();
  showThought("Back on the floor. For now.", 3);
  updateInteractPrompt();
}

function toggleCratePickup() {
  if (!playing) return;
  if (holdingCrate) {
    dropCrate();
    return;
  }
  if (canPickupCrate()) pickupCrate();
}

function updateHeldCrate() {
  if (!holdingCrate) return;
  crate.position.y = CRATE_HOLD_OFFSET.y + Math.sin(clock.elapsedTime * 4) * 0.018;
  crate.rotation.y += 0.008;
}

function updateInteractPrompt() {
  canInteractWithCrate = canPickupCrate();
  const highlight = canInteractWithCrate && !holdingCrate;

  crate.material.emissive.setHex(highlight ? 0x5a4028 : 0x000000);
  crate.material.emissiveIntensity = highlight ? 0.45 : 0;

  if (useTouchControls) {
    interactBtn.hidden = !canInteractWithCrate;
    interactBtn.textContent = holdingCrate ? "Drop" : "Pick up";
  } else if (canInteractWithCrate) {
    statusEl.textContent = holdingCrate ? "Press E to drop" : "Press E to pick up";
  } else if (!controls.isLocked || useTouchControls) {
    statusEl.textContent = useTouchControls ? "Use the joystick and drag to look" : "Just a box.";
  }
}

function updateMovement(dt) {
  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight") || mobileSprint;
  const speed = sprint ? PLAYER.sprint : PLAYER.speed;
  let inputX = 0;
  let inputZ = 0;

  if (useTouchControls) {
    inputX = -joystick.x;
    inputZ = joystick.y;
  } else {
    if (keys.has("KeyW") || keys.has("ArrowUp")) inputZ += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) inputZ -= 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) inputX -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) inputX += 1;
  }

  if (inputX === 0 && inputZ === 0) {
    bobPhase = 0;
    camera.position.y = PLAYER.height;
    return;
  }

  const inputLength = Math.hypot(inputX, inputZ);
  if (inputLength > 1) {
    inputX /= inputLength;
    inputZ /= inputLength;
  }

  camera.getWorldDirection(forwardDir);
  forwardDir.y = 0;
  forwardDir.normalize();

  rightDir.crossVectors(forwardDir, camera.up).normalize();

  camera.position.addScaledVector(forwardDir, inputZ * speed * dt);
  camera.position.addScaledVector(rightDir, inputX * speed * dt);

  bobPhase += dt * (sprint ? 11 : 7.5);
  camera.position.y = PLAYER.height + Math.sin(bobPhase) * 0.025;

  clampPosition();
}

function setJoystickPosition(clientX, clientY) {
  const rect = joystickZone.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const distance = Math.hypot(dx, dy);
  const clamped = Math.min(distance, JOYSTICK_RADIUS);
  const angle = Math.atan2(dy, dx);
  const offsetX = Math.cos(angle) * clamped;
  const offsetY = Math.sin(angle) * clamped;

  joystickStick.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  joystick.x = offsetX / JOYSTICK_RADIUS;
  joystick.y = offsetY / JOYSTICK_RADIUS;
}

function resetJoystick() {
  joystick.pointerId = null;
  joystick.x = 0;
  joystick.y = 0;
  joystickStick.style.transform = "translate(0, 0)";
  joystickZone.classList.remove("active");
}

function applyMobileLook(deltaX, deltaY) {
  lookEuler.setFromQuaternion(camera.quaternion);
  lookEuler.y -= deltaX * LOOK_SENSITIVITY;
  lookEuler.x -= deltaY * LOOK_SENSITIVITY;
  lookEuler.x = Math.max(-PI_2 + 0.12, Math.min(PI_2 - 0.12, lookEuler.x));
  camera.quaternion.setFromEuler(lookEuler);
}

function setupMobileControls() {
  const handlePointerDown = (e) => {
    if (!playing) return;

    if (joystickZone.contains(e.target)) {
      e.preventDefault();
      joystick.pointerId = e.pointerId;
      joystickZone.classList.add("active");
      joystickZone.setPointerCapture(e.pointerId);
      setJoystickPosition(e.clientX, e.clientY);
      return;
    }

    if (lookZone.contains(e.target)) {
      e.preventDefault();
      lookTouch.pointerId = e.pointerId;
      lookTouch.lastX = e.clientX;
      lookTouch.lastY = e.clientY;
      lookZone.classList.add("active");
      lookZone.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e) => {
    if (!playing) return;

    if (e.pointerId === joystick.pointerId) {
      e.preventDefault();
      setJoystickPosition(e.clientX, e.clientY);
      return;
    }

    if (e.pointerId === lookTouch.pointerId) {
      e.preventDefault();
      applyMobileLook(e.clientX - lookTouch.lastX, e.clientY - lookTouch.lastY);
      lookTouch.lastX = e.clientX;
      lookTouch.lastY = e.clientY;
    }
  };

  const releasePointer = (e) => {
    if (e.pointerId === joystick.pointerId) {
      if (joystickZone.hasPointerCapture(e.pointerId)) {
        joystickZone.releasePointerCapture(e.pointerId);
      }
      resetJoystick();
    }

    if (e.pointerId === lookTouch.pointerId) {
      if (lookZone.hasPointerCapture(e.pointerId)) {
        lookZone.releasePointerCapture(e.pointerId);
      }
      lookTouch.pointerId = null;
      lookZone.classList.remove("active");
    }
  };

  mobileControls.addEventListener("pointerdown", handlePointerDown);
  mobileControls.addEventListener("pointermove", handlePointerMove);
  mobileControls.addEventListener("pointerup", releasePointer);
  mobileControls.addEventListener("pointercancel", releasePointer);

  sprintBtn.addEventListener("pointerdown", (e) => {
    if (!playing) return;
    e.preventDefault();
    mobileSprint = true;
    sprintBtn.classList.add("active");
  });

  sprintBtn.addEventListener("pointerup", (e) => {
    e.preventDefault();
    mobileSprint = false;
    sprintBtn.classList.remove("active");
  });

  sprintBtn.addEventListener("pointercancel", () => {
    mobileSprint = false;
    sprintBtn.classList.remove("active");
  });

  interactBtn.addEventListener("pointerup", (e) => {
    if (!playing) return;
    e.preventDefault();
    toggleCratePickup();
  });
}

function animateDust(dt) {
  const arr = dust.geometry.attributes.position.array;
  for (let i = 0; i < dustCount; i++) {
    arr[i * 3 + 1] += dt * 0.08;
    arr[i * 3] += Math.sin(clock.elapsedTime + i) * dt * 0.02;
    if (arr[i * 3 + 1] > BOX.height) arr[i * 3 + 1] = 0.1;
  }
  dust.geometry.attributes.position.needsUpdate = true;
}

function flickerBulb(time) {
  const flicker = 0.85 + Math.sin(time * 13.7) * 0.04 + Math.sin(time * 41.3) * 0.02;
  bulb.intensity = 28 * flicker;
  bulbMesh.material.emissiveIntensity = 2.5 * flicker;
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (playing && (controls.isLocked || useTouchControls)) {
    updateMovement(dt);
    updateInscriptionLook();
    updateHeldCrate();
    updateInteractPrompt();
    animateDust(dt);
    flickerBulb(clock.elapsedTime);

    thoughtTimer -= dt;
    if (thoughtTimer <= 0) {
      thoughtTimer = 14 + Math.random() * 10;
      if (inscriptionCooldown <= 0) {
        showThought(ambientThoughts[Math.floor(Math.random() * ambientThoughts.length)], 2.8);
      }
    }
  }

  if (inscriptionCooldown > 0) {
    inscriptionCooldown -= dt;
    if (inscriptionCooldown <= 0) thoughtsEl.classList.remove("visible");
  }

  renderer.render(scene, camera);
}

function enableTouchFallback() {
  useTouchControls = true;
  document.body.classList.add("touch-controls");
  statusEl.textContent = "Use the joystick and drag to look";
}

function startGame() {
  if (playing) return;

  overlay.classList.add("hidden");
  hud.hidden = false;
  playing = true;
  document.body.classList.add("playing");
  lookEuler.setFromQuaternion(camera.quaternion);
  syncTouchMode();

  if (useTouchControls) {
    statusEl.textContent = "Use the joystick and drag to look";
    return;
  }

  controls.lock();
  window.setTimeout(() => {
    if (playing && !controls.isLocked) enableTouchFallback();
  }, 400);
}

function bindStartButton() {
  const start = (e) => {
    e.preventDefault();
    startGame();
  };

  enterBtn.addEventListener("click", start);
  enterBtn.addEventListener("touchend", start, { passive: false });
}

bindStartButton();
setupMobileControls();

controls.addEventListener("lock", () => {
  if (!canInteractWithCrate) statusEl.textContent = "Just a box.";
});

controls.addEventListener("unlock", () => {
  if (playing) statusEl.textContent = "Click to look around";
});

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "KeyE") {
    e.preventDefault();
    toggleCratePickup();
  }
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => keys.delete(e.code));

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

canvas.addEventListener("click", () => {
  if (!useTouchControls && playing && !controls.isLocked) controls.lock();
});

tick();
