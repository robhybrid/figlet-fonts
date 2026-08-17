/** On-screen controls for phones and tablets. */

export function prefersTouchControls() {
  const force = new URLSearchParams(location.search).get("touch");
  if (force === "1") return true;
  if (force === "0") return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const noHover = window.matchMedia("(hover: none)").matches;
  const small = window.matchMedia("(max-width: 900px)").matches;
  return (coarse && noHover) || (small && navigator.maxTouchPoints > 0);
}

export class TouchControls {
  constructor({ player, onBlue, onOrange, onGrab, onJump, onReset }) {
    this.player = player;
    this.onBlue = onBlue;
    this.onOrange = onOrange;
    this.onGrab = onGrab;
    this.onJump = onJump;
    this.onReset = onReset;

    this.root = document.getElementById("touch-controls");
    this.stick = document.getElementById("touch-stick");
    this.knob = document.getElementById("touch-knob");
    this.lookZone = document.getElementById("touch-look");

    this.moveId = null;
    this.lookId = null;
    this.origin = { x: 0, y: 0 };
    this.lastLook = { x: 0, y: 0 };
    this.radius = 56;

    this._bind();
  }

  show() {
    this.root.classList.remove("hidden");
    this.root.setAttribute("aria-hidden", "false");
    document.body.classList.add("touch-ui");
  }

  hide() {
    this.root.classList.add("hidden");
    this.root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("touch-ui");
    this._endMove();
    this._endLook();
  }

  _bind() {
    const stickHit = document.getElementById("touch-move");
    stickHit.addEventListener("pointerdown", (e) => this._startMove(e), { passive: false });
    this.lookZone.addEventListener("pointerdown", (e) => this._startLook(e), { passive: false });

    window.addEventListener("pointermove", (e) => this._onMove(e), { passive: false });
    window.addEventListener("pointerup", (e) => this._onUp(e));
    window.addEventListener("pointercancel", (e) => this._onUp(e));

    this._btn("touch-blue", () => this.onBlue());
    this._btn("touch-orange", () => this.onOrange());
    this._btn("touch-grab", () => this.onGrab());
    this._btn("touch-reset", () => this.onReset());

    const jump = document.getElementById("touch-jump");
    const setJump = (held) => {
      this.player.jumpHeld = held;
      if (held) this.onJump?.();
    };
    jump.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      jump.setPointerCapture(e.pointerId);
      jump.classList.add("held");
      setJump(true);
    });
    const endJump = (e) => {
      jump.classList.remove("held");
      setJump(false);
      if (e) e.preventDefault();
    };
    jump.addEventListener("pointerup", endJump);
    jump.addEventListener("pointercancel", endJump);

    // Stop iOS rubber-band / pinch while playing
    document.addEventListener(
      "touchmove",
      (e) => {
        if (!this.root.classList.contains("hidden")) e.preventDefault();
      },
      { passive: false }
    );
  }

  _btn(id, fn) {
    const el = document.getElementById(id);
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add("held");
      fn();
    });
    const clear = () => el.classList.remove("held");
    el.addEventListener("pointerup", clear);
    el.addEventListener("pointercancel", clear);
    el.addEventListener("pointerleave", clear);
  }

  _startMove(e) {
    if (this.moveId != null) return;
    e.preventDefault();
    this.moveId = e.pointerId;
    const rect = this.stick.getBoundingClientRect();
    this.origin.x = rect.left + rect.width / 2;
    this.origin.y = rect.top + rect.height / 2;
    this.radius = rect.width / 2 - 8;
    this.stick.classList.add("active");
    this._updateStick(e.clientX, e.clientY);
  }

  _startLook(e) {
    if (e.target.closest(".touch-btn")) return;
    if (this.lookId != null) return;
    e.preventDefault();
    this.lookId = e.pointerId;
    this.lastLook.x = e.clientX;
    this.lastLook.y = e.clientY;
    this.lookZone.classList.add("active");
  }

  _onMove(e) {
    if (e.pointerId === this.moveId) {
      e.preventDefault();
      this._updateStick(e.clientX, e.clientY);
    } else if (e.pointerId === this.lookId) {
      e.preventDefault();
      const dx = e.clientX - this.lastLook.x;
      const dy = e.clientY - this.lastLook.y;
      this.lastLook.x = e.clientX;
      this.lastLook.y = e.clientY;
      this.player.look(dx * 1.35, dy * 1.35);
    }
  }

  _onUp(e) {
    if (e.pointerId === this.moveId) this._endMove();
    if (e.pointerId === this.lookId) this._endLook();
  }

  _updateStick(x, y) {
    let dx = x - this.origin.x;
    let dy = y - this.origin.y;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, this.radius);
    dx = (dx / len) * clamped;
    dy = (dy / len) * clamped;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.player.moveAxis.x = dx / this.radius;
    this.player.moveAxis.z = -dy / this.radius;
  }

  _endMove() {
    this.moveId = null;
    this.player.moveAxis.x = 0;
    this.player.moveAxis.z = 0;
    this.knob.style.transform = "translate(0, 0)";
    this.stick.classList.remove("active");
  }

  _endLook() {
    this.lookId = null;
    this.lookZone.classList.remove("active");
  }
}
