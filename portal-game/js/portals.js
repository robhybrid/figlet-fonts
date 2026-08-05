import * as THREE from "three";

const BLUE = 0x4aa8ff;
const ORANGE = 0xff7a29;
const PORTAL_W = 1.6;
const PORTAL_H = 2.4;

export class PortalPair {
  constructor(scene, renderer, mainCamera) {
    this.scene = scene;
    this.renderer = renderer;
    this.mainCamera = mainCamera;
    this.blue = null;
    this.orange = null;
    this.rtSize = 512;
    this.blueRT = new THREE.WebGLRenderTarget(this.rtSize, this.rtSize);
    this.orangeRT = new THREE.WebGLRenderTarget(this.rtSize, this.rtSize);
    this.helperCam = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
    this._tmpQuat = new THREE.Quaternion();
    this._tmpMat = new THREE.Matrix4();
  }

  clear(color) {
    const p = color === "blue" ? this.blue : color === "orange" ? this.orange : null;
    if (color === "blue" || !color) {
      if (this.blue) {
        this.scene.remove(this.blue.group);
        this.blue = null;
      }
    }
    if (color === "orange" || !color) {
      if (this.orange) {
        this.scene.remove(this.orange.group);
        this.orange = null;
      }
    }
    if (!color) {
      this.blue = null;
      this.orange = null;
    }
  }

  place(color, point, normal, surfaceBox) {
    // snap slightly off the surface
    const n = normal.clone().normalize();
    // refuse near-degenerate placements (edge cases)
    if (n.lengthSq() < 0.5) return false;

    const pos = point.clone().addScaledVector(n, 0.05);
    const group = this._makePortalMesh(color === "blue" ? BLUE : ORANGE, color);

    // orient: portal faces along -normal from the wall's perspective (opening toward room)
    const look = pos.clone().add(n);
    group.position.copy(pos);
    group.up.set(0, 1, 0);
    // if portal on floor/ceiling, pick a stable up
    if (Math.abs(n.y) > 0.9) {
      group.up.set(0, 0, -Math.sign(n.y) || -1);
    }
    group.lookAt(look);

    const portal = {
      color,
      group,
      normal: n,
      position: pos,
      surfaceBox,
      width: PORTAL_W,
      height: PORTAL_H,
    };

    if (color === "blue") {
      if (this.blue) this.scene.remove(this.blue.group);
      this.blue = portal;
      group.userData.portalColor = "blue";
    } else {
      if (this.orange) this.scene.remove(this.orange.group);
      this.orange = portal;
      group.userData.portalColor = "orange";
    }
    this.scene.add(group);
    return true;
  }

  _makePortalMesh(hex, color) {
    const group = new THREE.Group();

    const ringGeo = new THREE.RingGeometry(0.72, 0.95, 48);
    ringGeo.scale(PORTAL_W / 1.6, PORTAL_H / 2.0, 1);
    const ringMat = new THREE.MeshBasicMaterial({
      color: hex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    const glowGeo = new THREE.RingGeometry(0.95, 1.15, 48);
    glowGeo.scale(PORTAL_W / 1.6, PORTAL_H / 2.0, 1);
    const glowMat = new THREE.MeshBasicMaterial({
      color: hex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
    });
    group.add(new THREE.Mesh(glowGeo, glowMat));

    const planeGeo = new THREE.PlaneGeometry(PORTAL_W * 0.9, PORTAL_H * 0.9);
    const planeMat = new THREE.MeshBasicMaterial({
      map: color === "blue" ? this.orangeRT.texture : this.blueRT.texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.position.z = -0.01;
    plane.name = "portalSurface";
    group.add(plane);

    // soft inner fill when unpaired
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 32).scale(PORTAL_W / 1.6, PORTAL_H / 2.0, 1),
      new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
      })
    );
    fill.position.z = -0.02;
    fill.name = "portalFill";
    group.add(fill);

    return group;
  }

  bothReady() {
    return !!(this.blue && this.orange);
  }

  /** Render each portal's view into the other's texture (1 recursion level). */
  renderViews(excludeMeshes = []) {
    if (!this.bothReady()) {
      this._setFillVisible(true);
      return;
    }
    this._setFillVisible(false);

    const prevTarget = this.renderer.getRenderTarget();
    const prevAuto = this.renderer.autoClear;

    this._renderOne(this.blue, this.orange, this.blueRT, excludeMeshes);
    this._renderOne(this.orange, this.blue, this.orangeRT, excludeMeshes);

    this.renderer.setRenderTarget(prevTarget);
    this.renderer.autoClear = prevAuto;
  }

  _setFillVisible(v) {
    for (const p of [this.blue, this.orange]) {
      if (!p) continue;
      const fill = p.group.getObjectByName("portalFill");
      if (fill) fill.visible = v;
    }
  }

  _renderOne(from, to, target, excludeMeshes) {
    // Camera at `to` looking as if through `from`
    this._alignCamera(from, to);
    for (const m of excludeMeshes) m.visible = false;
    from.group.visible = false;
    to.group.visible = false;

    this.renderer.setRenderTarget(target);
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.helperCam);

    from.group.visible = true;
    to.group.visible = true;
    for (const m of excludeMeshes) m.visible = true;
  }

  _alignCamera(from, to) {
    const cam = this.mainCamera;
    const flipY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    const fromQ = new THREE.Quaternion();
    const toQ = new THREE.Quaternion();
    from.group.getWorldQuaternion(fromQ);
    to.group.getWorldQuaternion(toQ);

    const local = from.group.worldToLocal(cam.position.clone());
    local.applyQuaternion(flipY);
    const worldPos = to.group.localToWorld(local);

    const fromInv = fromQ.clone().invert();
    const rel = fromInv.multiply(cam.quaternion.clone());
    const outQ = toQ.clone().multiply(flipY).multiply(rel);

    this.helperCam.position.copy(worldPos);
    this.helperCam.quaternion.copy(outQ);
    this.helperCam.fov = cam.fov;
    this.helperCam.aspect = 1;
    this.helperCam.near = cam.near;
    this.helperCam.far = cam.far;
    this.helperCam.updateProjectionMatrix();
    this.helperCam.updateMatrixWorld(true);
  }

  /**
   * If player is close enough to a portal opening, teleport to the other.
   * Returns true if teleported.
   */
  tryTravel(player) {
    if (!this.bothReady()) return false;
    for (const [entry, exit] of [
      [this.blue, this.orange],
      [this.orange, this.blue],
    ]) {
      if (this._nearPortal(player.position, entry)) {
        this._teleport(player, entry, exit);
        return true;
      }
    }
    return false;
  }

  _nearPortal(pos, portal) {
    const local = portal.group.worldToLocal(pos.clone());
    const inEllipse =
      (local.x * local.x) / ((portal.width * 0.55) ** 2) +
        (local.y * local.y) / ((portal.height * 0.55) ** 2) <
      1;
    // lookAt faces room along -Z, so the playable side is negative local Z
    const depth = local.z;
    return inEllipse && depth > -0.65 && depth < 0.4;
  }

  _teleport(player, from, to) {
    const flipY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    const fromQ = new THREE.Quaternion();
    const toQ = new THREE.Quaternion();
    from.group.getWorldQuaternion(fromQ);
    to.group.getWorldQuaternion(toQ);

    const local = from.group.worldToLocal(player.position.clone());
    local.applyQuaternion(flipY);
    // exit on the room-facing side (-Z)
    local.z = -0.85;
    // keep modest lateral offset so you don't clip the rim
    local.x *= 0.5;
    local.y = THREE.MathUtils.clamp(local.y, -portalHalfY(to), portalHalfY(to));

    player.position.copy(to.group.localToWorld(local));
    // extra safety push into the room along portal normal
    player.position.addScaledVector(to.normal, 0.35);

    const fromInv = fromQ.clone().invert();
    const localVel = player.velocity.clone().applyQuaternion(fromInv);
    localVel.applyQuaternion(flipY);
    player.velocity.copy(localVel.applyQuaternion(toQ));

    // keep a minimum exit speed so you don't get stuck in the plane
    const out = new THREE.Vector3(0, 0, -1).applyQuaternion(toQ);
    if (player.velocity.dot(out) < 2) {
      player.velocity.addScaledVector(out, 2);
    }

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.camera.quaternion);
    const localF = forward.clone().applyQuaternion(fromInv);
    localF.applyQuaternion(flipY);
    const newF = localF.applyQuaternion(toQ);
    player.yaw = Math.atan2(-newF.x, -newF.z);
    player.pitch = Math.asin(Math.max(-1, Math.min(1, newF.y)));
    player.onGround = false;
  }

  dispose() {
    this.clear();
    this.blueRT.dispose();
    this.orangeRT.dispose();
  }
}

export function firePortalRay(camera, colliders, maxDist = 60) {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = maxDist;

  let best = null;
  let bestDist = Infinity;

  for (const c of colliders) {
    if (!c.portalable || !c.mesh) continue;
    const hits = raycaster.intersectObject(c.mesh);
    if (!hits.length) continue;
    const h = hits[0];
    if (h.distance < bestDist) {
      bestDist = h.distance;
      best = h;
    }
  }
  return best;
}
