export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SizeSpec =
  | number // fixed cells
  | `${number}%` // percentage of parent
  | 'auto'
  | '*'; // flex grow

export interface LayoutChild {
  id?: string;
  size?: SizeSpec;
  min?: number;
  max?: number;
}

export type SplitDirection = 'row' | 'col';

function parseSize(spec: SizeSpec | undefined, total: number, flexCount: number, remaining: number): number | 'flex' {
  if (spec === undefined || spec === '*' || spec === 'auto') return 'flex';
  if (typeof spec === 'number') return Math.max(0, Math.min(total, Math.floor(spec)));
  if (typeof spec === 'string' && spec.endsWith('%')) {
    const pct = Number(spec.slice(0, -1));
    if (Number.isNaN(pct)) return 'flex';
    return Math.max(0, Math.floor((pct / 100) * total));
  }
  void flexCount;
  void remaining;
  return 'flex';
}

function clamp(n: number, min?: number, max?: number): number {
  let v = n;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

/**
 * Partition a rect into tiled children along a row (horizontal) or col (vertical).
 * Fixed and % sizes are applied first; remaining space is shared by flex (`*`) children.
 */
export function split(
  parent: Rect,
  direction: SplitDirection,
  children: LayoutChild[],
): Rect[] {
  if (children.length === 0) return [];
  const main = direction === 'row' ? parent.w : parent.h;
  const sizes: number[] = new Array(children.length).fill(0);
  let used = 0;
  const flexIdx: number[] = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    const parsed = parseSize(child.size, main, 0, 0);
    if (parsed === 'flex') {
      flexIdx.push(i);
    } else {
      sizes[i] = clamp(parsed, child.min, child.max);
      used += sizes[i]!;
    }
  }

  let remaining = Math.max(0, main - used);
  if (flexIdx.length > 0) {
    const base = Math.floor(remaining / flexIdx.length);
    let leftover = remaining - base * flexIdx.length;
    for (const i of flexIdx) {
      const child = children[i]!;
      let s = base + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover -= 1;
      sizes[i] = clamp(s, child.min, child.max);
    }
    // Recompute if clamps ate space unevenly — best-effort redistribute.
    used = sizes.reduce((a, b) => a + b, 0);
    remaining = main - used;
    if (remaining !== 0 && flexIdx.length > 0) {
      const last = flexIdx[flexIdx.length - 1]!;
      sizes[last] = Math.max(0, sizes[last]! + remaining);
    }
  }

  const rects: Rect[] = [];
  let offset = 0;
  for (let i = 0; i < children.length; i++) {
    const s = sizes[i]!;
    if (direction === 'row') {
      rects.push({ x: parent.x + offset, y: parent.y, w: s, h: parent.h });
    } else {
      rects.push({ x: parent.x, y: parent.y + offset, w: parent.w, h: s });
    }
    offset += s;
  }
  return rects;
}

/** Convenience: horizontal tiles. */
export function row(parent: Rect, children: LayoutChild[]): Rect[] {
  return split(parent, 'row', children);
}

/** Convenience: vertical tiles. */
export function col(parent: Rect, children: LayoutChild[]): Rect[] {
  return split(parent, 'col', children);
}

export function inset(rect: Rect, n: number): Rect {
  return {
    x: rect.x + n,
    y: rect.y + n,
    w: Math.max(0, rect.w - n * 2),
    h: Math.max(0, rect.h - n * 2),
  };
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}
