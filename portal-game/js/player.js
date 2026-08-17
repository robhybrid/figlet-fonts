import * as THREE from "three";

const GRAVITY = 28;
const MOVE_SPEED = 8;
const SPRINT = 1.35;
const JUMP = 9.5;
const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.7;
const EYE = 1.55;

export class Player {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    this.velocity = new THREE.Vector3();
    this.position = new THREE.Vector3(0, EYE, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.enabled = false;
    this.keys = new Set();
    this.radius = PLAYER_RADIUS;
    this.height = PLAYER_HEIGHT;
    this.eye = EYE;
    this.held = null;
    this.portalCooldown = 0;
    this.moveAxis = { x: 0, z: 0 };
    this.jumpHeld = false;
    this._bind();
  }

  _bind() {
    window.addEventListener("keydown", (e) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
  }

  setPose(x, y, z, yaw = 0) {
    this.position.set(x, y, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.velocity.set(0, 0, 0);
    this._syncCamera();
  }

  _syncCamera() {
    this.camera.position.copy(this.position);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.updateMatrixWorld(true);
  }

  look(dx, dy) {
    if (!this.enabled) return;
    this.yaw -= dx * 0.0022;
    this.pitch -= dy * 0.0022;
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));
    this._syncCamera();
  }

  feetY() {
    return this.position.y - this.eye;
  }

  update(dt, colliders, tryPortalTravel) {
    if (!this.enabled) return;

    if (this.portalCooldown > 0) this.portalCooldown -= dt;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const analog = Math.min(1, Math.hypot(this.moveAxis.x, this.moveAxis.z));
    const wish = new THREE.Vector3();
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) wish.add(forward);
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) wish.sub(forward);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) wish.add(right);
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) wish.sub(right);
    if (analog > 0.04) {
      wish.addScaledVector(forward, this.moveAxis.z);
      wish.addScaledVector(right, this.moveAxis.x);
    }
    if (wish.lengthSq() > 0) wish.normalize();

    const speed =
      MOVE_SPEED *
      (this.keys.has("ShiftLeft") ? SPRINT : analog > 0.04 ? Math.max(0.4, analog) : 1);
    this.velocity.x = wish.x * speed;
    this.velocity.z = wish.z * speed;

    if (this.onGround && (this.keys.has("Space") || this.jumpHeld)) {
      this.velocity.y = JUMP;
      this.onGround = false;
    }

    this.velocity.y -= GRAVITY * dt;

    // horizontal then vertical sweep against AABB colliders
    this._moveAxis("x", this.velocity.x * dt, colliders);
    this._moveAxis("z", this.velocity.z * dt, colliders);
    this._moveAxis("y", this.velocity.y * dt, colliders);

    if (tryPortalTravel && this.portalCooldown <= 0) {
      const traveled = tryPortalTravel(this);
      if (traveled) this.portalCooldown = 0.45;
    }

    this._syncCamera();
  }

  _moveAxis(axis, delta, colliders) {
    if (delta === 0) return;
    this.position[axis] += delta;

    const body = this._bodyBox();
    let grounded = axis === "y" && delta <= 0 ? false : this.onGround;

    for (const box of colliders) {
      if (!body.intersectsBox(box)) continue;
      if (axis === "x") {
        if (delta > 0) this.position.x = box.min.x - this.radius - 0.001;
        else this.position.x = box.max.x + this.radius + 0.001;
        this.velocity.x = 0;
      } else if (axis === "z") {
        if (delta > 0) this.position.z = box.min.z - this.radius - 0.001;
        else this.position.z = box.max.z + this.radius + 0.001;
        this.velocity.z = 0;
      } else {
        if (delta > 0) {
          // hit ceiling — top of capsule against box bottom
          this.position.y = box.min.y - (this.height - this.eye) - 0.001;
          this.velocity.y = 0;
        } else {
          this.position.y = box.max.y + this.eye + 0.001;
          this.velocity.y = 0;
          grounded = true;
        }
      }
      body.copy(this._bodyBox());
    }

    if (axis === "y") this.onGround = grounded;
  }

  _bodyBox() {
    const feet = this.feetY();
    return new THREE.Box3(
      new THREE.Vector3(
        this.position.x - this.radius,
        feet,
        this.position.z - this.radius
      ),
      new THREE.Vector3(
        this.position.x + this.radius,
        feet + this.height,
        this.position.z + this.radius
      )
    );
  }
}

export { GRAVITY, PLAYER_RADIUS, PLAYER_HEIGHT, EYE };
