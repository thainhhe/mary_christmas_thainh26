// Tiny music-box synth (no audio files): loops "Jingle Bells" quietly.
const F = { C: 261.63, D: 293.66, E: 329.63, F: 349.23, G: 392.0 };
const SONG = [
  ['E', 1], ['E', 1], ['E', 2], ['E', 1], ['E', 1], ['E', 2], ['E', 1], ['G', 1], ['C', 1.5], ['D', 0.5], ['E', 4],
  ['F', 1], ['F', 1], ['F', 1.5], ['F', 0.5], ['F', 1], ['E', 1], ['E', 1], ['E', 0.5], ['E', 0.5],
  ['E', 1], ['D', 1], ['D', 1], ['E', 1], ['D', 2], ['G', 2],
];
const BEAT = 0.36;
let ctx = null, master = null, timer = 0, dest = null;

function tone(freq, at, dur, gain = 0.5) {
  for (const [mult, g, type] of [[1, gain, 'triangle'], [2, gain * 0.25, 'sine']]) {
    const o = ctx.createOscillator(), e = ctx.createGain();
    o.type = type; o.frequency.value = freq * mult;
    e.gain.setValueAtTime(0.0001, at);
    e.gain.exponentialRampToValueAtTime(g, at + 0.01);
    e.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(dur * 1.8, 0.5));
    o.connect(e).connect(master);
    o.start(at); o.stop(at + Math.max(dur * 1.8, 0.5) + 0.05);
  }
}

function phrase() {
  let t = ctx.currentTime + 0.05;
  for (const [n, b] of SONG) { tone(F[n], t, b * BEAT); t += b * BEAT; }
  timer = setTimeout(phrase, (t - ctx.currentTime + 2.5) * 1000);
}

export function isOn() { return !!ctx; }
export function start() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.07; master.connect(ctx.destination);
  phrase();
}
export function stop() {
  clearTimeout(timer);
  if (ctx) { ctx.close(); ctx = null; master = null; dest = null; }
}
/** The music as a MediaStream (for video recording); null if the music is off. */
export function captureStream() {
  if (!ctx) return null;
  if (!dest) { dest = ctx.createMediaStreamDestination(); master.connect(dest); }
  return dest.stream;
}
export function chime() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, t + i * 0.09, 0.3, 0.8));
}
