// The workbook games bridge (acedzn-tools docs/games/PLAN.md, section 4).
// The same file ships in every game. Inside the workbook player (an iframe on
// *.workbook.co.il) the game tells the page when it is ready and when a level
// starts or ends; run on its own it posts nothing.

export type HostMessage =
  | { type: 'ready' }
  | { type: 'level-start'; level: number }
  | { type: 'level-complete'; level: number; stars?: number; score?: number; durationMs?: number }
  | { type: 'error'; message: string };

const PARENT_ORIGIN = /^(https:\/\/([a-z0-9-]+\.)*workbook\.co\.il|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

/**
 * `?level=N` (1-based) as a level index, or null when absent or out of range.
 * A deep-linked level opens even if the player's save has it locked.
 */
export function parseLevelParam(search: string, levelCount: number, key = 'level'): number | null {
  const raw = new URLSearchParams(search).get(key);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= levelCount ? n - 1 : null;
}

function parentOrigin(): string | null {
  if (typeof window === 'undefined' || window.parent === window) return null;
  let origin = window.location.ancestorOrigins?.[0] ?? '';
  if (!origin && document.referrer) {
    try {
      origin = new URL(document.referrer).origin;
    } catch {
      origin = '';
    }
  }
  return PARENT_ORIGIN.test(origin) ? origin : null;
}

let slug = '';
let target: string | null = null;

export function initHost(gameSlug: string): void {
  slug = gameSlug;
  target = parentOrigin();
  if (!target) return;
  window.addEventListener('error', (e) => postToHost({ type: 'error', message: String(e.message).slice(0, 200) }));
}

export function postToHost(message: HostMessage): void {
  if (!target) return;
  window.parent.postMessage({ source: 'workbook-game', version: 1, slug, ...message }, target);
}
