import { $, store } from './state.js';
import { t, onLang } from './i18n.js';

/**
 * The welcome popup: shown once to new visitors (and again from Menu -> Guide) to introduce the three places worth visiting:
 * the Christmas tree, the market with its 12 mini-games, and the tarot caravan. Once you have an avatar each place gets a
 * "Take me there" button that walks you along the road.
 */
const KEY = 'noel.welcome.v1';
const AREAS = [
  { id: 'tree', icon: '🎄', t: 'wc.tree.t', d: 'wc.tree.d' },
  { id: 'market', icon: '🎪', t: 'wc.mk.t', d: 'wc.mk.d' },
  { id: 'tarot', icon: '🔮', t: 'wc.tr.t', d: 'wc.tr.d' },
];

export function initWelcome({ isJoined, walkTo, openJoin }) {
  const dlg = $('dlg-welcome'), body = $('wc-body');
  const h = (tag, props = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v); } el.append(...kids.flat().filter((c) => c != null)); return el; };

  function render() {
    $('wc-title').textContent = t('wc.title');
    const joined = isJoined();
    const cards = AREAS.map((a) => h('div', { class: 'wc-card' },
      h('div', { class: 'ic', text: a.icon }),
      h('div', { class: 'tx' }, h('b', { text: t(a.t) }), h('p', { text: t(a.d) }),
        joined ? h('button', { type: 'button', class: 'primary sm wc-go', text: t('wc.go'), onclick: () => { dlg.close(); walkTo(a.id); } }) : null)));
    body.replaceChildren(
      h('p', { class: 'wc-sub', text: t('wc.sub') }), ...cards, h('p', { class: 'wc-tip dim', text: t(joined ? 'wc.tip.joined' : 'wc.tip') }),
      ...(joined
        ? [h('button', { type: 'button', class: 'primary wide', text: t('wc.close'), onclick: () => dlg.close() })]
        : [h('button', { type: 'button', class: 'primary wide', text: t('wc.join'), onclick: () => { dlg.close(); openJoin(); } }), h('button', { type: 'button', class: 'link wide', text: t('wc.later'), onclick: () => dlg.close() })]));
  }

  $('wc-close').addEventListener('click', () => dlg.close());
  onLang(() => { if (dlg.open) render(); });

  function show() {
    if (document.querySelector('dialog[open]')) return false;
    render();
    dlg.showModal();
    return true;
  }
  return {
    show,
    /** Once per browser: opens by itself the first time someone visits. */
    showFirstTime() {
      if (store.get(KEY, false)) return;
      if (show()) store.set(KEY, true);
    },
  };
}
