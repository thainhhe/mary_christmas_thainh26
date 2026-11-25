import * as THREE from 'three';
import { $, me, store, bus, toast, SHIRTS, HATS } from './state.js';
import { t, apply, setLang, getLang, onLang } from './i18n.js';
import { now, nextOccurrence, EVENTS, nextSantaMs } from './clock.js';
import { api, send } from './net.js';
import { createPerson } from './avatars.js';
import { track } from './analytics.js';

const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  kids.flat().forEach((c) => { if (c != null) el.append(c.nodeType ? c : document.createTextNode(c)); });
  return el;
};

export function initUI(ctx) {
  /* ---------- Generic modal ---------- */
  const modal = $('modal'), mBody = $('modal-body'), mTitle = $('modal-title');
  let rerender = null;
  function openModal(titleKey, render) {
    hideAsk();
    mTitle.textContent = t(titleKey);
    rerender = () => { mTitle.textContent = t(titleKey); mBody.replaceChildren(); render(mBody); };
    rerender();
    closeMenu();
    if (!modal.open) modal.showModal();
  }
  $('modal-close').addEventListener('click', () => modal.close());
  modal.addEventListener('close', () => { rerender = null; });
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });

  /* ---------- Presence ---------- */
  let presence = null;
  function renderPresence() {
    const el = $('presence');
    if (!presence) { el.textContent = t('p.off'); $('dot').classList.add('off'); return; }
    $('dot').classList.remove('off');
    el.replaceChildren(t(presence.online === 1 ? 'p.here1' : 'p.here', { n: presence.online }), h('span', { class: 'dim', text: ` · ${t('p.today', { n: presence.today })}` }));
  }
  const setPresence = (p) => { presence = p; renderPresence(); };

  /* ---------- Menu ---------- */
  const menu = $('menu');
  function closeMenu() { menu.hidden = true; }
  function fmtIn(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 90) return t('x.sec', { n: s });
    if (s < 3600) return t('x.min', { n: Math.round(s / 60) });
    if (s < 86400 * 2) return t('x.hour', { n: Math.round(s / 3600) });
    return t('x.day', { n: Math.round(s / 86400) });
  }
  function renderEvents() {
    const list = $('events');
    list.replaceChildren();
    const row = (icon, title, desc, when, key) => h('li', {}, h('span', { class: 'ei', text: icon }), h('div', { class: 'et' }, h('b', { text: title }), h('small', { text: desc })), h('span', { class: 'ew', text: when }));
    list.append(row('🛷', t('ev.santa'), t('ev.santa.d'), t('ev.in', { x: fmtIn(nextSantaMs()) })));
    const icons = { carol: '🎶', quiet: '🌙', eve: '🎄' };
    const items = EVENTS.map((e) => ({ e, o: nextOccurrence(...e.args) })).filter((x) => x.o).sort((a, b) => a.o.start - b.o.start);
    for (const { e, o } of items) {
      const when = o.live ? t('x.now') : `${o.start.toLocaleTimeString(getLang() === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' })} · ${o.start.getDate()}/${o.start.getMonth() + 1}`;
      list.append(row(icons[e.id], t(`ev.${e.id}`), t(`ev.${e.id}.d`), when));
    }
  }
  async function refreshMenuMeta() {
    $('m-wishes-d').textContent = t('m.wishes.d', { n: ctx.getWishes().length });
    try { const s = await api(`/api/santa?cid=${me.cid}`); $('m-santa-d').textContent = t('m.santa.d', { n: s.count }); } catch { $('m-santa-d').textContent = '—'; }
  }
  let menuTimer = 0;
  $('menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    if (!menu.hidden) { renderEvents(); refreshMenuMeta(); clearInterval(menuTimer); menuTimer = setInterval(() => { if (menu.hidden) clearInterval(menuTimer); else renderEvents(); }, 5000); }
  });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
  $('lang-vi').addEventListener('click', () => { if (getLang() !== 'vi') track('lang_switch'); setLang('vi'); });
  $('lang-en').addEventListener('click', () => { if (getLang() !== 'en') track('lang_switch'); setLang('en'); });
  const markLang = () => { $('lang-vi').setAttribute('aria-pressed', String(getLang() === 'vi')); $('lang-en').setAttribute('aria-pressed', String(getLang() === 'en')); };
  markLang();
  onLang(() => { markLang(); renderPresence(); renderEvents(); renderChatLog(); refreshMenuMeta(); updateChatState(); rerender?.(); });

  /* ---------- Join dialog (with live avatar preview) ---------- */
  const dlgJoin = $('dlg-join'), nameEl = $('j-name'), shirtsEl = $('j-shirts'), hatsEl = $('j-hats');
  let draft = { shirt: me.shirt, hat: me.hat };
  let preview = null;
  function swatches(el, colors, key) {
    el.replaceChildren();
    colors.forEach((c, i) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-label': `${i + 1}`, 'aria-checked': String(draft[key] === c), style: `--c:${c}` });
      b.addEventListener('click', () => { draft[key] = c; swatches(el, colors, key); preview?.set(draft); });
      el.append(b);
    });
  }
  // One renderer for the whole session: a canvas whose WebGL context was lost can never get a new one,
  // so the preview must not be torn down (forceContextLoss) when the dialog closes.
  let kit = null;
  function getKit() {
    if (kit) return kit;
    const canvas = $('j-canvas');
    const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(150, 150, false);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight('#ffffff', '#6a7fb0', 1.5));
    const dl = new THREE.DirectionalLight('#ffffff', 2); dl.position.set(2, 3, 4); sc.add(dl);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); cam.position.set(0, 0.85, 3.6); cam.lookAt(0, 0.78, 0);
    const p = createPerson({ ...draft, name: '' });
    p.userData.label.visible = false; p.scale.setScalar(1.45); p.position.y = -0.18;
    sc.add(p);
    kit = { r, sc, cam, p };
    return kit;
  }
  function startPreview() {
    const { r, sc, cam, p } = getKit();
    let raf = 0;
    const loop = () => { p.rotation.y = Math.sin(performance.now() / 900) * 0.5; r.render(sc, cam); raf = requestAnimationFrame(loop); };
    loop();
    return {
      set({ shirt, hat }) { p.userData.parts.body.material.color.set(shirt); p.userData.parts.cone.material.color.set(hat); p.userData.parts.scarf.material.color.set(hat); },
      dispose() { cancelAnimationFrame(raf); },
    };
  }
  function openJoin() {
    draft = { shirt: me.shirt, hat: me.hat };
    nameEl.value = me.name;
    swatches(shirtsEl, SHIRTS, 'shirt'); swatches(hatsEl, HATS, 'hat');
    dlgJoin.showModal();
    try { preview = startPreview(); preview.set(draft); } catch (e) { preview = null; console.warn('avatar preview unavailable', e); } // the dialog still works without it
    nameEl.focus();
  }
  dlgJoin.addEventListener('close', () => { preview?.dispose(); preview = null; });
  $('join-btn').addEventListener('click', openJoin);
  $('j-close').addEventListener('click', () => dlgJoin.close());
  $('j-watch').addEventListener('click', () => dlgJoin.close());
  $('j-terms').addEventListener('click', (e) => { e.preventDefault(); openTerms(); });
  $('j-go').addEventListener('click', () => {
    me.name = nameEl.value.trim().slice(0, 24) || (getLang() === 'vi' ? 'Khách' : 'Guest');
    me.shirt = draft.shirt; me.hat = draft.hat;
    store.set('noel.name', me.name); store.set('noel.shirt', me.shirt); store.set('noel.hat', me.hat);
    dlgJoin.close();
    track('join');
    ctx.join({ name: me.name, shirt: me.shirt, hat: me.hat });
  });
  nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('j-go').click(); } });

  /* ---------- Chat ---------- */
  const chatPanel = $('chat'), chatLog = $('chat-log'), chatInput = $('chat-input'), badge = $('chat-badge');
  const history = [];
  let unread = 0;
  function renderChatLog() {
    chatLog.replaceChildren();
    if (!history.length) chatLog.append(h('li', { class: 'empty', text: t('chat.empty') }));
    for (const m of history) chatLog.append(h('li', { class: m.mine ? 'mine' : '' }, h('b', { text: m.name }), ' ', m.text));
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  let pending = null; // the message we sent and are still waiting to see echoed back by the server
  function addChat(m) {
    if (m.id === me.pid && pending) { clearTimeout(pending.timer); pending = null; }
    history.push({ ...m, mine: m.id === me.pid });
    if (history.length > 60) history.shift();
    if (chatPanel.hidden && m.id !== me.pid) { unread++; badge.textContent = String(unread); badge.hidden = false; }
    renderChatLog();
  }
  function updateChatState() {
    chatInput.disabled = !me.joined;
    chatInput.placeholder = me.joined ? t('chat.ph') : t('chat.need');
    $('chat-send').disabled = !me.joined;
  }
  $('chat-btn').addEventListener('click', () => {
    chatPanel.hidden = !chatPanel.hidden;
    if (!chatPanel.hidden) { unread = 0; badge.hidden = true; renderChatLog(); if (me.joined) chatInput.focus(); }
  });
  $('chat-close').addEventListener('click', () => { chatPanel.hidden = true; });
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !me.joined) return;
    // Not connected, or reconnected but the server has not confirmed our player yet: keep the text and say so.
    if (!me.ready || !send({ type: 'chat', text })) { toast(t('toast.chatwait')); return; }
    chatInput.value = '';
    if (pending) clearTimeout(pending.timer);
    // The server echoes every accepted message back; if that never arrives the message was lost (dead connection): give the text back.
    pending = { text, timer: setTimeout(() => { pending = null; if (!chatInput.value) chatInput.value = text; toast(t('toast.chatlost'), 3500); }, 5000) };
    bus.emit('chat');
  });
  renderChatLog(); updateChatState();

  /* ---------- Missions (per-day, stored locally) ---------- */
  const MISSIONS = [['wish', 1], ['chat', 1], ['gift', 1], ['walk', 100], ['photo', 1]];
  const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  function missionState() {
    const s = store.get('noel.missions', null);
    return s && s.day === dayKey() ? s : { day: dayKey(), prog: {}, claimed: {} };
  }
  function progress(id, n = 1) {
    const s = missionState();
    const goal = MISSIONS.find((m) => m[0] === id)[1];
    s.prog[id] = Math.min(goal, (s.prog[id] ?? 0) + n);
    store.set('noel.missions', s);
    if (modal.open && mTitle.dataset.k === 'ms') rerender?.();
  }
  for (const [id] of MISSIONS) bus.on(id, (n) => progress(id, typeof n === 'number' ? n : 1));
  function renderMissions(body) {
    mTitle.dataset.k = 'ms';
    const s = missionState();
    const candy = store.get('noel.candy', 0);
    body.append(h('p', { class: 'dim', text: `🍬 ${t('ms.candy')}: ${candy}` }));
    const ul = h('ul', { class: 'rows' });
    for (const [id, goal] of MISSIONS) {
      const p = Math.floor(s.prog[id] ?? 0), done = p >= goal, claimed = !!s.claimed[id];
      const btn = h('button', { class: claimed ? '' : 'primary sm', text: claimed ? t('ms.done') : t('ms.claim'), ...(done && !claimed ? {} : { disabled: '' }) });
      btn.addEventListener('click', () => { track('mission_claim'); const st = missionState(); st.claimed[id] = true; store.set('noel.missions', st); store.set('noel.candy', store.get('noel.candy', 0) + 5); rerender(); });
      ul.append(h('li', {}, h('div', { class: 'grow' }, h('b', { text: t(`ms.${id}`) }),
        h('div', { class: 'bar-bg' }, h('i', { style: `width:${Math.min(100, (p / goal) * 100)}%` })), h('small', { text: `${p}/${goal}` })), btn));
    }
    body.append(ul, h('p', { class: 'dim', text: t('ms.reset') }));
  }
  $('menu-missions').addEventListener('click', () => openModal('ms.title', renderMissions));

  /* ---------- Leaderboard ---------- */
  let boardCache = null;
  async function loadBoard() {
    try { boardCache = await api(`/api/leaderboard?cid=${me.cid}`); ctx.setBoard(boardCache.top); } catch { /* offline */ }
    return boardCache;
  }
  async function renderBoard(body) {
    mTitle.dataset.k = 'lb';
    body.append(h('p', { class: 'dim', text: t('lb.sub') }));
    const data = await loadBoard();
    if (!modal.open || mTitle.dataset.k !== 'lb') return;
    if (!data || !data.top.length) { body.append(h('p', { class: 'empty', text: t('lb.empty') })); return; }
    const ul = h('ul', { class: 'rows lb' });
    data.top.forEach((r, i) => ul.append(h('li', {}, h('span', { class: 'rk', text: ['🥇', '🥈', '🥉'][i] ?? `${i + 1}` }), h('b', { class: 'grow', text: r.name }), h('span', { text: `${r.points} ${t('lb.pts')}` }))));
    body.append(ul);
    if (data.me) body.append(h('p', { class: 'dim', text: `${t('lb.you')}: #${data.me.rank} · ${data.me.points} ${t('lb.pts')}` }));
  }
  const openBoard = () => openModal('lb.title', renderBoard);
  $('menu-board').addEventListener('click', openBoard);
  $('board-btn').addEventListener('click', openBoard);

  /* ---------- Secret Santa ---------- */
  async function renderSanta(body) {
    mTitle.dataset.k = 'ss';
    let s;
    try { s = await api(`/api/santa?cid=${me.cid}`); } catch { body.append(h('p', { class: 'empty', text: t('p.off') })); return; }
    if (!modal.open || mTitle.dataset.k !== 'ss') return;
    const when = new Date(s.drawAt).toLocaleString(getLang() === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
    body.append(h('p', { text: t('ss.desc', { time: when }) }), h('p', { class: 'dim', text: t('ss.count', { n: s.count }) }));
    const act = async (path, bodyObj) => { try { await api(path, bodyObj); if (path.endsWith('/join')) track('santa_join'); } catch (e) { if (e.status !== 409) toast(t('toast.conn')); } rerender(); };
    if (s.drawn) {
      if (s.joined && s.recipient) body.append(h('div', { class: 'callout' }, h('small', { text: t('ss.recipient') }), h('b', { text: `🎁 ${s.recipient}` })));
      else body.append(h('p', { class: 'dim', text: s.joined ? t('ss.norec') : t('ss.late') }));
      return;
    }
    if (s.joined) {
      body.append(h('p', { class: 'ok', text: t('ss.joined') }));
      if (s.count < 3) body.append(h('p', { class: 'dim', text: t('ss.need3') }));
      body.append(h('button', { text: t('ss.leave'), onclick: () => act('/api/santa/leave', { cid: me.cid }) }));
    } else {
      const input = h('input', { maxlength: '24', placeholder: t('ss.name'), value: me.name });
      body.append(input, h('button', { class: 'primary', text: t('ss.join'), onclick: () => { const name = input.value.trim(); if (name) act('/api/santa/join', { cid: me.cid, name }); } }));
    }
  }
  $('menu-santa').addEventListener('click', () => openModal('ss.title', renderSanta));

  /* ---------- Photo card ---------- */
  function renderPhoto(body) {
    mTitle.dataset.k = 'ph';
    const shot = ctx.capture();
    const card = h('canvas', { class: 'card' });
    const greet = h('input', { maxlength: '60', value: t('ph.def') });
    const draw = () => {
      const W = 1280, H = Math.round((W * shot.height) / shot.width);
      card.width = W; card.height = H;
      const g = card.getContext('2d');
      g.drawImage(shot, 0, 0, W, H);
      const grad = g.createLinearGradient(0, H * 0.62, 0, H); grad.addColorStop(0, 'rgba(5,11,26,0)'); grad.addColorStop(1, 'rgba(5,11,26,.88)');
      g.fillStyle = grad; g.fillRect(0, H * 0.62, W, H * 0.38);
      g.textAlign = 'center'; g.fillStyle = '#f7b955'; g.font = '700 30px system-ui, sans-serif';
      g.fillText(`✦ ${t('ph.title.card')} ✦`, W / 2, H - 138);
      g.fillStyle = '#ffffff'; g.font = '800 58px system-ui, sans-serif';
      g.fillText(greet.value || t('ph.def'), W / 2, H - 70);
      g.fillStyle = '#a9bfe0'; g.font = '500 26px system-ui, sans-serif';
      const target = new Date(now().getFullYear(), 11, 25), days = Math.max(0, Math.ceil((target - now()) / 864e5));
      g.fillText(`${me.name ? `${me.name} · ` : ''}${t('ph.days', { n: days })}`, W / 2, H - 28);
    };
    greet.addEventListener('input', draw);
    draw();
    const dl = h('button', { class: 'primary', text: `⬇ ${t('ph.dl')}` });
    dl.addEventListener('click', () => {
      const a = h('a', { href: card.toDataURL('image/png'), download: 'noel-card.png' });
      document.body.append(a); a.click(); a.remove();
      bus.emit('photo'); toast(t('toast.photo'));
    });
    body.append(card, h('label', {}, h('small', { text: t('ph.greet') }), greet), h('div', { class: 'row' }, h('button', { text: t('ph.retake'), onclick: () => rerender() }), dl));
  }
  $('menu-photo').addEventListener('click', () => openModal('ph.title', renderPhoto));

  /* ---------- Video recording ---------- */
  const touch = matchMedia("(pointer: coarse)").matches;
  const recOpts = { seconds: 15, style: "orbit", res: touch ? "720" : "1080", music: true, fireworks: false, santa: false, days: true, caption: null, ...store.get("noel.rec", {}) };
  function renderVideo(body) {
    mTitle.dataset.k = "rv";
    if (!ctx.recSupported()) { body.append(h("p", { class: "empty", text: t("rv.unsupported") })); return; }
    if (recOpts.caption === null) recOpts.caption = t("ph.title.card");
    const field = (label, el) => h("div", { class: "field" }, h("small", { text: label }), el);
    const segEl = (key, items) => {
      const wrap = h("div", { class: "seg" });
      items.forEach(([v, label]) => {
        const b = h("button", { type: "button", "aria-pressed": String(recOpts[key] === v), text: label });
        b.addEventListener("click", () => { recOpts[key] = v; wrap.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); });
        wrap.append(b);
      });
      return wrap;
    };
    const check = (key, label) => { const i = h("input", { type: "checkbox" }); i.checked = !!recOpts[key]; i.addEventListener("change", () => { recOpts[key] = i.checked; }); return h("label", { class: "chk" }, i, label); };
    const cap = h("input", { maxlength: "60", value: recOpts.caption, placeholder: t("rv.caption.ph") });
    cap.addEventListener("input", () => { recOpts.caption = cap.value; });
    body.append(
      h("p", { class: "dim", text: t("rv.tip") }),
      field(t("rv.style"), segEl("style", [["orbit", t("rv.s1")], ["rise", t("rv.s2")], ["stroll", t("rv.s3")]])),
      field(t("rv.dur"), segEl("seconds", [[10, "10s"], [15, "15s"], [30, "30s"], [60, "60s"]])),
      field(t("rv.res"), segEl("res", [["720", "720p"], ["1080", "1080p"]])),
      h("div", { class: "checks" }, check("music", t("rv.music")), check("fireworks", t("rv.fw")), check("santa", t("rv.santa")), check("days", t("rv.days"))),
      field(t("rv.caption"), cap),
      h("button", { class: "primary wide", text: "● " + t("rv.start"), onclick: () => { store.set("noel.rec", recOpts); modal.close(); track("video_start"); ctx.record({ ...recOpts, caption: (recOpts.caption || "").trim() }); } }),
    );
  }
  $("menu-video").addEventListener("click", () => openModal("rv.title", renderVideo));
  function showVideoResult(blob, ext) {
    track("video_done");
    const url = URL.createObjectURL(blob), file = new File([blob], "noel-christmas." + ext, { type: blob.type });
    openModal("rv.done", (body) => {
      mTitle.dataset.k = "rv2";
      const row = h("div", { class: "row spread" }, h("button", { text: t("rv.again"), onclick: () => openModal("rv.title", renderVideo) }));
      const right = h("div", { class: "row" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) right.append(h("button", { text: t("rv.share"), onclick: () => navigator.share({ files: [file], title: document.title }).catch(() => {}) }));
      right.append(h("a", { class: "btn", href: url, download: "noel-christmas." + ext, text: "⬇ " + t("rv.dl") }));
      row.append(right);
      body.append(h("video", { class: "vid", src: url, controls: "", playsinline: "", autoplay: "", muted: "", loop: "" }), row);
      if (!fbState().sent) { // the best moment to ask: they just made something
        fbSave({ asked: Date.now() });
        body.append(h("div", { class: "fb-line" }, h("span", { class: "dim", text: t("fb.ask") }), h("button", { type: "button", class: "primary sm", text: t("fb.ask.go"), onclick: () => openFeedback("video") })));
      }
      if (ext === "webm") body.append(h("p", { class: "dim", text: t("rv.webm") }));
    });
    modal.addEventListener("close", () => URL.revokeObjectURL(url), { once: true });
  }

  /* ---------- Guide / Terms / Wishes list ---------- */
  function openTerms() {
    openModal('tm.title', (body) => { mTitle.dataset.k = 'tm'; body.append(h('ul', { class: 'bullets' }, t('tm.body').map((x) => h('li', { text: x })))); });
  }
  $('menu-terms').addEventListener('click', openTerms);
  $('menu-guide').addEventListener('click', () => openModal('gd.title', (body) => {
    mTitle.dataset.k = 'gd';
    t('gd.body').forEach(([title, text]) => body.append(h('div', { class: 'gd' }, h('b', { text: title }), h('p', { text }))));
  }));
  $('menu-wishes').addEventListener('click', () => openModal('wl.title', (body) => {
    mTitle.dataset.k = 'wl';
    const ul = h('ul', { class: 'rows wishes' });
    [...ctx.getWishes()].reverse().forEach((g) => {
      const { name, wish, color } = g.userData.o;
      ul.append(h('li', {}, h('button', { onclick: () => { modal.close(); ctx.focusWish(g); } },
        h('i', { class: 'swatch', style: `background:${color}` }), h('span', {}, h('b', { text: name || t('w.anon') }), h('em', { text: wish })))));
    });
    body.append(ul);
  }));

  /* ---------- Feedback (menu item + one-time invitation after hanging a wish / recording a video) ---------- */
  const fbState = () => store.get('noel.fb', { asked: 0, sent: false });
  const fbSave = (patch) => store.set('noel.fb', { ...fbState(), ...patch });
  function renderFeedback(body, from) {
    mTitle.dataset.k = 'fb';
    let rating = 0;
    const faces = h('div', { class: 'fb-rate', role: 'radiogroup', 'aria-label': t('fb.sub') });
    for (const [v, emoji] of [[4, '😍'], [3, '🙂'], [2, '😐'], [1, '😞']]) {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': 'false' }, h('span', { class: 'e', text: emoji }), t(`fb.r${v}`));
      b.addEventListener('click', () => { rating = v; faces.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); });
      faces.append(b);
    }
    const text = h('textarea', { maxlength: '500', rows: '4', placeholder: t('fb.text.ph') });
    const contact = h('input', { maxlength: '100', autocomplete: 'off', placeholder: t('fb.contact.ph') });
    const trap = h('input', { class: 'hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }); // honeypot: real people never fill it
    const msg = h('div', { class: 'fb-msg', role: 'alert' });
    const btn = h('button', { type: 'submit', class: 'primary wide', text: t('fb.send') });
    const form = h('form', { novalidate: '' },
      h('p', { class: 'dim', text: t('fb.sub') }), faces,
      h('label', {}, h('small', { text: t('fb.text') }), text),
      h('label', {}, h('small', { text: t('fb.contact') }), contact), trap,
      h('p', { class: 'fb-note', text: t('fb.privacy') }), msg, btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const txt = text.value.trim();
      if (!rating && !txt) { msg.textContent = t('fb.need'); return; }
      btn.disabled = true; msg.textContent = '';
      try {
        await api('/api/feedback', { r: rating, text: txt, contact: contact.value.trim(), website: trap.value, lang: getLang(), from });
        fbSave({ asked: Date.now(), sent: true });
        track('feedback_sent');
        body.replaceChildren(h('div', { class: 'thanks' }, h('b', { text: t('fb.thanks') }), h('p', { class: 'dim', text: t('fb.thanks.d') }),
          h('button', { type: 'button', class: 'primary wide', text: t('close'), onclick: () => modal.close() })));
      } catch (err) { msg.textContent = err.status === 429 ? t('fb.fast') : t('fb.fail'); btn.disabled = false; }
    });
    body.append(form);
  }
  function openFeedback(from = 'menu') { track('feedback_open'); openModal('fb.title', (body) => renderFeedback(body, from)); }
  $('menu-feedback').addEventListener('click', () => openFeedback('menu'));

  const ask = $('fb-ask');
  let askTimer = 0, askHide = 0;
  function hideAsk() { clearTimeout(askHide); ask.hidden = true; }
  function askFeedback(from) { // at most once per person, a few seconds after something good happened
    const s = fbState();
    if (s.asked || s.sent) return;
    clearTimeout(askTimer);
    askTimer = setTimeout(() => {
      if (document.querySelector('dialog[open]') || document.body.classList.contains('recording') || fbState().asked) return;
      fbSave({ asked: Date.now() });
      ask.dataset.from = from; ask.hidden = false;
      clearTimeout(askHide); askHide = setTimeout(hideAsk, 15000);
    }, 4500);
  }
  $('fb-ask-go').addEventListener('click', () => { hideAsk(); openFeedback(ask.dataset.from || 'wish'); });
  $('fb-ask-later').addEventListener('click', hideAsk);
  bus.on('wish', () => askFeedback('wish'));

  /* ---------- Hang-an-ornament dialog ---------- */
  const dlg = $('dlg'), wishName = $('name'), wishEl = $('wish'), colorsEl = $('colors');
  let chosen = ctx.wishColors[0];
  ctx.wishColors.forEach((c, i) => {
    const b = h('button', { type: 'button', role: 'radio', 'aria-label': `${i + 1}`, 'aria-checked': String(i === 0), style: `--c:${c}` });
    b.addEventListener('click', () => { chosen = c; colorsEl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); });
    colorsEl.append(b);
  });
  $('add').addEventListener('click', () => { wishName.value = me.name; dlg.showModal(); wishEl.focus(); });
  $('cancel').addEventListener('click', () => dlg.close());
  $('form').addEventListener('submit', async () => {
    const wish = wishEl.value.trim();
    if (!wish) return;
    if (await ctx.hang({ name: wishName.value.trim().slice(0, 24), wish: wish.slice(0, 120), color: chosen })) wishEl.value = '';
  });

  /* ---------- Misc buttons ---------- */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* no Clipboard API (plain http) or no permission */ }
    const ta = h('textarea', { readonly: '', style: 'position:fixed;left:-9999px;top:0;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
  $('share').addEventListener('click', async () => {
    track('share');
    if (navigator.share) {
      try { await navigator.share({ title: document.title, url: location.href }); return; } catch (e) { if (e?.name === 'AbortError') return; /* otherwise fall back to copying */ }
    }
    toast(await copyText(location.href) ? t('toast.copied') : t('toast.copyfail'), 4200);
  });

  apply();
  renderPresence();
  return { showVideoResult, setPresence, addChat, updateChatState, loadBoard, openBoard, setHistory(list) { history.length = 0; list.forEach((m) => history.push({ ...m, mine: false })); renderChatLog(); } };
}
