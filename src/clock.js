// `?now=2026-12-01T20:10` fakes the wall clock (handy for testing events).
export const params = new URLSearchParams(location.search);
const offset = params.get('now') ? new Date(params.get('now')).getTime() - Date.now() : 0;
export const now = () => new Date(Date.now() + (Number.isFinite(offset) ? offset : 0));

/** Scheduled events. Santa flies every few minutes (see SANTA_EVERY_MIN); the rest are yearly. */
export function nextOccurrence(month, day, hour, minute, durationMin) {
  const n = now();
  for (const y of [n.getFullYear(), n.getFullYear() + 1]) {
    const start = new Date(y, month, day, hour, minute);
    const end = new Date(start.getTime() + durationMin * 60000);
    if (n < end) return { start, end, live: n >= start };
  }
  return null;
}
export const EVENTS = [
  { id: 'carol', args: [11, 1, 20, 0, 60] },
  { id: 'quiet', args: [11, 1, 23, 0, 60] },
  { id: 'eve', args: [11, 24, 22, 0, 120] },
];
export function activeEvent() {
  for (const e of EVENTS) {
    const o = nextOccurrence(...e.args);
    if (o?.live) return e.id;
  }
  return null;
}
/** Santa flies every SANTA_EVERY_MIN minutes, on slots counted from the epoch (so everyone sees him at the same moment). */
export const SANTA_EVERY_MIN = 7;
const SANTA_SLOT_MS = SANTA_EVERY_MIN * 60000;
export const santaSlot = (ms = now().getTime()) => Math.floor(ms / SANTA_SLOT_MS);
/** Milliseconds into the current slot. */
export const santaSlotAge = (ms = now().getTime()) => ms - santaSlot(ms) * SANTA_SLOT_MS;
export function nextSantaMs() {
  return SANTA_SLOT_MS - santaSlotAge();
}
