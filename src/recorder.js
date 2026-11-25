import * as THREE from 'three';
import { $ } from './state.js';
import { t } from './i18n.js';
import { now } from './clock.js';
import { bubbleSnapshot } from './bubbles.js';
import * as sound from './audio.js';

/* ---------- Camera moves (progress p: 0..1, a0: the azimuth the user was looking from) ---------- */
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const polar = (a, r, y) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
export const STYLES = {
  // slow orbit around the town, rising a little
  orbit: (p, a0) => ({ pos: polar(a0 + p * 1.9, 24 - 4 * Math.sin(Math.PI * p), 10 + 4 * ease(p)), look: new THREE.Vector3(0, 5, 0) }),
  // start under the tree looking at the star, then pull up and out to the whole town
  rise: (p, a0) => { const e = ease(p); return { pos: polar(a0 + 1.3 * e, 6.5 + 23.5 * e, 1.6 + 15 * e), look: new THREE.Vector3(0, 9 - 5.5 * e, 0) }; },
  // eye-level walk around the plaza
  stroll: (p, a0) => ({ pos: polar(a0 + p * 1.6, 16 - 3 * Math.sin(Math.PI * p), 2.2 + 0.25 * Math.sin(p * 14)), look: new THREE.Vector3(0, 4.8, 0) }),
};

const MIMES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const pickMime = () => (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported ? MIMES.find((m) => MediaRecorder.isTypeSupported(m)) : null);
export const SIZES = { 720: { w: 720, h: 1280, bps: 4_000_000 }, 1080: { w: 1080, h: 1920, bps: 7_000_000 } };
const COUNTDOWN_MS = 3000;

function wrapLines(g, text, maxW) {
  const out = []; let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxW && line) { out.push(line); line = word; } else line = test;
  }
  if (line) out.push(line);
  return out.slice(0, 4);
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

/**
 * Records a vertical (9:16) video: the 3D canvas is copied into a 2D canvas every frame together with
 * the overlays that live in the page (speech bubbles, caption, countdown), so they end up in the file.
 * ctx: { glCanvas, camera, controls, setRecSize(size|null), santa, fireworks, onDone(blob, ext), onEnd() }
 */
export function createRecorder(ctx) {
  const canvas = $('rec'), g = canvas.getContext('2d');
  const mime = pickMime();
  const supported = !!mime && !!HTMLCanvasElement.prototype.captureStream;
  let st = null;

  function cleanup() {
    if (!st) return;
    document.body.classList.remove('recording');
    $('rec-ui').hidden = true; canvas.hidden = true;
    ctx.setRecSize(null);
    st.stream?.getTracks().forEach((tr) => tr.stop());
    if (st.startedMusic) sound.stop();
    ctx.camera.position.copy(st.saved.pos);
    ctx.controls.target.copy(st.saved.target);
    ctx.controls.enabled = true;
    ctx.controls.autoRotate = st.saved.autoRotate;
    ctx.controls.update();
    st = null;
    ctx.onEnd?.();
  }

  function begin() { // countdown finished -> start capturing
    const { opts, size } = st;
    const vs = canvas.captureStream(30);
    const tracks = [...vs.getVideoTracks()];
    if (opts.music) { const as = sound.captureStream(); if (as) tracks.push(...as.getAudioTracks()); }
    st.stream = new MediaStream(tracks);
    st.chunks = [];
    const mr = new MediaRecorder(st.stream, { mimeType: mime, videoBitsPerSecond: size.bps });
    mr.ondataavailable = (e) => { if (e.data && e.data.size) st.chunks.push(e.data); };
    mr.onstop = () => {
      const chunks = st?.chunks ?? [], cancelled = st?.cancelled;
      cleanup();
      if (!cancelled && chunks.length) ctx.onDone(new Blob(chunks, { type: mime.split(';')[0] }), mime.includes('mp4') ? 'mp4' : 'webm');
    };
    mr.start(250);
    st.mr = mr; st.phase = 'record'; st.t0 = performance.now();
    if (opts.fireworks) ctx.fireworks.startShow(opts.seconds, true);
    if (opts.santa && !ctx.santa.active) ctx.santa.start({ follow: true });
  }

  function stop(cancel = false) {
    if (!st) return;
    st.cancelled = cancel;
    if (st.mr && st.mr.state !== 'inactive') st.mr.stop(); else cleanup();
  }

  function drawOverlays(w, h, p, elapsed) {
    const fs = h * 0.0175;
    // fade in / out
    const fade = Math.min(1, elapsed / 0.7, (st.opts.seconds - elapsed) / 0.7);
    // caption + days left
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const alpha = Math.max(0, Math.min(1, fade));
    if (st.opts.caption) {
      const grad = g.createLinearGradient(0, 0, 0, h * 0.2); grad.addColorStop(0, 'rgba(5,11,26,.65)'); grad.addColorStop(1, 'rgba(5,11,26,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h * 0.2);
      g.font = `800 ${h * 0.03}px system-ui, sans-serif`; g.fillStyle = `rgba(255,255,255,${alpha})`;
      g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = h * 0.008;
      const lines = wrapLines(g, st.opts.caption, w * 0.86);
      lines.forEach((l, i) => g.fillText(l, w / 2, h * 0.075 + i * h * 0.04));
      g.shadowBlur = 0;
    }
    if (st.opts.days) {
      const n = now(), target = new Date(n.getFullYear(), 11, 25), days = Math.max(0, Math.ceil((target - n) / 864e5));
      g.font = `700 ${h * 0.022}px system-ui, sans-serif`; g.fillStyle = `rgba(247,185,85,${alpha})`;
      g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = h * 0.008;
      g.fillText(`✦ ${t('ph.days', { n: days })} ✦`, w / 2, h * 0.93);
      g.shadowBlur = 0;
    }
    // speech bubbles (DOM in the page, so draw them here)
    g.font = `600 ${fs}px system-ui, sans-serif`;
    for (const b of bubbleSnapshot()) {
      if (b.hidden || b.nx < -0.05 || b.nx > 1.05 || b.ny < 0 || b.ny > 1.05) continue;
      const lines = wrapLines(g, b.text, w * 0.5), lh = fs * 1.3, px = fs * 0.8, py = fs * 0.55;
      const bw = Math.max(...lines.map((l) => g.measureText(l).width)) + px * 2, bh = lines.length * lh + py * 2;
      const x = Math.min(Math.max(b.nx * w - bw / 2, 8), w - bw - 8), y = b.ny * h - bh - fs * 0.55;
      g.globalAlpha = alpha; g.fillStyle = b.npc ? '#eef3ff' : '#fff7ea';
      g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = fs * 0.6; rrect(g, x, y, bw, bh, fs * 0.8); g.fill(); g.shadowBlur = 0;
      g.beginPath(); g.moveTo(b.nx * w - fs * 0.4, y + bh - 1); g.lineTo(b.nx * w, y + bh + fs * 0.5); g.lineTo(b.nx * w + fs * 0.4, y + bh - 1); g.fill();
      g.fillStyle = '#2a2230'; lines.forEach((l, i) => g.fillText(l, x + bw / 2, y + py + lh * (i + 0.5)));
      g.globalAlpha = 1;
    }
    // black fade at both ends
    if (fade < 1) { g.fillStyle = `rgba(0,0,0,${1 - Math.max(0, fade)})`; g.fillRect(0, 0, w, h); }
  }

  return {
    supported,
    get active() { return !!st; },
    get phase() { return st?.phase ?? null; },
    start(opts) {
      if (!supported || st) return;
      const size = SIZES[opts.res] ?? SIZES[720];
      const { camera, controls } = ctx;
      st = {
        opts, size, phase: 'count', t0: performance.now(),
        a0: Math.atan2(camera.position.x, camera.position.z),
        saved: { pos: camera.position.clone(), target: controls.target.clone(), autoRotate: controls.autoRotate },
        startedMusic: false,
      };
      if (opts.music && !sound.isOn()) { sound.start(); st.startedMusic = true; }
      controls.enabled = false; controls.autoRotate = false;
      canvas.width = size.w; canvas.height = size.h; canvas.hidden = false;
      document.body.classList.add('recording');
      $('rec-ui').hidden = false;
      ctx.setRecSize(size);
    },
    stop,
    /** Call each frame before rendering: moves the camera along the chosen path. */
    update() {
      if (!st) return;
      const el = performance.now() - st.t0;
      if (st.phase === 'count' && el >= COUNTDOWN_MS) begin();
      const p = st.phase === 'record' ? Math.min((performance.now() - st.t0) / (st.opts.seconds * 1000), 1) : 0;
      const { pos, look } = (STYLES[st.opts.style] ?? STYLES.orbit)(p, st.a0);
      ctx.camera.position.copy(pos);
      ctx.camera.lookAt(look);
      if (st.phase === 'record') {
        const s = Math.floor((performance.now() - st.t0) / 1000), tot = st.opts.seconds;
        const f = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
        $('rec-time').textContent = `${f(s)} / ${f(tot)}`;
        if (p >= 1 && st.mr && st.mr.state === 'recording') stop(false);
      } else $('rec-time').textContent = t('rv.ready');
    },
    /** Call right after the 3D frame is rendered: copies it (plus overlays) into the recording canvas. */
    frame() {
      if (!st) return;
      const { w, h } = st.size;
      g.drawImage(ctx.glCanvas, 0, 0, w, h);
      if (st.phase === 'record') {
        const elapsed = (performance.now() - st.t0) / 1000;
        drawOverlays(w, h, elapsed / st.opts.seconds, elapsed);
      } else { // countdown: shown in the preview only, nothing is being recorded yet
        const left = Math.ceil((COUNTDOWN_MS - (performance.now() - st.t0)) / 1000);
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${h * 0.14}px system-ui, sans-serif`;
        g.fillText(String(Math.max(left, 1)), w / 2, h / 2);
      }
    },
  };
}
