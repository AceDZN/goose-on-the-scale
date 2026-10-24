// Keyboard + touch joystick input. Produces a movement vector and edge-triggered actions.

export type Action = 'interact' | 'honk' | 'flap' | 'pause' | 'hint' | 'mute' | 'restart';

export class Input {
  readonly keys = new Set<string>();
  private queued: Action[] = [];
  joy = { x: 0, y: 0 };
  /** Horizontal camera drag (radians accumulated since last read). */
  yawDrag = 0;
  private joyPointer: number | null = null;
  private dragPointer: number | null = null;
  private dragLastX = 0;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      const map: Record<string, Action> = {
        KeyE: 'interact',
        Enter: 'interact',
        KeyQ: 'honk',
        Space: 'flap',
        Escape: 'pause',
        KeyP: 'pause',
        KeyH: 'hint',
        KeyM: 'mute',
        KeyR: 'restart',
      };
      const a = map[e.code];
      if (a) {
        this.queued.push(a);
        e.preventDefault();
      }
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      this.dragPointer = e.pointerId;
      this.dragLastX = e.clientX;
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.dragPointer) {
        this.yawDrag += (e.clientX - this.dragLastX) * 0.006;
        this.dragLastX = e.clientX;
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerId === this.dragPointer) this.dragPointer = null;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindJoystick(base: HTMLElement, knob: HTMLElement): void {
    const radius = () => base.clientWidth / 2;
    const update = (e: PointerEvent) => {
      const r = base.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      const max = radius() * 0.8;
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy = { x: dx / max, y: dy / max };
    };
    base.addEventListener('pointerdown', (e) => {
      this.joyPointer = e.pointerId;
      base.setPointerCapture(e.pointerId);
      update(e);
      e.preventDefault();
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joyPointer) update(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyPointer) return;
      this.joyPointer = null;
      this.joy = { x: 0, y: 0 };
      knob.style.transform = '';
    };
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
  }

  bindButton(el: HTMLElement, action: Action): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.queued.push(action);
    });
  }

  push(a: Action): void {
    this.queued.push(a);
  }

  /** Movement in camera space: x right, y forward. */
  move(): { x: number; y: number } {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (this.joy.x || this.joy.y) {
      x = this.joy.x;
      y = -this.joy.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  drain(): Action[] {
    const out = this.queued;
    this.queued = [];
    return out;
  }

  takeYaw(): number {
    const y = this.yawDrag;
    this.yawDrag = 0;
    return y;
  }
}
