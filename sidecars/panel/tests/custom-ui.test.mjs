import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const require = createRequire(import.meta.url);
const createTheme = require('../../../compat/theme.cjs');
const createI18n = require('../../../compat/i18n.cjs');
const installInline = require('../../../compat/inline-widget.cjs');

function makeStyleStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  const api = {
    getPropertyValue(name) { return map.get(name) ?? ''; },
    setProperty(name, value) { map.set(name, String(value)); },
    removeProperty(name) { map.delete(name); },
    dump() { return Object.fromEntries(map); },
  };
  return new Proxy(api, {
    get(target, prop) { return prop in target ? target[prop] : (map.get(String(prop)) ?? ''); },
    set(_target, prop, value) { map.set(String(prop), String(value)); return true; },
  });
}

function makeCanvasContext() {
  let fill = 'transparent';
  const parse = c => {
    const raw = String(c || '').trim();
    const h = raw.match(/^#([0-9a-f]{6})$/i);
    if (h) {
      const n = parseInt(h[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
    }
    const r = raw.match(/^rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/i);
    if (r) {
      const a = r[4] === undefined ? 255 : Math.round((r[4].endsWith('%') ? Number(r[4].slice(0, -1)) / 100 : Number(r[4])) * 255);
      return [Number(r[1]), Number(r[2]), Number(r[3]), a];
    }
    return [0, 0, 0, 0];
  };
  return {
    set fillStyle(v) { fill = v; },
    get fillStyle() { return fill; },
    clearRect() { fill = 'transparent'; },
    fillRect() {},
    getImageData() { return { data: parse(fill) }; },
  };
}

test('theme adapter adopts Antigravity translucent borders, primary accent, and live body/editor fonts', () => {
  const hostVars = {
    '--background': '#FFFFFF',
    '--card': '#FFFFFF',
    '--foreground': '#0A0A0C',
    '--card-border': 'rgb(10 10 12 / 0.07)',
    '--border': 'rgb(10 10 12 / 0.06)',
    '--secondary': 'rgb(10 10 12 / 0.06)',
    '--secondary-foreground': '#3F3F46',
    '--muted-foreground': '#71717A',
    '--primary': '#2F75C3',
    '--editor-font-family': '"Google Sans Code", monospace',
  };
  let bodyFont = '"Google Sans Flex", "Google Sans", system-ui, sans-serif';
  let themeClass = 'theme-light';
  const makeHostEl = () => ({
    nodeType: 1,
    getAttribute: () => null,
    classList: { contains: c => c === themeClass },
  });
  const rootEl = makeHostEl();
  const bodyEl = makeHostEl();
  const targetStyle = makeStyleStore();
  const target = {
    dataset: {},
    style: targetStyle,
    ownerDocument: {
      documentElement: rootEl,
      body: bodyEl,
      createElement: tag => tag === 'canvas' ? { width: 1, height: 1, getContext: () => makeCanvasContext() } : {},
    },
  };
  const prevGetComputed = globalThis.getComputedStyle;
  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;
  const prevMatchMedia = globalThis.matchMedia;
  const prevObserver = globalThis.MutationObserver;
  const prevCSS = globalThis.CSS;
  const mm = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.document = target.ownerDocument;
  globalThis.getComputedStyle = el => el === bodyEl
    ? { fontFamily: bodyFont, getPropertyValue: () => '' }
    : { fontFamily: 'system-ui', colorScheme: themeClass === 'theme-dark' ? 'dark' : 'light', getPropertyValue: k => hostVars[k] ?? '' };
  globalThis.matchMedia = mm;
  globalThis.window = { matchMedia: mm };
  globalThis.CSS = { supports: () => true };
  globalThis.MutationObserver = class { observe() {} disconnect() {} };

  let controller;
  try {
    const theme = createTheme();
    controller = theme.attach(target, { embedded: true });
    const light = targetStyle.dump();
    assert.equal(light['--pulse-font'], bodyFont);
    assert.equal(light['--pulse-mono'], '"Google Sans Code", monospace');
    assert.equal(light['--pulse-accent'], 'rgb(47 117 195)');
    assert.equal(light['--pulse-border'], 'rgb(238 238 238)');
    assert.equal(light['--pulse-hover'], 'rgb(240 240 240)');
    assert.ok(light['--pulse-card-shadow'].includes('rgba(0,0,0,0.08)'));

    themeClass = 'theme-dark';
    bodyFont = 'Inter, system-ui, sans-serif';
    hostVars['--background'] = '#141617';
    hostVars['--card'] = '#1a1d1f';
    hostVars['--foreground'] = '#d4be98';
    hostVars['--primary'] = '#e78a4e';
    hostVars['--card-border'] = 'rgb(255 255 255 / 0.1)';
    hostVars['--secondary'] = 'rgb(255 255 255 / 0.08)';
    controller.setHostTheme({ mode: 'dark', dark: { background: '#141617', primary: '#e78a4e', foregroundOverride: '#d4be98' } });
    const dark = targetStyle.dump();
    assert.equal(target.dataset.pulseTheme, 'dark');
    assert.equal(dark['--pulse-font'], 'Inter, system-ui, sans-serif');
    assert.equal(dark['--pulse-accent'], 'rgb(231 138 78)');
    assert.ok(dark['--pulse-card-shadow'].includes('rgba(0,0,0,0.45)'));
  } finally {
    controller?.dispose();
    globalThis.getComputedStyle = prevGetComputed;
    globalThis.document = prevDocument;
    if (prevWindow === undefined) delete globalThis.window; else globalThis.window = prevWindow;
    if (prevCSS === undefined) delete globalThis.CSS; else globalThis.CSS = prevCSS;
    globalThis.matchMedia = prevMatchMedia;
    globalThis.MutationObserver = prevObserver;
  }
});

test('main entrypoint enables updater in runtime bridge and exposes update state in snapshot', () => {
  const mainUrl = new URL('../main.mjs', import.meta.url).href;
  const probe = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
    const captured = {};
    const native = Object.fromEntries(await Promise.all(['node:path', 'node:url', 'node:os'].map(async n => [n, await import(n)])));
    const context = createContext({
      process: { env: {}, exit() {}, on() {}, once() {} },
      console, URL, URLSearchParams,
      setInterval: () => ({ unref() {} }), clearInterval() {},
      setTimeout: () => ({ unref() {} }), clearTimeout() {},
    });
    const modules = {
      'node:fs': { readFileSync: f => String(f).endsWith('.cjs') ? 'module.exports = function() {};' : '{}' },
      'node:http': { createServer() { return { listen() {} }; } },
      'node:module': { createRequire: () => () => ({ css: () => '' }) },
      'store.mjs': { MetricsStore: class { async snapshot() { return { connection: 'live' }; } dispose() {} } },
      'usage.mjs': { DesktopUsage: class { async snapshot() { return {}; } dispose() {} }, UsageLedger: class {} },
      'runtime-ui.mjs': {
        RuntimeUi: class { health = {}; constructor(opts) { captured.runtimeOpts = opts; } },
        makeRendererSource: (_i18n, _widget, _theme, _token, _startedAt, prelude) => {
          captured.prelude = prelude;
          return '';
        },
      },
      'platform.mjs': { platformPaths: () => ({ data: 'fixture', settings: 'settings.json' }) },
      'preferences.mjs': { PreferencesStore: class { async snapshot() { return {}; } } },
      'sidecar-owner.mjs': { SidecarOwner: class { token = 't'; startedAt = 1; } },
      'host-theme.mjs': { readHostTheme: async () => ({}) },
      'updater.mjs': { AppUpdater: class { publicState() { return { state: 'available', currentVersion: '1.0.0', latestVersion: '1.0.1' }; } }, releaseRuntimeDirectory() {} },
    };
    const entry = new SourceTextModule(readFileSync(new URL(${JSON.stringify(mainUrl)}), 'utf8'), {
      context, identifier: ${JSON.stringify(mainUrl)}, initializeImportMeta(m) { m.url = ${JSON.stringify(mainUrl)}; },
    });
    await entry.link(async spec => {
      const key = spec.startsWith('node:') ? spec : spec.split('/').at(-1);
      const values = native[key] || modules[key];
      return new SyntheticModule(Object.keys(values), function () {
        for (const [k, v] of Object.entries(values)) this.setExport(k, v);
      }, { context });
    });
    await entry.evaluate();
    assert.ok(captured.runtimeOpts.updater && typeof captured.runtimeOpts.updater.publicState === 'function');
    assert.ok(!captured.prelude.includes('__agPulseUpdateFactory'));
    assert.ok(captured.prelude.includes('__agPulseUsageFactory'));
    const snap = await captured.runtimeOpts.snapshot({});
    assert.deepEqual(snap.update, { state: 'available', currentVersion: '1.0.0', latestVersion: '1.0.1' });
  `;
  const run = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', probe], {
    cwd: ROOT, encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
});

test('usage modal stylesheet avoids hardcoded Microsoft YaHei and sidecar disables right-pane web UI', () => {
  const usageSrc = readFileSync(join(ROOT, 'compat', 'usage-ui.cjs'), 'utf8');
  const sidecarManifest = JSON.parse(readFileSync(join(ROOT, 'sidecars', 'panel', 'sidecar.json'), 'utf8'));
  assert.ok(usageSrc.includes('var(--pulse-font,'));
  assert.ok(!usageSrc.includes('Microsoft YaHei'));
  assert.equal(sidecarManifest.has_web_ui, false);
  assert.equal(sidecarManifest.ui_config, undefined);
});

test('inline-widget source validates cleanly and contains zero update menu, quota group, or context language markup', () => {
  assert.equal(typeof installInline, 'function');
  const src = readFileSync(join(ROOT, 'compat', 'inline-widget.cjs'), 'utf8');
  assert.ok(!src.includes('__agPulseUpdateFactory'));
  assert.ok(!src.includes('group-trigger'));
  assert.ok(!src.includes('five-quota-section'));
  assert.ok(!src.includes('week-quota-section'));
  assert.ok(!src.includes('card-language'));
  assert.ok(!src.includes('language-guide'));
  assert.ok(!src.includes('Microsoft YaHei'));
  assert.ok(src.includes('__agPulseUsageFactory'));
  assert.ok(src.includes('ctx-seg-sys'));
  assert.ok(src.includes('ctx-seg-tools'));
  assert.ok(src.includes('ctx-seg-msg'));
  const lang = createI18n('zh-CN');
  assert.equal(lang.t('roundsCompact', { rounds: 2, steps: 44 }), '2 轮 44 步');
  assert.equal(lang.t('contextUsedLabel'), '上下文已用');
  assert.equal(lang.t('breakdownSystem'), '内置指令与工具集');
  assert.equal(lang.t('breakdownExtensions'), '规则、技能与 MCP');
  assert.equal(lang.t('breakdownTools'), '工具调用结果');
  assert.equal(lang.t('breakdownMessages'), '对话与思考');
  assert.equal(lang.t('breakdownOther'), '内置提示与未统计');
  assert.equal(lang.t('contextBreakdownHint'), '悬停分组查看具体说明。');
});

test('inline-widget executes mount + render for empty new session (0/0%) and active transcript breakdown + usage modal', async () => {
  const createdIds = new Map();
  const matchesCompound = (node, sel) => {
    const tokens = sel.match(/(?:[#.][a-zA-Z0-9_-]+|\[[^\]]+\]|^[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+)/g) || [];
    if (!tokens.length) return false;
    return tokens.every(tok => {
      if (tok.startsWith('#')) return node.id === tok.slice(1);
      if (tok.startsWith('.')) return node.className.split(/\s+/).includes(tok.slice(1));
      const eqAttr = tok.match(/^\[([^=\]]+)=["']?([^"'\]]+)["']?\]$/);
      if (eqAttr) {
        const [, attr, val] = eqAttr;
        if (attr.startsWith('data-')) {
          const camel = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          if (node.dataset?.[camel] === val) return true;
        }
        return node.attributes?.get(attr) === val;
      }
      const hasAttr = tok.match(/^\[([^\]=]+)\]$/);
      if (hasAttr) {
        const attr = hasAttr[1];
        if (attr.startsWith('data-')) {
          const camel = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          if (camel in (node.dataset || {})) return true;
        }
        return node.attributes?.has(attr) || false;
      }
      return node.tagName === tok.toUpperCase();
    });
  };
  const matchesChain = (node, rootScope, selector) => {
    const parts = selector.trim().split(/\s+/);
    if (!matchesCompound(node, parts[parts.length - 1])) return false;
    let cur = node.parentElement;
    for (let i = parts.length - 2; i >= 0; i--) {
      while (cur && cur !== rootScope && !matchesCompound(cur, parts[i])) cur = cur.parentElement;
      if (!cur || (cur === rootScope && !matchesCompound(cur, parts[i]))) return false;
      cur = cur.parentElement;
    }
    return true;
  };
  const collectDescendants = (rootEl) => {
    const out = [];
    for (const child of rootEl.children || []) {
      out.push(child);
      out.push(...collectDescendants(child));
    }
    return out;
  };
  const makeNode = (tag, ownerDoc) => {
    const attrs = new Map();
    const listeners = new Map();
    let _id = '';
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      get id() { return _id; },
      set id(v) { _id = String(v || ''); if (_id) createdIds.set(_id, el); },
      hidden: false,
      disabled: false,
      open: false,
      dataset: {},
      className: '',
      textContent: '',
      innerHTML: '',
      isConnected: true,
      children: [],
      style: makeStyleStore(),
      attributes: attrs,
      ownerDocument: ownerDoc,
      parentElement: null,
      parentNode: null,
      previousElementSibling: null,
      nextSibling: null,
      classList: {
        add(c) { el.className = `${el.className} ${c}`.trim(); },
        remove(c) { el.className = el.className.split(/\s+/).filter(x => x && x !== c).join(' '); },
        toggle(c, on) { if (on) el.classList.add(c); else el.classList.remove(c); },
        contains(c) { return el.className.split(/\s+/).includes(c); },
      },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      removeAttribute(k) { attrs.delete(k); },
      hasAttribute(k) { return attrs.has(k); },
      append(...nodes) { for (const n of nodes) if (n && typeof n === 'object') { n.parentElement = el; n.parentNode = el; el.children.push(n); } },
      after(...nodes) { el.parentElement?.append(...nodes); },
      before() {},
      insertBefore(n) { el.append(n); return n; },
      replaceChildren(...nodes) { el.children = []; el.append(...nodes); },
      remove() { el.isConnected = false; },
      closest: () => null,
      matches: () => false,
      getClientRects: () => [{ width: 20, height: 20 }],
      getBoundingClientRect: () => ({ left: 100, top: 300, right: 600, bottom: 328, width: 500, height: 28 }),
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      dispatch(type, event = {}) { for (const fn of listeners.get(type) || []) fn({ stopPropagation() {}, preventDefault() {}, target: el, currentTarget: el, ...event }); },
      focus() {},
      scrollIntoView() {},
      animate: () => ({ cancel() {} }),
      showPopover() {},
      hidePopover() {},
      querySelector(sel) { return el.querySelectorAll(sel)[0] ?? null; },
      querySelectorAll(sel) {
        const parts = sel.split(',').map(p => p.trim()).filter(Boolean);
        return collectDescendants(el).filter(node => parts.some(p => matchesChain(node, el, p)));
      },
      attachShadow() {
        const shadowRoot = makeNode('shadow', ownerDoc);
        shadowRoot.getElementById = id => createdIds.get(id) ?? null;
        shadowRoot.activeElement = null;
        el.shadowRoot = shadowRoot;
        return shadowRoot;
      },
    };
    return el;
  };
  const bodyEl = makeNode('body', null);
  const rootEl = makeNode('html', null);
  const doc = {
    documentElement: rootEl,
    body: bodyEl,
    head: makeNode('head', null),
    hidden: false,
    defaultView: { innerWidth: 1000, innerHeight: 800, addEventListener() {}, removeEventListener() {} },
    createElement: tag => tag === 'canvas' ? { width: 1, height: 1, getContext: () => makeCanvasContext() } : makeNode(tag, doc),
    createTextNode: text => ({ textContent: text }),
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
  };
  bodyEl.ownerDocument = doc;
  rootEl.ownerDocument = doc;
  doc.head.ownerDocument = doc;
  doc.defaultView.document = doc;

  const branch = makeNode('div', doc);
  const row = makeNode('div', doc);
  const editor = makeNode('div', doc);
  row.append(branch);
  row.parentElement = makeNode('div', doc);
  row.parentElement.append(editor, row);

  let hostMetrics = {
    connection: 'live',
    preferences: { language: 'zh-CN', revision: 1, languageGuideDismissed: true },
    speed: null,
    usage: { todayTokens: 12000, monthTokens: 340000, today: '2026-11-14', models: [], records: {} },
  };
  let metricsCalls = 0;

  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    matchMedia: globalThis.matchMedia,
    getComputedStyle: globalThis.getComputedStyle,
    MutationObserver: globalThis.MutationObserver,
    ResizeObserver: globalThis.ResizeObserver,
    CSS: globalThis.CSS,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    innerWidth: globalThis.innerWidth,
    innerHeight: globalThis.innerHeight,
    location: globalThis.location,
  };
  const storage = new Map([['ag-pulse-language', 'zh-CN']]);
  const sStorage = new Map();
  const mm = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

  globalThis.document = doc;
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) };
  globalThis.sessionStorage = { getItem: k => sStorage.get(k) ?? null, setItem: (k, v) => sStorage.set(k, String(v)), removeItem: k => sStorage.delete(k) };
  globalThis.matchMedia = mm;
  globalThis.CSS = { supports: () => true };
  globalThis.innerWidth = 1000;
  globalThis.innerHeight = 800;
  globalThis.location = { pathname: '/c/11111111-1111-1111-1111-111111111111' };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.getComputedStyle = el => el === bodyEl
    ? { fontFamily: '"Google Sans Flex", sans-serif', getPropertyValue: () => '' }
    : { display: 'flex', flexDirection: 'row', position: 'static', visibility: 'visible', colorScheme: 'light', marginLeft: '0', marginRight: '0', columnGap: '4', paddingLeft: '0', paddingRight: '0', gap: '4', fontFamily: 'system-ui', getPropertyValue: () => '' };
  globalThis.window = {
    innerWidth: 1000,
    innerHeight: 800,
    matchMedia: mm,
    addEventListener() {},
    removeEventListener() {},
    __agPulseI18nFactory: createI18n,
    __agPulseThemeFactory: createTheme,
    __agPulseUsageFactory: () => ({ update() {}, open() {}, syncGuideDismissed() {}, dispose() {}, get isOpen() { return false; } }),
    __agPulseSurface: {
      useSharedComposer: false,
      showEmpty: true,
      findComposer: () => ({ editor, model: branch, row, branch, box: row.parentElement, kind: 'main' }),
      conversationId: () => '11111111-1111-1111-1111-111111111111',
      nativeReserve: () => 0,
      setMarkup(target, markup) {
        target.innerHTML = markup;
        target.children = [];
        const stack = [target];
        const voidTags = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'br', 'hr', 'img', 'input', 'meta', 'link']);
        for (const m of markup.matchAll(/<\/?([a-z0-9-]+)\b([^>]*)>/gi)) {
          const full = m[0], tag = m[1].toLowerCase(), rawAttrs = m[2];
          if (full.startsWith('</')) {
            if (stack.length > 1) stack.pop();
            continue;
          }
          const n = makeNode(tag, doc);
          for (const am of rawAttrs.matchAll(/([a-z0-9-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi)) {
            const k = am[1];
            if (!k || k === '/') continue;
            const v = am[2] ?? am[3] ?? am[4] ?? '';
            n.setAttribute(k, v);
            if (k === 'class') n.className = v;
            else if (k.startsWith('data-')) {
              const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
              n.dataset[camel] = v;
            }
          }
          stack[stack.length - 1].append(n);
          if (!rawAttrs.trim().endsWith('/') && !voidTags.has(tag)) stack.push(n);
        }
      },
    },
    agPulseHost: {
      getPreferences: async () => ({ language: 'zh-CN', revision: 1, languageGuideDismissed: true }),
      setPreferences: async p => ({ ...p, revision: 2 }),
      getMetrics: async () => { metricsCalls++; return hostMetrics; },
      report() {},
    },
  };

  try {
    installInline();
    // Cold mount with no snapshot shows quiet skeleton row while waiting for initial metrics (never blank, never fake 0s)
    assert.equal(createdIds.get('skel-row').hidden, false);
    assert.equal(createdIds.get('rounds').parentElement.hidden, true);
    assert.equal(createdIds.get('cache-rate').parentElement.hidden, true);
    assert.equal(createdIds.get('context-percent').parentElement.hidden, true);
    await new Promise(r => setTimeout(r, 30));
    assert.ok(metricsCalls >= 1);
    assert.equal(createdIds.get('skel-row').hidden, true);
    // 1. Empty new conversation: 0% & 0 everywhere, never '—'
    assert.equal(createdIds.get('context-percent').textContent, '0%');
    assert.equal(createdIds.get('context-ring').style.getPropertyValue('--used-dash'), '0 100');
    assert.equal(createdIds.get('context-summary-pct').textContent, '0%');
    assert.equal(createdIds.get('context-tokens').textContent, '0');
    assert.equal(createdIds.get('ctx-sys-val').textContent, '0');
    assert.equal(createdIds.get('ctx-ext-val').textContent, '0');
    assert.equal(createdIds.get('ctx-ext-row').hidden, false);
    assert.equal(createdIds.get('ctx-tools-val').textContent, '0');
    assert.equal(createdIds.get('ctx-msg-val').textContent, '0');
    assert.equal(createdIds.get('ctx-other-val').textContent, '0');
    assert.equal(createdIds.get('ctx-other-row').hidden, true);
    assert.equal(createdIds.get('context-note').hidden, false);
    assert.equal(createdIds.get('context-note').textContent, '悬停分组查看具体说明。');
    assert.equal(createdIds.get('rate-note').hidden, true);
    createdIds.get('ctx-msg-row').dispatch('pointerenter');
    assert.equal(createdIds.get('context-note').textContent, '你的提问、模型回复与内部思考内容。');
    createdIds.get('ctx-msg-row').dispatch('pointerleave');
    assert.equal(createdIds.get('context-note').textContent, '悬停分组查看具体说明。');
    const speedChip = createdIds.get('rounds').parentElement;
    const cacheChip = createdIds.get('cache-rate').parentElement;
    assert.equal(speedChip.hidden, false);
    assert.equal(cacheChip.hidden, false);
    assert.equal(createdIds.get('usage-today').textContent, '12K');
    assert.equal(createdIds.get('usage-month').textContent, '340K');

    // 2. Active conversation: push transcript breakdown and trigger timer tick
    hostMetrics = {
      ...hostMetrics,
      speed: {
        conversationId: '11111111-1111-1111-1111-111111111111',
        rounds: 2,
        steps: 44,
        measuredRequests: 10,
        tps: 228.4,
        latestTps: 228.4,
        latestRateStatus: 'ok',
        modelSeconds: 206,
        toolSeconds: 175,
        ttftSeconds: 0.9,
        model: 'Claude Sonnet 4.6',
        counts: { responseOutput: 37811, thinkingOutput: 0 },
        context: { usedTokens: 105000, maxTokens: 1000000, usedFraction: 0.1, remainingFraction: 0.9, estimated: true },
        transcriptStats: { status: 'ok', systemTokens: 1400, toolTokens: 7400, userTokens: 18200, assistantTokens: 50000, totalTokens: 77000 },
        cache: { hitRate: 0.98, totalTokens: 3244160, cachedTokens: 3131648, uncachedTokens: 74701, cacheWriteTokens: 0, outputTokens: 37811, measuredRequests: 10 },
        tokens: { totalTokens: 3244160, cachedTokens: 3131648, uncachedTokens: 74701, cacheWriteTokens: 0, outputTokens: 37811, measuredRequests: 10, inputRequests: 10, outputRequests: 10, uncachedRequests: 10, cachedRequests: 10, cacheWriteRequests: 10 },
      },
    };
    await new Promise(r => setTimeout(r, 3200));
    assert.equal(createdIds.get('rounds').textContent, '2 轮 44 步');
    assert.equal(createdIds.get('rounds').hasAttribute('hidden'), true);
    assert.equal(createdIds.get('tps').textContent, '228');
    assert.equal(createdIds.get('cache-total').textContent, '3.2M tok');
    assert.equal(createdIds.get('cache-rate').textContent, '98%');
    assert.equal(createdIds.get('context-percent').textContent, '10%');
    assert.equal(createdIds.get('context-ring').style.getPropertyValue('--used-dash'), '10.00 100');
    assert.equal(createdIds.get('context-tokens').textContent, '~105K / 1M');
    assert.equal(createdIds.get('ctx-sys-val').textContent, '~1.4K');
    assert.equal(createdIds.get('ctx-tools-val').textContent, '~7.4K');
    assert.equal(createdIds.get('ctx-msg-val').textContent, '~68.2K');
    assert.equal(createdIds.get('ctx-other-val').textContent, '~28K');
    assert.equal(createdIds.get('ctx-other-row').hidden, false);
    assert.equal(createdIds.get('ctx-seg-sys').style.getPropertyValue('width'), '0.14%');
    assert.equal(createdIds.get('ctx-seg-tools').style.getPropertyValue('width'), '0.74%');
    assert.equal(createdIds.get('ctx-seg-msg').style.getPropertyValue('width'), '6.82%');
    assert.equal(createdIds.get('ctx-seg-other').style.getPropertyValue('width'), '2.80%');
    assert.equal(createdIds.get('model-time').textContent, '3分26秒');
    assert.equal(createdIds.get('tool-time').textContent, '2分55秒');
    assert.equal(createdIds.get('ttft').textContent, '0.9秒');
    assert.equal(createdIds.get('rate-note').hidden, true);
    assert.equal(createdIds.has('card-language-en'), false);
    assert.equal(createdIds.has('language-guide'), false);

    // 3. Post-compaction conversation: active* + overhead matches usedTokens total fill
    hostMetrics = {
      ...hostMetrics,
      speed: {
        ...hostMetrics.speed,
        context: { usedTokens: 86200, maxTokens: 256000, usedFraction: 86200 / 256000, remainingFraction: 1 - 86200 / 256000, estimated: true },
        transcriptStats: {
          status: 'ready',
          systemTokens: 40800, toolTokens: 364200, userTokens: 3000, assistantTokens: 40000, totalTokens: 448000,
          activeSystemTokens: 8000, activeToolTokens: 50000, activeUserTokens: 200, activeAssistantTokens: 4800, activeTotalTokens: 63000,
        },
      },
    };
    await new Promise(r => setTimeout(r, 3200));
    assert.equal(createdIds.get('context-percent').textContent, '34%');
    assert.equal(createdIds.get('context-tokens').textContent, '~86.2K / 256K');
    assert.equal(createdIds.get('ctx-sys-val').textContent, '~8K');
    assert.equal(createdIds.get('ctx-tools-val').textContent, '~50K');
    assert.equal(createdIds.get('ctx-msg-val').textContent, '~5K');
    assert.equal(createdIds.get('ctx-other-val').textContent, '~23.2K');
    const segSum = ['ctx-seg-sys', 'ctx-seg-tools', 'ctx-seg-msg', 'ctx-seg-other']
      .map(id => parseFloat(createdIds.get(id).style.getPropertyValue('width')))
      .reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(segSum - (86200 / 256000) * 100) < 0.05, `Expected total segment percentage ~33.67%, got ${segSum}`);

    // 4. Even if active* raw estimate exceeds usedTokens, proportional capping prevents bar overflow
    hostMetrics = {
      ...hostMetrics,
      speed: {
        ...hostMetrics.speed,
        context: { usedTokens: 50000, maxTokens: 256000, usedFraction: 50000 / 256000, remainingFraction: 1 - 50000 / 256000, estimated: true },
        transcriptStats: {
          status: 'ready',
          systemTokens: 10000, toolTokens: 80000, userTokens: 2000, assistantTokens: 8000, totalTokens: 100000,
          activeSystemTokens: 10000, activeToolTokens: 80000, activeUserTokens: 2000, activeAssistantTokens: 8000, activeTotalTokens: 100000,
        },
      },
    };
    await new Promise(r => setTimeout(r, 3200));
    assert.equal(createdIds.get('ctx-sys-val').textContent, '~5K');
    assert.equal(createdIds.get('ctx-tools-val').textContent, '~40K');
    assert.equal(createdIds.get('ctx-msg-val').textContent, '~5K');
    assert.equal(createdIds.get('ctx-ext-row').hidden, true);
    assert.equal(createdIds.get('context-note').hidden, false);
    assert.equal(createdIds.get('context-note').textContent, '精确构成暂不可用，当前分段基于本地日志估算。');

    // 5. Tier 1: exact host contextBreakdown hides other-row & fallback footnote, shows extensions cleanly
    hostMetrics = {
      ...hostMetrics,
      speed: {
        ...hostMetrics.speed,
        context: { usedTokens: 200000, maxTokens: 256000, usedFraction: 200000 / 256000, remainingFraction: 1 - 200000 / 256000, estimated: false },
        contextBreakdown: {
          version: 1,
          source: 'host-breakdown',
          compactedPending: false,
          systemTokens: 20000,
          extensionsTokens: 30000,
          toolsTokens: 100000,
          messagesTokens: 50000,
          totalTokens: 200000,
        },
      },
    };
    await new Promise(r => setTimeout(r, 3200));
    assert.equal(createdIds.get('ctx-breakdown').hidden, false);
    assert.equal(createdIds.get('context-ring').style.getPropertyValue('--used-dash'), '78.13 100');
    assert.equal(createdIds.get('ctx-sys-val').textContent, '20K');
    assert.equal(createdIds.get('ctx-ext-val').textContent, '30K');
    assert.equal(createdIds.get('ctx-tools-val').textContent, '100K');
    assert.equal(createdIds.get('ctx-msg-val').textContent, '50K');
    assert.equal(createdIds.get('ctx-ext-row').hidden, false);
    assert.equal(createdIds.get('ctx-other-row').hidden, true);
    assert.equal(createdIds.get('context-note').hidden, false);
    assert.equal(createdIds.get('context-note').textContent, '悬停分组查看具体说明。');
    assert.equal(createdIds.get('context-card').getAttribute('data-hover-seg'), null);
    createdIds.get('context-percent').parentElement.dispatch('click');
    assert.equal(createdIds.get('context-card').hidden, false);
    createdIds.get('ctx-ext-row').dispatch('pointerenter');
    assert.equal(createdIds.get('context-card').getAttribute('data-hover-seg'), 'ext');
    assert.equal(createdIds.get('context-note').textContent, '已加载规则、Skills、MCP 与子代理。');
    createdIds.get('ctx-ext-row').dispatch('pointerleave');
    assert.equal(createdIds.get('context-card').getAttribute('data-hover-seg'), null);
    assert.equal(createdIds.get('context-note').textContent, '悬停分组查看具体说明。');

    // 6. Tier 3: active context without breakdown or transcript hides meaningless 0 rows and shows smooth status note
    hostMetrics = {
      ...hostMetrics,
      speed: {
        ...hostMetrics.speed,
        status: 'CASCADE_RUN_STATUS_RUNNING',
        context: { usedTokens: 48000, maxTokens: 256000, usedFraction: 48000 / 256000, remainingFraction: 1 - 48000 / 256000, estimated: true },
        contextBreakdown: {
          version: 1,
          source: 'compaction-pending',
          compactedPending: true,
          systemTokens: 0,
          extensionsTokens: 0,
          toolsTokens: 0,
          messagesTokens: 0,
          totalTokens: 0,
        },
        transcriptStats: null,
      },
    };
    await new Promise(r => setTimeout(r, 3200));
    assert.equal(createdIds.get('ctx-breakdown').hidden, true);
    assert.equal(createdIds.get('context-note').hidden, false);
    assert.equal(createdIds.get('context-note').textContent, '刚完成上下文压缩，精确构成将在下一轮请求后更新。');
    assert.equal(createdIds.get('ctx-seg-other').style.getPropertyValue('width'), '18.75%');

    // 7. Transient offline bridge response during reload preserves prior active metrics instead of resetting to 0
    hostMetrics = { connection: 'offline', error: '等待 Antigravity Context 重新连接', speed: null, groups: [] };
    await new Promise(r => setTimeout(r, 3200));
    assert.equal(createdIds.get('tps').textContent, '228');
    assert.equal(createdIds.get('context-percent').textContent, '19%');

    // 8. Hot-reload seamless handover preserves numbers immediately on frame 1 without resetting to 0
    hostMetrics = {
      connection: 'live',
      preferences: { language: 'zh-CN', revision: 1, languageGuideDismissed: true },
      speed: {
        conversationId: '11111111-1111-1111-1111-111111111111',
        rounds: 2, steps: 44, measuredRequests: 10, tps: 228.4, latestTps: 228.4, latestRateStatus: 'ok',
        modelSeconds: 206, toolSeconds: 175, ttftSeconds: 0.9, model: 'Claude Sonnet 4.6',
        counts: { responseOutput: 37811, thinkingOutput: 0 },
        context: { usedTokens: 48640, maxTokens: 256000, usedFraction: 0.19, remainingFraction: 0.81, estimated: true },
        contextBreakdown: { version: 1, source: 'host-breakdown', compactedPending: false, systemTokens: 1000, extensionsTokens: 1000, toolsTokens: 20000, messagesTokens: 26640, totalTokens: 48640 },
        cache: { hitRate: 0.98, totalTokens: 3244160, cachedTokens: 3131648, uncachedTokens: 74701, cacheWriteTokens: 0, outputTokens: 37811, measuredRequests: 10 },
        tokens: { totalTokens: 3244160, cachedTokens: 3131648, uncachedTokens: 74701, cacheWriteTokens: 0, outputTokens: 37811, measuredRequests: 10, inputRequests: 10, outputRequests: 10, uncachedRequests: 10, cachedRequests: 10, cacheWriteRequests: 10 },
      },
      usage: { todayTokens: 12000, monthTokens: 340000, today: '2026-11-14', models: [], records: {} },
    };
    await new Promise(r => setTimeout(r, 3200));
    globalThis.window.__agPulseDispose();
    assert.ok(globalThis.window.__agPulseHandover);
    installInline();
    assert.equal(globalThis.window.__agPulseHandover, undefined);
    assert.equal(createdIds.get('skel-row').hidden, true);
    assert.equal(createdIds.get('rounds').parentElement.hidden, false);
    assert.equal(createdIds.get('tps').textContent, '228');
    assert.equal(createdIds.get('context-percent').textContent, '19%');
    await new Promise(r => setTimeout(r, 30));

    // 9. Across stop/restart without in-memory handover (e.g. plugin toggle off/on or page reload), sessionStorage restores real values on frame 1 without skeleton/0 flash
    assert.equal(sStorage.has('ag-pulse-snap-v1'), true);
    globalThis.window.__agPulseDispose();
    delete globalThis.window.__agPulseHandover;
    installInline();
    assert.equal(createdIds.get('skel-row').hidden, true);
    assert.equal(createdIds.get('tps').textContent, '228');
    assert.equal(createdIds.get('context-percent').textContent, '19%');
  } finally {
    globalThis.window?.__agPulseDispose?.();
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  }
});

test('inline-widget keeps speed chip on live empty new chats (showEmpty: false) and steps compact -> tight before icons-only', async () => {
  const createdIds = new Map();
  let fakeClientWidth = 400;
  const widthForMode = className => className.includes('icons-only') ? 76 : className.includes('tight') ? 230 : className.includes('compact') ? 310 : 350;
  let hostEl = null;

  const makeNode = tag => {
    const attrs = new Map();
    const listeners = new Map();
    let _id = '';
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      get id() { return _id; },
      set id(v) { _id = String(v || ''); if (_id) createdIds.set(_id, el); },
      hidden: false,
      disabled: false,
      open: false,
      dataset: {},
      className: '',
      textContent: '',
      innerHTML: '',
      isConnected: true,
      children: [],
      style: makeStyleStore(),
      attributes: attrs,
      ownerDocument: null,
      parentElement: null,
      parentNode: null,
      previousElementSibling: null,
      nextSibling: null,
      get clientWidth() { return fakeClientWidth; },
      get scrollWidth() { return el.className === 'bar' ? widthForMode(hostEl?.className || '') : fakeClientWidth; },
      classList: {
        add(...cs) { for (const c of cs) if (!el.className.split(/\s+/).includes(c)) el.className = `${el.className} ${c}`.trim(); },
        remove(...cs) { el.className = el.className.split(/\s+/).filter(x => x && !cs.includes(x)).join(' '); },
        toggle(c, on) { if (on) el.classList.add(c); else el.classList.remove(c); },
        contains(c) { return el.className.split(/\s+/).includes(c); },
      },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      removeAttribute(k) { attrs.delete(k); },
      hasAttribute(k) { return attrs.has(k); },
      append(...nodes) { for (const n of nodes) if (n && typeof n === 'object') { n.parentElement = el; n.parentNode = el; el.children.push(n); } },
      after(...nodes) { el.parentElement?.append(...nodes); },
      before() {},
      insertBefore(n) { el.append(n); return n; },
      replaceChildren(...nodes) { el.children = []; el.append(...nodes); },
      remove() { el.isConnected = false; },
      closest: () => null,
      matches: () => false,
      getClientRects: () => [{ width: 20, height: 20 }],
      getBoundingClientRect: () => ({ left: 100, top: 300, right: 100 + fakeClientWidth, bottom: 328, width: fakeClientWidth, height: 28 }),
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      dispatch(type, event = {}) { for (const fn of listeners.get(type) || []) fn({ stopPropagation() {}, preventDefault() {}, target: el, currentTarget: el, ...event }); },
      focus() {},
      animate: () => ({ cancel() {} }),
      showPopover() {},
      hidePopover() {},
      querySelector(sel) { return el.querySelectorAll(sel)[0] ?? null; },
      querySelectorAll(sel) {
        const list = [];
        const walk = n => { for (const c of n.children || []) { list.push(c); walk(c); } };
        walk(el);
        const matchTok = (n, tok) => {
          if (tok.startsWith('.')) return String(n.className || '').split(/\s+/).includes(tok.slice(1));
          if (tok.startsWith('#')) return n.id === tok.slice(1);
          const eq = tok.match(/^\[([^=\]]+)=["']?([^"'\]]+)["']?\]$/);
          if (eq) {
            const [, k, v] = eq;
            if (k.startsWith('data-')) { const c = k.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase()); if (n.dataset?.[c] === v) return true; }
            return n.attributes?.get(k) === v;
          }
          const has = tok.match(/^\[([^\]=]+)\]$/);
          if (has) {
            const k = has[1];
            if (k.startsWith('data-')) { const c = k.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase()); if (c in (n.dataset || {})) return true; }
            return n.attributes?.has(k) || false;
          }
          return n.tagName === tok.toUpperCase();
        };
        const matchOne = (n, expr) => (expr.match(/(?:[#.][a-zA-Z0-9_-]+|\[[^\]]+\]|[a-zA-Z0-9_-]+)/g) || []).every(tok => matchTok(n, tok));
        return list.filter(n => sel.split(',').map(s => s.trim()).filter(Boolean).some(part => {
          const chain = part.split(/\s+/);
          if (!matchOne(n, chain.at(-1))) return false;
          let cur = n.parentElement;
          for (let i = chain.length - 2; i >= 0; i--) {
            while (cur && cur !== el && !matchOne(cur, chain[i])) cur = cur.parentElement;
            if (!cur || (cur === el && !matchOne(cur, chain[i]))) return false;
            cur = cur.parentElement;
          }
          return true;
        }));
      },
      attachShadow() {
        const sr = makeNode('shadow');
        sr.getElementById = id => createdIds.get(id) ?? null;
        sr.activeElement = null;
        el.shadowRoot = sr;
        hostEl = el;
        return sr;
      },
    };
    return el;
  };
  const bodyEl = makeNode('body'), rootEl = makeNode('html');
  const doc = {
    documentElement: rootEl, body: bodyEl, head: makeNode('head'), hidden: false,
    defaultView: { innerWidth: 1000, innerHeight: 800, addEventListener() {}, removeEventListener() {} },
    createElement: tag => tag === 'canvas' ? { width: 1, height: 1, getContext: () => makeCanvasContext() } : makeNode(tag),
    createTextNode: text => ({ textContent: text }),
    querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  };
  const branch = makeNode('div'), row = makeNode('div'), editor = makeNode('div');
  row.append(branch);
  row.parentElement = makeNode('div');
  row.parentElement.append(editor, row);

  const prev = {
    window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage,
    matchMedia: globalThis.matchMedia, getComputedStyle: globalThis.getComputedStyle,
    MutationObserver: globalThis.MutationObserver, ResizeObserver: globalThis.ResizeObserver, Element: globalThis.Element,
    CSS: globalThis.CSS, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame,
    innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight, location: globalThis.location,
  };
  const resizeListeners = [];
  globalThis.document = doc;
  globalThis.Element = function Element() {};
  globalThis.localStorage = { getItem: () => 'zh-CN', setItem() {} };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.CSS = { supports: () => true };
  globalThis.innerWidth = 1000;
  globalThis.innerHeight = 800;
  globalThis.location = { pathname: '/' };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.getComputedStyle = el => el === bodyEl
    ? { fontFamily: '"Google Sans Flex", sans-serif', getPropertyValue: () => '' }
    : { display: 'flex', flexDirection: 'row', position: 'static', visibility: 'visible', colorScheme: 'light', marginLeft: '0', marginRight: '0', columnGap: '4', paddingLeft: '0', paddingRight: '0', gap: '4', fontFamily: 'system-ui', getPropertyValue: () => '' };
  globalThis.window = {
    innerWidth: 1000, innerHeight: 800,
    matchMedia: globalThis.matchMedia,
    addEventListener(type, fn) { if (type === 'resize') resizeListeners.push(fn); },
    removeEventListener() {},
    __agPulseI18nFactory: createI18n,
    __agPulseThemeFactory: createTheme,
    __agPulseUsageFactory: () => ({ update() {}, open() {}, syncGuideDismissed() {}, dispose() {}, get isOpen() { return false; } }),
    __agPulseSurface: {
      useSharedComposer: false,
      showEmpty: false,
      findComposer: () => ({ editor, model: branch, row, branch, box: row.parentElement, kind: 'main' }),
      conversationId: () => '',
      nativeReserve: () => 0,
      setMarkup(target, markup) {
        target.innerHTML = markup;
        target.children = [];
        const stack = [target];
        const voidTags = new Set(['path', 'br', 'hr', 'img', 'input', 'meta', 'link']);
        for (const m of markup.matchAll(/<\/?([a-z0-9-]+)\b([^>]*)>/gi)) {
          const full = m[0], tag = m[1].toLowerCase(), rawAttrs = m[2];
          if (full.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
          const n = makeNode(tag);
          for (const am of rawAttrs.matchAll(/([a-z0-9-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi)) {
            const k = am[1]; if (!k || k === '/') continue;
            const v = am[2] ?? am[3] ?? am[4] ?? '';
            n.setAttribute(k, v);
            if (k === 'class') n.className = v;
            else if (k.startsWith('data-')) n.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
          }
          stack[stack.length - 1].append(n);
          if (!rawAttrs.trim().endsWith('/') && !voidTags.has(tag)) stack.push(n);
        }
      },
    },
    agPulseHost: {
      getPreferences: async () => ({ language: 'zh-CN', revision: 1 }),
      setPreferences: async p => p,
      getMetrics: async () => ({ connection: 'live', preferences: { language: 'zh-CN', revision: 1 }, speed: null, usage: null }),
      report() {},
    },
  };
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
  globalThis.cancelAnimationFrame = id => clearTimeout(id);

  try {
    installInline();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(createdIds.get('rounds').parentElement.hidden, false);
    assert.equal(createdIds.get('cache-rate').parentElement.hidden, false);
    assert.equal(hostEl.dataset.density, 'full');

    // Medium space (~330px) drops gently to 'compact' (100% text preserved)
    fakeClientWidth = 330;
    for (const fn of resizeListeners) fn();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(hostEl.dataset.density, 'compact');

    // Tight space (~260px) lands on 'tight' (numbers preserved), NOT icons-only
    fakeClientWidth = 260;
    for (const fn of resizeListeners) fn();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(hostEl.dataset.density, 'tight');

    // Only ultra-narrow (<230px) drops to icons-only
    fakeClientWidth = 90;
    for (const fn of resizeListeners) fn();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(hostEl.dataset.density, 'icons');

    // Restoring width recovers back to 'full'
    fakeClientWidth = 400;
    for (const fn of resizeListeners) fn();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(hostEl.dataset.density, 'full');
  } finally {
    globalThis.window?.__agPulseDispose?.();
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  }
});

test('usage-ui removes weekly/composition views and coordinates unified date filters', () => {
  const createUsageDashboard = require('../../../compat/usage-ui.cjs');
  assert.equal(typeof createUsageDashboard, 'function');
  const src = readFileSync(join(ROOT, 'compat', 'usage-ui.cjs'), 'utf8');
  assert.ok(!src.includes('ANTIGRATIVE DASHBOARD'));
  assert.ok(!src.includes('›</button>'));
  assert.ok(!src.includes('‹</button>'));
  assert.ok(src.includes('viewBox="0 -960 960 960"'));
  assert.ok(src.includes('height:auto;max-height:min(840px'));

  const idMap = new Map();
  const focusCalls = [];
  let doc = null;
  const makeUsageEl = tag => {
    const attrs = new Map();
    const listeners = new Map();
    let _id = '';
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      get id() { return _id; },
      set id(v) { _id = String(v || ''); if (_id) idMap.set(_id, el); },
      get ownerDocument() { return doc; },
      parentNode: null,
      parentElement: null,
      hidden: false,
      disabled: false,
      open: false,
      tabIndex: 0,
      dataset: {},
      textContent: '',
      innerHTML: '',
      title: '',
      isConnected: true,
      children: [],
      style: makeStyleStore(),
      attributes: attrs,
      firstElementChild: null,
      get lastElementChild() { return el.children.at(-1) ?? null; },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      removeAttribute(k) { attrs.delete(k); },
      hasAttribute(k) { return attrs.has(k); },
      append(...nodes) {
        for (const n of nodes) if (n && typeof n === 'object') { n.parentElement = el; n.parentNode = el; el.children.push(n); }
        el.firstElementChild = el.children.find(c => c.tagName) ?? null;
      },
      before() {},
      after() {},
      replaceChildren(...nodes) { el.children = []; el.append(...nodes); },
      remove() {},
      closest: () => null,
      matches: () => false,
      showPopover() { el.open = true; },
      hidePopover() { el.open = false; },
      focus() { focusCalls.push(el); },
      animate: () => ({ cancel() {} }),
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
      removeEventListener() {},
      dispatch(type) { for (const fn of listeners.get(type) || []) fn({ target: el, preventDefault() {}, stopPropagation() {} }); },
      getClientRects: () => [{ width: 20, height: 20 }],
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400 }),
      querySelector(sel) { return el.querySelectorAll(sel)[0] ?? null; },
      querySelectorAll(sel) {
        const list = [];
        const walk = node => { for (const c of node.children || []) { list.push(c); walk(c); } };
        walk(el);
        const parts = sel.split(',').map(p => p.trim());
        return list.filter(n => parts.some(p => {
          if (p.startsWith('.')) return String(n.className || '').split(/\s+/).includes(p.slice(1));
          const m = p.match(/^\[([a-z-]+)\]$/);
          if (m) return n.attributes?.has(m[1]);
          return n.tagName === p.toUpperCase();
        }));
      },
      attachShadow() {
        const sr = makeUsageEl('shadow');
        sr.getElementById = id => idMap.get(id) ?? null;
        return sr;
      },
    };
    return el;
  };
  doc = {
    defaultView: { addEventListener() {}, removeEventListener() {}, innerWidth: 1200, innerHeight: 900 },
    createElement: tag => tag === 'canvas' ? { width: 1, height: 1, getContext: () => makeCanvasContext() } : makeUsageEl(tag),
    createTextNode: text => ({ textContent: text }),
    addEventListener() {},
    removeEventListener() {},
  };
  const prevDoc = globalThis.document, prevWin = globalThis.window, prevComputed = globalThis.getComputedStyle, prevMO = globalThis.MutationObserver;
  globalThis.document = doc;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1200, innerHeight: 900 };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  const setMarkup = (target, markup) => {
    target.innerHTML = markup;
    target.children = [];
    const stack = [target];
    const voidTags = new Set(['path', 'i', 'br']);
    for (const m of markup.matchAll(/<\/?([a-z0-9-]+)\b([^>]*)>/gi)) {
      const full = m[0], tag = m[1].toLowerCase(), rawAttrs = m[2];
      if (full.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      const n = makeUsageEl(tag);
      for (const am of rawAttrs.matchAll(/([a-z0-9-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi)) {
        const k = am[1]; if (!k || k === '/') continue;
        const v = am[2] ?? am[3] ?? am[4] ?? '';
        n.setAttribute(k, v);
        if (k === 'class') n.className = v;
        else if (k.startsWith('data-')) n.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
      }
      stack[stack.length - 1].append(n);
      if (!rawAttrs.trim().endsWith('/') && !voidTags.has(tag)) stack.push(n);
    }
  };
  try {
    const root = makeUsageEl('div');
    const lang = createI18n('zh-CN');
    const dash = createUsageDashboard({ root, language: lang, setMarkup, hostLabel: 'Antigravity', guideDismissed: false, onDismissGuide: async () => {}, onLanguage: async () => {}, onRefresh: async () => {} });
    dash.open({
      accountKey: 'acct',
      today: '2026-11-14',
      firstDate: '2025-12-20',
      timeZone: 'Asia/Shanghai',
      requests: 123,
      todayTokens: 19600,
      weekTokens: 40000,
      monthTokens: 120000,
      totalTokens: 900000,
      models: [
        'Gemini 3.8 Flash (High)',
        'Gemini 3.8 Flash (Medium)',
        'gemini-3.8-flash-tiered',
        'gemini-3.7-flash',
        'gemini-3.7-flash-exp-b',
        'gemini-3.7-flash-control',
        'Gemini 3.7 Flash (High)',
        'Gemini 4 Hydrogen (High)',
        'Gemini 4 Hydrogen (XHigh)',
        'gemini-4-hydrogen-high',
        'gemini-4-argon-trial',
        'Claude Sonnet 4.6 (Thinking)',
        'GPT-OSS 120B (Medium)',
        'Orchestrator (Argon)',
      ],
      days: [
        {
          date: '2025-12-20',
          models: {
            'gemini-3.7-flash': { total: 1000, requests: 1, uncached: 200, cacheRead: 700, cacheWrite: 0, output: 100 },
          },
        },
        {
          date: '2026-09-10',
          models: {
            'gemini-3.7-flash-exp-b': { total: 2000, requests: 2, uncached: 400, cacheRead: 1400, cacheWrite: 0, output: 200 },
          },
        },
        {
          date: '2026-11-14',
          models: {
            'Gemini 3.8 Flash (High)': { total: 6000, requests: 3, uncached: 1000, cacheRead: 4500, cacheWrite: 0, output: 500 },
            'Gemini 3.8 Flash (Medium)': { total: 3000, requests: 2, uncached: 500, cacheRead: 2200, cacheWrite: 0, output: 300 },
            'gemini-3.8-flash-tiered': { total: 1000, requests: 1, uncached: 200, cacheRead: 700, cacheWrite: 0, output: 100 },
            'gemini-3.7-flash': { total: 1500, requests: 1, uncached: 300, cacheRead: 1000, cacheWrite: 0, output: 200 },
            'gemini-3.7-flash-control': { total: 500, requests: 1, uncached: 100, cacheRead: 350, cacheWrite: 0, output: 50 },
            'Gemini 3.7 Flash (High)': { total: 600, requests: 1, uncached: 100, cacheRead: 450, cacheWrite: 0, output: 50 },
            'Gemini 4 Hydrogen (High)': { total: 2000, requests: 1, uncached: 400, cacheRead: 1400, cacheWrite: 0, output: 200 },
            'Gemini 4 Hydrogen (XHigh)': { total: 1000, requests: 1, uncached: 200, cacheRead: 700, cacheWrite: 0, output: 100 },
            'gemini-4-hydrogen-high': { total: 1000, requests: 1, uncached: 200, cacheRead: 700, cacheWrite: 0, output: 100 },
            'gemini-4-argon-trial': { total: 500, requests: 1, uncached: 100, cacheRead: 350, cacheWrite: 0, output: 50 },
            'Claude Sonnet 4.6 (Thinking)': { total: 1200, requests: 1, uncached: 200, cacheRead: 900, cacheWrite: 0, output: 100 },
            'GPT-OSS 120B (Medium)': { total: 900, requests: 1, uncached: 150, cacheRead: 650, cacheWrite: 0, output: 100 },
            'Orchestrator (Argon)': { total: 900, requests: 1, uncached: 150, cacheRead: 650, cacheWrite: 0, output: 100 },
          },
        },
      ],
    }, null);
    assert.equal(idMap.get('title').textContent, '用量统计');
    // Tabs, bottom cards, weekly heatmap, composition toggle, and old nav arrows are all removed
    for (const removedId of [
      'overview-tab',
      'details-tab',
      'overview-models',
      'selection-title',
      'heat-controls',
      'chart-mode-controls',
      'previous',
      'next',
      'today-jump',
      'heat-sub',
    ]) {
      assert.equal(idMap.get(removedId), undefined, `${removedId} should not exist`);
    }

    // Top KPI cards + annual heatmap + unified breakdown are all rendered
    assert.equal(idMap.get('totals').children.length, 4);
    assert.ok(idMap.get('heat-summary').textContent.includes('命中'));
    assert.ok(idMap.get('usage-intro-text').textContent.includes('UTC+8') || idMap.get('usage-intro-text').textContent.includes('北京时间'));

    // Default range is rolling 30 days ending on 2026-11-14
    const filterButtons = idMap.get('date-filter').querySelectorAll('[data-range]');
    const preset30d = filterButtons.find(b => b.dataset.range === '30d');
    const preset7d = filterButtons.find(b => b.dataset.range === '7d');
    assert.equal(preset30d.getAttribute('aria-pressed'), 'true');
    assert.equal(idMap.get('range-display').textContent, '2026-10-16 ~ 2026-11-14');
    assert.equal(idMap.get('month-preset-label').textContent, '2026-11');
    assert.equal(idMap.get('year-preset').textContent, '2026年');

    const rollingXLabels = idMap.get('plot').querySelectorAll('.x-label').map(n => n.textContent);
    assert.equal(rollingXLabels.length, 30);
    assert.equal(rollingXLabels[0], '10/16');
    assert.ok(rollingXLabels.includes('11/1'));
    assert.ok(rollingXLabels.includes('14'));
    const todayCol = idMap.get('plot').querySelectorAll('.bar-column').find(c => c.dataset.from === '2026-11-14');
    assert.equal(todayCol?.dataset.today, 'true');

    // Models in 30d window deduplicate thinking tiers & slugs into 7 canonical rows
    const cellText = el => el ? (el.textContent || (el.children || []).map(cellText).join('')) : '';
    const rowModels = idMap.get('table-body').children.map(tr => cellText(tr.children[0]));
    assert.deepEqual(rowModels, [
      'Gemini 3.8 Flash',
      'Gemini 4 Hydrogen',
      'Gemini 3.7 Flash',
      'Claude Sonnet 4.6',
      'GPT-OSS 120B',
      'Orchestrator (Argon)',
      'Gemini 4 Argon',
    ]);
    assert.equal(cellText(idMap.get('table-body').children[0].children[2]), '10,000');
    assert.equal(idMap.get('table-head').children.length, 9);

    // 7-day rolling preset
    preset7d.dispatch('click');
    assert.equal(preset7d.getAttribute('aria-pressed'), 'true');
    assert.equal(idMap.get('range-display').textContent, '2026-11-08 ~ 2026-11-14');
    assert.equal(idMap.get('plot').querySelectorAll('.bar-column').length, 7);

    // Month preset + month popover selection
    idMap.get('month-preset').dispatch('click');
    assert.equal(idMap.get('month-preset').getAttribute('aria-pressed'), 'true');
    assert.equal(idMap.get('range-display').textContent, '2026-11-01 ~ 2026-11-30');
    const novLabels = idMap.get('plot').querySelectorAll('.x-label').map(n => n.textContent);
    assert.equal(novLabels.length, 30);
    assert.ok(novLabels.includes('14'));

    const septOption = idMap.get('month-menu').children.find(o => o.dataset.month === '2026-09');
    assert.ok(septOption);
    septOption.dispatch('click');
    assert.equal(idMap.get('range-display').textContent, '2026-09-01 ~ 2026-09-30');
    assert.equal(idMap.get('month-preset-label').textContent, '2026-09');
    assert.deepEqual(
      idMap.get('table-body').children.map(tr => cellText(tr.children[0])),
      ['Gemini 3.7 Flash'],
    );

    // Year preset + clicking a month bar drills down to daily view for that month
    idMap.get('year-preset').dispatch('click');
    assert.equal(idMap.get('year-preset').getAttribute('aria-pressed'), 'true');
    assert.equal(idMap.get('range-display').textContent, '2026-01-01 ~ 2026-12-31');
    assert.equal(idMap.get('plot').dataset.mode, 'year');
    const monthCols = idMap.get('plot').querySelectorAll('.bar-column');
    assert.equal(monthCols.length, 12);
    const novMonthBar = monthCols.find(c => c.dataset.from === '2026-11-01');
    assert.ok(novMonthBar);
    novMonthBar.dispatch('click');
    assert.equal(idMap.get('month-preset').getAttribute('aria-pressed'), 'true');
    assert.equal(idMap.get('range-display').textContent, '2026-11-01 ~ 2026-11-30');

    // Annual heatmap month header & day tile cross-filter Breakdown
    const septMonthHeader = idMap.get('months').children.find(b => b.dataset.ym === '2026-09');
    assert.ok(septMonthHeader);
    septMonthHeader.dispatch('click');
    assert.equal(idMap.get('range-display').textContent, '2026-09-01 ~ 2026-09-30');

    preset30d.dispatch('click');
    const septCell = idMap.get('heat').children.find(b => b.dataset.from === '2026-09-10');
    assert.ok(septCell);
    septCell.dispatch('click');
    assert.equal(idMap.get('range-display').textContent, '2026-09-01 ~ 2026-09-30');
    const septBar = idMap.get('plot').querySelectorAll('.bar-column').find(c => c.dataset.from === '2026-09-10');
    assert.equal(septBar?.dataset.active, 'true');

    // Custom date range popover
    idMap.get('custom-preset').dispatch('click');
    assert.equal(idMap.get('custom-menu').open, true);
    idMap.get('custom-from').value = '2026-09-01';
    idMap.get('custom-to').value = '2026-09-15';
    idMap.get('custom-apply').dispatch('click');
    assert.equal(idMap.get('custom-preset').getAttribute('aria-pressed'), 'true');
    assert.equal(idMap.get('range-display').textContent, '2026-09-01 ~ 2026-09-15');
    assert.equal(idMap.get('plot').querySelectorAll('.bar-column').length, 15);
    assert.deepEqual(
      idMap.get('table-body').children.map(tr => cellText(tr.children[0])),
      ['Gemini 3.7 Flash'],
    );

    // Selecting an earlier year in top #year switches 30d/7d Breakdown to that year
    preset30d.dispatch('click');
    const year2025 = idMap.get('year-menu').children.find(o => o.dataset.year === '2025');
    assert.ok(year2025);
    year2025.dispatch('click');
    assert.equal(idMap.get('year-label').textContent, '2025');
    assert.equal(idMap.get('year-preset').textContent, '2025年');
    assert.equal(idMap.get('year-preset').getAttribute('aria-pressed'), 'true');
    assert.equal(idMap.get('range-display').textContent, '2025-01-01 ~ 2025-12-31');
    assert.deepEqual(
      idMap.get('table-body').children.map(tr => cellText(tr.children[0])),
      ['Gemini 3.7 Flash'],
    );

    dash.dispose();
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.getComputedStyle = prevComputed;
    globalThis.MutationObserver = prevMO;
  }
});

test('usage-ui header update button shows red dot on available update and supports online apply/reload', async () => {
  const createUsageDashboard = require('../../../compat/usage-ui.cjs');
  const createI18n = require('../../../compat/i18n.cjs');
  const idMap = new Map();
  const focusCalls = [];
  let doc = null;
  const makeEl = tag => {
    const attrs = new Map();
    const listeners = new Map();
    let _id = '';
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      get id() { return _id; },
      set id(v) { _id = String(v || ''); if (_id) idMap.set(_id, el); },
      get ownerDocument() { return doc; },
      parentNode: null,
      parentElement: null,
      hidden: false,
      disabled: false,
      open: false,
      tabIndex: 0,
      dataset: {},
      textContent: '',
      innerHTML: '',
      title: '',
      isConnected: true,
      children: [],
      style: makeStyleStore(),
      attributes: attrs,
      firstElementChild: null,
      get lastElementChild() { return el.children.at(-1) ?? null; },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      removeAttribute(k) { attrs.delete(k); },
      hasAttribute(k) { return attrs.has(k); },
      append(...nodes) {
        for (const n of nodes) if (n && typeof n === 'object') { n.parentElement = el; n.parentNode = el; el.children.push(n); }
        el.firstElementChild = el.children.find(c => c.tagName) ?? null;
      },
      before() {},
      after() {},
      replaceChildren(...nodes) { el.children = []; el.append(...nodes); },
      remove() {},
      closest: () => null,
      matches: () => false,
      showPopover() { el.open = true; },
      hidePopover() { el.open = false; },
      focus() { focusCalls.push(el); },
      animate: () => ({ cancel() {} }),
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
      removeEventListener() {},
      dispatch(type) { for (const fn of listeners.get(type) || []) fn({ target: el, preventDefault() {}, stopPropagation() {} }); },
      getClientRects: () => [{ width: 20, height: 20 }],
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400 }),
      querySelector(sel) { return el.querySelectorAll(sel)[0] ?? null; },
      querySelectorAll(sel) {
        const list = [];
        const walk = node => { for (const c of node.children || []) { list.push(c); walk(c); } };
        walk(el);
        const parts = sel.split(',').map(p => p.trim());
        return list.filter(n => parts.some(p => {
          if (p.startsWith('.')) return String(n.className || '').split(/\s+/).includes(p.slice(1));
          const m = p.match(/^\[([a-z-]+)\]$/);
          if (m) return n.attributes?.has(m[1]);
          return n.tagName === p.toUpperCase();
        }));
      },
      attachShadow() {
        const sr = makeEl('shadow');
        sr.getElementById = id => idMap.get(id) ?? null;
        return sr;
      },
    };
    return el;
  };
  doc = {
    defaultView: { addEventListener() {}, removeEventListener() {}, innerWidth: 1200, innerHeight: 900 },
    createElement: tag => tag === 'canvas' ? { width: 1, height: 1, getContext: () => makeCanvasContext() } : makeEl(tag),
    createTextNode: text => ({ textContent: text }),
    addEventListener() {},
    removeEventListener() {},
  };
  const prevDoc = globalThis.document, prevWin = globalThis.window, prevComputed = globalThis.getComputedStyle, prevMO = globalThis.MutationObserver;
  globalThis.document = doc;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1200, innerHeight: 900 };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  const setMarkup = (target, markup) => {
    target.innerHTML = markup;
    target.children = [];
    const stack = [target];
    const voidTags = new Set(['path', 'i', 'br']);
    for (const m of markup.matchAll(/<\/?([a-z0-9-]+)\b([^>]*)>/gi)) {
      const full = m[0], tag = m[1].toLowerCase(), rawAttrs = m[2];
      if (full.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      const n = makeEl(tag);
      for (const a of rawAttrs.matchAll(/([a-z0-9-]+)(?:="([^"]*)")?/gi)) {
        const k = a[1], v = a[2] ?? '';
        n.setAttribute(k, v);
        if (k === 'class') n.className = v;
        if (k === 'hidden') n.hidden = true;
      }
      stack.at(-1).append(n);
      if (!full.endsWith('/>') && !voidTags.has(tag)) stack.push(n);
    }
  };

  const calls = [];
  try {
    const root = makeEl('div');
    const dash = createUsageDashboard({
      root,
      language: createI18n('zh-CN'),
      setMarkup,
      guideDismissed: true,
      onDismissGuide: async () => {},
      onLanguage: async () => {},
      onRefresh: async () => {},
      onUpdate: async input => {
        calls.push(input);
        if (input.action === 'apply') return { state: 'reloading', currentVersion: '1.0.2', latestVersion: '1.0.2', progress: { phase: 'complete' } };
        if (input.action === 'status') return { state: 'reloading', currentVersion: '1.0.2', latestVersion: '1.0.2', progress: { phase: 'complete' } };
        return { state: 'available', currentVersion: '1.0.0', latestVersion: '1.0.2', notes: '## v1.0.2\n- **更新**：新增主题提醒\n**Full Changelog**: https://example.com' };
      },
    });
    const usageData = { today: '2026-11-16', firstDate: '2026-11-16', timeZone: 'Asia/Shanghai', requests: 1, models: [], days: [] };
    dash.open(usageData, null, { state: 'current', currentVersion: '1.0.0', latestVersion: '1.0.0' });
    assert.equal(focusCalls.at(-1)?.className, 'page', 'opening dashboard should focus page container rather than #locale');
    assert.equal(idMap.get('action-tip').hidden, true);
    assert.equal(idMap.get('version-tag').hidden, false);
    assert.equal(idMap.get('version-tag').textContent, 'v1.0.0');
    dash.update(usageData, { state: 'idle' });
    assert.equal(idMap.get('version-tag').hidden, true);
    dash.update(usageData, { state: 'current', currentVersion: '1.0.0', latestVersion: '1.0.0' });
    assert.equal(idMap.get('version-tag').hidden, false);
    assert.equal(idMap.get('version-tag').textContent, 'v1.0.0');
    idMap.get('locale').dispatch('focus');
    assert.equal(idMap.get('action-tip').hidden, true, 'programmatic focus without :focus-visible must not show tooltip');
    const prevLocaleMatches = idMap.get('locale').matches;
    idMap.get('locale').matches = sel => sel === ':focus-visible';
    idMap.get('locale').dispatch('focus');
    assert.equal(idMap.get('action-tip').hidden, false);
    idMap.get('locale').dispatch('blur');
    idMap.get('locale').matches = prevLocaleMatches;
    assert.equal(idMap.get('action-tip').hidden, true);
    assert.equal(idMap.get('update-dot').hidden, true);
    assert.equal(idMap.get('subtitle'), undefined);
    assert.equal(idMap.get('timezone'), undefined);
    assert.equal(idMap.get('coverage').textContent, '1 次请求 · 始于 2026-11-16');
    assert.equal(idMap.get('sync-prog-wrap').hidden, true);
    assert.equal(idMap.get('alert').hidden, true);

    const firstHeatTile = idMap.get('heat').children[0];
    dash.update({ ...usageData, partialRequests: 361, syncing: false, retryingConversations: 1 });
    assert.equal(idMap.get('sync-prog-wrap').hidden, true);
    assert.equal(idMap.get('alert').hidden, true, 'partialRequests alone must not trigger permanent unreadable alert');
    assert.equal(idMap.get('heat').children[0], firstHeatTile, 'non-chart updates must not rebuild heatmap DOM');

    dash.update({ ...usageData, syncing: true, summaryStale: true, syncMode: null, syncProgress: null });
    assert.equal(idMap.get('sync-prog-wrap').hidden, true, 'transient live write summaryStale must not flash sync progress bar');
    assert.equal(idMap.get('refresh').disabled, false);

    dash.update({ ...usageData, syncing: true, syncMode: 'incremental', syncProgress: null });
    assert.equal(idMap.get('sync-prog-wrap').hidden, false);
    assert.equal(idMap.get('sync-prog-wrap').getAttribute('aria-valuenow'), '2');
    assert.equal(idMap.get('sync-prog-fill').style.getPropertyValue('transform'), 'scaleX(0.02)');
    assert.equal(idMap.get('refresh').disabled, true);
    assert.equal(idMap.get('refresh').getAttribute('aria-busy'), 'true');
    assert.equal(idMap.get('heat').children[0], firstHeatTile);

    dash.update({ ...usageData, syncing: true, syncMode: 'full', syncProgress: { done: 5, total: 10 } });
    assert.equal(idMap.get('sync-prog-wrap').hidden, false);
    assert.equal(idMap.get('sync-prog-wrap').getAttribute('aria-valuenow'), '50');
    assert.equal(idMap.get('sync-prog-fill').style.getPropertyValue('transform'), 'scaleX(0.5)');
    assert.equal(idMap.get('refresh').disabled, true);

    dash.update({ ...usageData, syncing: false, syncMode: null, syncProgress: null, unreadableFiles: 1 });
    assert.equal(idMap.get('sync-prog-wrap').hidden, true);
    assert.equal(idMap.get('sync-prog-fill').style.getPropertyValue('transform'), 'scaleX(0)');
    assert.equal(idMap.get('alert').hidden, false);
    assert.equal(idMap.get('alert').textContent, '部分记录暂不可读取，用量可能不完整');

    // High-FPS rAF completion sweeps all the way to scaleX(1) (100%) before hiding,
    // proportional step creeping stays smooth without stalling at 78%,
    // and closing mid-sync clears animation so reopening later never replays old progress.
    const rafQueue = [];
    const prevRaf = globalThis.requestAnimationFrame, prevCancelRaf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = fn => { rafQueue.push(fn); return rafQueue.length; };
    globalThis.cancelAnimationFrame = () => {};
    try {
      dash.update({ ...usageData, syncing: true, syncMode: 'incremental', syncProgress: { done: 1, total: 10 } });
      let ts = 16;
      for (let i = 0; i < 60 && rafQueue.length; i++, ts += 16) rafQueue.shift()(ts);
      const midVal = Number(idMap.get('sync-prog-wrap').getAttribute('aria-valuenow'));
      assert.ok(midVal >= 10 && midVal < 30, `expected proportional in-slice progress for 1/10, got ${midVal}`);
      dash.update({ ...usageData, syncing: false, syncMode: null, syncProgress: null });
      while (rafQueue.length && ts < 4000) { rafQueue.shift()(ts); ts += 16; }
      assert.equal(idMap.get('sync-prog-fill').style.getPropertyValue('transform'), 'scaleX(1)');
      assert.equal(idMap.get('sync-prog-wrap').getAttribute('aria-valuenow'), '100');

      // Mid-sync close + reopen after completion must not replay leftover progress
      dash.update({ ...usageData, syncing: true, syncMode: 'incremental', syncProgress: { done: 2, total: 4 } });
      if (rafQueue.length) rafQueue.shift()(ts + 16);
      assert.equal(idMap.get('sync-prog-wrap').hidden, false);
      dash.close();
      assert.equal(idMap.get('sync-prog-wrap').hidden, true);
      assert.equal(idMap.get('sync-prog-fill').style.getPropertyValue('transform'), 'scaleX(0)');
      rafQueue.length = 0;
      dash.open({ ...usageData, syncing: false, syncMode: null, syncProgress: null }, null, { state: 'current', currentVersion: '1.0.0', latestVersion: '1.0.0' });
      assert.equal(idMap.get('sync-prog-wrap').hidden, true);
      assert.equal(rafQueue.length, 0, 'reopening idle dashboard after close must not resume stale rAF progress');
    } finally {
      globalThis.requestAnimationFrame = prevRaf;
      globalThis.cancelAnimationFrame = prevCancelRaf;
    }

    idMap.get('refresh').dispatch('click');
    assert.equal(idMap.get('refresh').disabled, true);
    assert.equal(idMap.get('refresh').getAttribute('aria-busy'), 'true');
    assert.equal(idMap.get('refresh').dataset.hoverMuted, '1');
    idMap.get('refresh').dispatch('pointerleave');
    assert.equal(idMap.get('refresh').dataset.hoverMuted, '1', 'synthetic pointerleave emitted while button is disabled must not clear hoverMuted');
    await new Promise(r => setImmediate(r));
    assert.equal(idMap.get('refresh').disabled, false, 'refresh button must unlock immediately when refresh completes');
    assert.equal(idMap.get('refresh').getAttribute('aria-busy'), 'false');
    idMap.get('refresh').dispatch('pointerenter');
    assert.equal(idMap.get('action-tip').hidden, true, 'synthetic pointerenter after unlock without pointer movement must not show refresh tip');
    assert.equal(idMap.get('refresh').dataset.hoverMuted, '1', 'hover background must stay muted until pointer leaves or moves');
    idMap.get('refresh').dispatch('pointerleave');
    assert.equal(idMap.get('refresh').dataset.hoverMuted, undefined);

    dash.update({ ...usageData, syncing: false, confirmedMissingConversations: 1 });
    assert.equal(idMap.get('alert').hidden, false);
    dash.update({ ...usageData, syncing: false, persistenceError: true });
    assert.equal(idMap.get('alert').hidden, false);
    dash.update({ ...usageData, syncing: false });
    assert.equal(idMap.get('alert').hidden, true);

    dash.update(usageData, {
      state: 'available',
      currentVersion: '1.0.0',
      latestVersion: '1.0.1',
      notes: '## v1.0.2\n- **更新**：精简界面\n- 第2行\n- 第3行\n- 第4行\n- 第5行\n**Full Changelog**: https://github.com/1swei/antigravity-context/compare/v1.0.0...v1.0.2',
    });
    assert.equal(idMap.get('update-dot').hidden, false);

    idMap.get('update-btn').dispatch('pointerenter');
    assert.equal(idMap.get('action-tip').hidden, false);
    assert.equal(idMap.get('action-tip').textContent, '发现新版本 · 点击查看更新');
    assert.equal(idMap.get('update-btn').title, '');
    assert.equal(idMap.get('locale').title, '');
    assert.equal(idMap.get('refresh').title, '');
    assert.equal(idMap.get('close').title, '');
    idMap.get('update-btn').dispatch('pointerleave');
    assert.equal(idMap.get('action-tip').hidden, true);

    idMap.get('refresh').dispatch('pointerenter');
    assert.equal(idMap.get('action-tip').hidden, false);
    assert.equal(idMap.get('action-tip').textContent, '刷新');
    idMap.get('refresh').dispatch('pointerleave');
    assert.equal(idMap.get('action-tip').hidden, true);

    idMap.get('update-btn').dispatch('click');
    assert.equal(idMap.get('update-menu').open, true);
    assert.equal(idMap.get('upd-cur').textContent, 'v1.0.0');
    assert.equal(idMap.get('upd-lat').textContent, 'v1.0.1');
    assert.equal(idMap.get('upd-notes').textContent, '• 更新：精简界面\n• 第2行\n• 第3行\n• 第4行\n…');
    assert.equal(idMap.get('upd-feedback').textContent, '');
    assert.equal(idMap.get('upd-action').textContent, '立即更新');
    await new Promise(r => setImmediate(r));
    assert.deepEqual(calls[0], { action: 'check' });
    assert.equal(idMap.get('upd-lat').textContent, 'v1.0.2');
    assert.equal(idMap.get('upd-notes').textContent, '• 更新：新增主题提醒');

    idMap.get('upd-action').dispatch('click');
    await new Promise(r => setImmediate(r));
    assert.deepEqual(calls[1], { action: 'apply', version: '1.0.2' });
    assert.equal(idMap.get('upd-status').textContent, '更新已安装，正在自动重载…');
    assert.equal(idMap.get('upd-feedback').textContent, '新版本将在几秒内自动生效');
    assert.equal(idMap.get('upd-action').hidden, true);
    assert.equal(idMap.get('update-dot').hidden, true);
    assert.deepEqual(dash.getUpdateState(), { state: 'reloading', currentVersion: '1.0.2', latestVersion: '1.0.2', progress: { phase: 'complete' }, busy: false });

    dash.setUpdateNotice({ state: 'reloading', version: '1.0.2' });
    assert.equal(idMap.get('update-notice').hidden, false);
    assert.equal(idMap.get('update-notice').dataset.state, 'reloading');
    assert.equal(idMap.get('update-notice-title').textContent, '正在完成插件重载…');
    assert.equal(idMap.get('update-notice-detail').textContent, '正在激活 v1.0.2');

    dash.setUpdateNotice({ state: 'reloaded', version: '1.0.2' });
    assert.equal(idMap.get('update-notice').hidden, false);
    assert.equal(idMap.get('update-notice').dataset.state, 'reloaded');
    assert.equal(idMap.get('update-notice-title').textContent, '更新成功，插件已自动重载');
    assert.equal(idMap.get('update-notice-detail').textContent, '当前版本 v1.0.2');

    idMap.get('update-notice-close').dispatch('click');
    assert.equal(idMap.get('update-notice').hidden, true);

    dash.setUpdateNotice({ state: 'reloaded', version: '1.0.2' });
    assert.equal(idMap.get('update-notice').hidden, false);
    dash.close();
    assert.equal(idMap.get('update-notice').hidden, true);
    dash.dispose();
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.getComputedStyle = prevComputed;
    globalThis.MutationObserver = prevMO;
  }
});

test('inline-widget reopens usage modal after update reload and shows reload-success notice', async () => {
  const createUsageDashboard = require('../../../compat/usage-ui.cjs');
  const createI18n = require('../../../compat/i18n.cjs');
  const createTheme = require('../../../compat/theme.cjs');
  const installInline = require('../../../compat/inline-widget.cjs');

  let createdIds = new Map();
  let doc = null;
  const makeNode = tag => {
    const attrs = new Map();
    const listeners = new Map();
    let _id = '';
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      get id() { return _id; },
      set id(v) { _id = String(v || ''); if (_id) createdIds.set(_id, el); },
      hidden: false,
      disabled: false,
      open: false,
      tabIndex: 0,
      dataset: {},
      className: '',
      textContent: '',
      innerHTML: '',
      title: '',
      isConnected: true,
      children: [],
      style: makeStyleStore(),
      attributes: attrs,
      firstElementChild: null,
      get lastElementChild() { return el.children.at(-1) ?? null; },
      get ownerDocument() { return doc; },
      parentElement: null,
      parentNode: null,
      previousElementSibling: null,
      nextSibling: null,
      get clientWidth() { return 640; },
      get scrollWidth() { return 240; },
      classList: {
        add(...cs) { for (const c of cs) if (!el.className.split(/\s+/).includes(c)) el.className = `${el.className} ${c}`.trim(); },
        remove(...cs) { el.className = el.className.split(/\s+/).filter(x => x && !cs.includes(x)).join(' '); },
        toggle(c, on) { if (on) el.classList.add(c); else el.classList.remove(c); },
        contains(c) { return el.className.split(/\s+/).includes(c); },
      },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      removeAttribute(k) { attrs.delete(k); },
      hasAttribute(k) { return attrs.has(k); },
      append(...nodes) {
        for (const n of nodes) if (n && typeof n === 'object') { n.parentElement = el; n.parentNode = el; el.children.push(n); }
        el.firstElementChild = el.children.find(c => c.tagName) ?? null;
      },
      after(...nodes) { el.parentElement?.append(...nodes); },
      before() {},
      insertBefore(n) { el.append(n); return n; },
      replaceChildren(...nodes) { el.children = []; el.append(...nodes); },
      remove() { el.isConnected = false; },
      closest: () => null,
      matches: sel => (sel === ':popover-open' ? el.open : false),
      showPopover() { el.open = true; },
      hidePopover() { el.open = false; },
      focus() {},
      animate: () => ({ cancel() {} }),
      getClientRects: () => [{ width: 20, height: 20 }],
      getBoundingClientRect: () => ({ left: 100, top: 300, right: 740, bottom: 328, width: 640, height: 28 }),
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      dispatch(type, event = {}) { for (const fn of listeners.get(type) || []) fn({ stopPropagation() {}, preventDefault() {}, target: el, currentTarget: el, ...event }); },
      querySelector(sel) { return el.querySelectorAll(sel)[0] ?? null; },
      querySelectorAll(sel) {
        const list = [];
        const walk = n => { for (const c of n.children || []) { list.push(c); walk(c); } };
        walk(el);
        const parts = sel.split(',').map(p => p.trim());
        return list.filter(n => parts.some(p => {
          if (p.startsWith('.')) return String(n.className || '').split(/\s+/).includes(p.slice(1));
          if (p.startsWith('#')) return n.id === p.slice(1);
          const eq = p.match(/^\[([^=\]]+)=["']?([^"'\]]+)["']?\]$/);
          if (eq) return (eq[1].startsWith('data-') ? n.dataset?.[eq[1].slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase())] : n.attributes?.get(eq[1])) === eq[2];
          const has = p.match(/^\[([^\]=]+)\]$/);
          if (has) return n.attributes?.has(has[1]) || false;
          return n.tagName === p.toUpperCase();
        }));
      },
      attachShadow() {
        const sr = makeNode('shadow');
        sr.getElementById = id => createdIds.get(id) ?? null;
        sr.host = el;
        return sr;
      },
    };
    return el;
  };
  const setMarkup = (target, markup) => {
    target.innerHTML = markup;
    target.children = [];
    const stack = [target];
    const voidTags = new Set(['path', 'circle', 'i', 'br']);
    for (const m of markup.matchAll(/<\/?([a-z0-9-]+)\b([^>]*)>/gi)) {
      const full = m[0], tag = m[1].toLowerCase(), rawAttrs = m[2];
      if (full.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      const n = makeNode(tag);
      for (const am of rawAttrs.matchAll(/([a-z0-9-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi)) {
        const k = am[1]; if (!k || k === '/') continue;
        const v = am[2] ?? am[3] ?? am[4] ?? '';
        n.setAttribute(k, v);
        if (k === 'class') n.className = v;
        else if (k === 'hidden') n.hidden = true;
        else if (k.startsWith('data-')) n.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
      }
      stack[stack.length - 1].append(n);
      if (!rawAttrs.trim().endsWith('/') && !voidTags.has(tag)) stack.push(n);
    }
  };
  const sStorage = new Map();
  let currentVersion = '1.0.7';
  const prev = {
    document: globalThis.document,
    window: globalThis.window,
    location: globalThis.location,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    getComputedStyle: globalThis.getComputedStyle,
    matchMedia: globalThis.matchMedia,
    MutationObserver: globalThis.MutationObserver,
    ResizeObserver: globalThis.ResizeObserver,
    CSS: globalThis.CSS,
    innerWidth: globalThis.innerWidth,
    innerHeight: globalThis.innerHeight,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  const rootEl = makeNode('html'), bodyEl = makeNode('body'), row = makeNode('div'), branch = makeNode('div'), editor = makeNode('div');
  row.append(branch);
  doc = {
    readyState: 'complete',
    documentElement: rootEl,
    body: bodyEl,
    head: makeNode('head'),
    defaultView: { addEventListener() {}, removeEventListener() {}, innerWidth: 1200, innerHeight: 900 },
    createElement: tag => tag === 'canvas' ? { width: 1, height: 1, getContext: () => makeCanvasContext() } : makeNode(tag),
    createTextNode: text => ({ textContent: text }),
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll: () => [],
  };
  globalThis.document = doc;
  globalThis.location = { pathname: '/c/11111111-1111-1111-1111-111111111111' };
  globalThis.localStorage = { getItem: k => (k === 'ag-pulse-language' ? 'zh-CN' : null), setItem() {} };
  globalThis.CSS = { supports: () => true };
  globalThis.innerWidth = 1200;
  globalThis.innerHeight = 900;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.sessionStorage = {
    getItem: k => (sStorage.has(k) ? sStorage.get(k) : null),
    setItem: (k, v) => { sStorage.set(k, String(v)); },
    removeItem: k => { sStorage.delete(k); },
  };
  globalThis.getComputedStyle = el => el === bodyEl
    ? { fontFamily: '"Google Sans Flex", sans-serif', getPropertyValue: () => '' }
    : { display: 'flex', flexDirection: 'row', position: 'static', visibility: 'visible', colorScheme: 'light', marginLeft: '0', marginRight: '0', columnGap: '4', paddingLeft: '0', paddingRight: '0', gap: '4', fontFamily: 'system-ui', getPropertyValue: () => '' };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    matchMedia: globalThis.matchMedia,
    innerWidth: 1200,
    innerHeight: 900,
    __agPulseI18nFactory: createI18n,
    __agPulseThemeFactory: createTheme,
    __agPulseUsageFactory: createUsageDashboard,
    __agPulseSurface: {
      useSharedComposer: false,
      showEmpty: true,
      findComposer: () => ({ editor, model: branch, row, branch, box: row, kind: 'main' }),
      conversationId: () => '11111111-1111-1111-1111-111111111111',
      nativeReserve: () => 0,
      setMarkup,
    },
    agPulseHost: {
      getPreferences: async () => ({ language: 'zh-CN', revision: 1, languageGuideDismissed: true, usageGuideDismissed: true }),
      setPreferences: async p => ({ ...p, revision: 2 }),
      getMetrics: async () => ({
        connection: 'live',
        preferences: { language: 'zh-CN', revision: 1, languageGuideDismissed: true, usageGuideDismissed: true },
        speed: {
          conversationId: '11111111-1111-1111-1111-111111111111',
          rounds: 1, steps: 2, measuredRequests: 1, tps: 120, latestTps: 120, latestRateStatus: 'ok',
          context: { usedTokens: 24000, maxTokens: 100000, usedFraction: 0.24, remainingFraction: 0.76, estimated: false },
          cache: { hitRate: 0.9, totalTokens: 1000, cachedTokens: 900, uncachedTokens: 100, cacheWriteTokens: 0, outputTokens: 50, measuredRequests: 1 },
          tokens: { totalTokens: 1000, cachedTokens: 900, uncachedTokens: 100, cacheWriteTokens: 0, outputTokens: 50, measuredRequests: 1 },
        },
        usage: { accountKey: 'acct', today: '2026-11-18', firstDate: '2026-11-18', timeZone: 'Asia/Shanghai', requests: 1, todayTokens: 1000, weekTokens: 1000, monthTokens: 1000, totalTokens: 1000, models: [], days: [] },
        update: currentVersion === '1.0.7'
          ? { state: 'available', currentVersion: '1.0.7', latestVersion: '1.0.8' }
          : { state: 'current', currentVersion: '1.0.8', latestVersion: '1.0.8' },
      }),
      updatePlugin: async input => {
        if (input.action === 'apply') return { state: 'reloading', currentVersion: '1.0.8', latestVersion: '1.0.8', progress: { phase: 'complete' } };
        return { state: 'available', currentVersion: '1.0.7', latestVersion: '1.0.8' };
      },
      report() {},
    },
  };

  try {
    installInline();
    await new Promise(r => setTimeout(r, 30));
    createdIds.get('open-usage').dispatch('click');
    await new Promise(r => setTimeout(r, 20));
    assert.equal(createdIds.get('usage-dashboard').open, true);

    createdIds.get('update-btn').dispatch('click');
    await new Promise(r => setImmediate(r));
    createdIds.get('upd-action').dispatch('click');
    await new Promise(r => setImmediate(r));

    // Sidecar shuts down and disposes old widget while modal is open
    globalThis.window.__agPulseDispose();
    assert.equal(globalThis.window.__agPulseHandover?.updateReload?.reopenModal, true);
    assert.equal(globalThis.window.__agPulseHandover?.updateReload?.toVersion, '1.0.8');
    assert.equal(sStorage.has('ag-pulse-update-reload-v1'), true);

    // New sidecar boots at v1.0.8 and mounts new widget
    currentVersion = '1.0.8';
    createdIds = new Map();
    installInline();
    assert.equal(createdIds.get('usage-dashboard').open, true, 'usage modal should reopen immediately after update reload');
    assert.equal(sStorage.has('ag-pulse-update-reload-v1'), false);
    await new Promise(r => setTimeout(r, 30));
    assert.equal(createdIds.get('usage-dashboard').open, true);
    assert.equal(createdIds.get('version-tag').textContent, 'v1.0.8');
    assert.equal(createdIds.get('update-notice').hidden, false);
    assert.equal(createdIds.get('update-notice').dataset.state, 'reloaded');
    assert.equal(createdIds.get('update-notice-title').textContent, '更新成功，插件已自动重载');
    assert.equal(createdIds.get('update-notice-detail').textContent, '当前版本 v1.0.8');

    // Negative case: closing modal before an unrelated reload must not auto-open modal
    createdIds.get('close').dispatch('click');
    assert.equal(createdIds.get('usage-dashboard').open, false);
    globalThis.window.__agPulseDispose();
    assert.equal(globalThis.window.__agPulseHandover?.updateReload, undefined);
    createdIds = new Map();
    installInline();
    await new Promise(r => setTimeout(r, 20));
    assert.equal(createdIds.get('usage-dashboard').open, false);
  } finally {
    globalThis.window?.__agPulseDispose?.();
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  }
});
