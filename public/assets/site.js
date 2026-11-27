// agentprobe site: theme, copy, command palette, live audit console, compare & draft validator.
(() => {
  'use strict';

  const root = document.documentElement;
  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* storage blocked, session only */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* storage blocked */ }
    }
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  const savedTheme = store.get('ap-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') root.dataset.theme = savedTheme;

  function applyTheme(next) {
    root.dataset.theme = next;
    store.set('ap-theme', next);
    const toggle = document.querySelector('[data-theme-toggle]');
    if (toggle) {
      const dark = next === 'dark';
      toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
      toggle.setAttribute('title', dark ? 'Light theme' : 'Dark theme');
    }
  }

  const toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    const sync = () => {
      const dark = root.dataset.theme === 'dark';
      toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
      toggle.setAttribute('title', dark ? 'Light theme' : 'Dark theme');
    };
    sync();
    toggle.addEventListener('click', () => {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  }

  // Minimal supplementary rules for staged progress, delta pills, and matrix table
  if (!document.getElementById('ap-ux-styles')) {
    const style = document.createElement('style');
    style.id = 'ap-ux-styles';
    style.textContent = `
      [hidden] { display: none !important; }
      .ap-stages { display: grid; gap: 0.35rem; margin-top: 0.2rem; }
      .ap-stage { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--text-dim); }
      .ap-stage.is-active { color: var(--text); }
      .ap-stage.is-done { color: var(--pass); }
      .ap-stage-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
      .ap-progress-track { height: 4px; border-radius: 999px; background: var(--bg-subtle); overflow: hidden; }
      .ap-progress-fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width 350ms var(--ease); }
      .gain-pill { padding: 0.12rem 0.45rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent-text); font-size: 0.7rem; font-weight: 600; white-space: nowrap; }
      .delta-pos { color: var(--pass); font-weight: 600; }
      .delta-neg { color: var(--fail); font-weight: 600; }
      .delta-zero { color: var(--text-dim); }
      .compare-matrix { width: 100%; border-collapse: collapse; font-size: 0.78rem; border: 0; }
      .compare-matrix th, .compare-matrix td { padding: 0.5rem 0.65rem; border-bottom: 1px solid var(--border); }
      .compare-matrix th.num, .compare-matrix td.num { white-space: nowrap; }
      .compare-matrix th { background: var(--bg-subtle); color: var(--text-muted); font-weight: 600; }
      .compare-matrix tr:last-child td { border-bottom: 0; }
    `;
    document.head.appendChild(style);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.append(toast);
  let toastTimer;

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      notify((label || 'Text') + ' copied');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      notify((label || 'Text') + ' copied');
    }
  }

  function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(filename + ' downloaded');
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-copy], [data-copy-from]');
    if (!trigger) return;
    const source = trigger.dataset.copyFrom
      ? document.querySelector(trigger.dataset.copyFrom)
      : null;
    const text = source ? source.textContent.trim() : trigger.dataset.copy;
    if (text) copy(text, trigger.dataset.copyLabel || 'Text');
  });

  // --- History Persistence (Tier 2: last 8 audits in localStorage ap-history) ---
  const HISTORY_KEY = 'ap-history';
  const HISTORY_LIMIT = 8;

  function loadHistory() {
    try {
      const raw = store.get(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveHistoryEntry(report) {
    if (!report || !report.target || typeof report.totalScore !== 'number') return loadHistory();
    const list = loadHistory();
    const prevSame = list.find((item) => item.url === report.target);
    const delta = prevSame && typeof prevSame.score === 'number'
      ? report.totalScore - prevSame.score
      : null;

    let host = report.target;
    try { host = new URL(report.target).hostname; } catch { /* keep raw */ }

    const entry = {
      url: report.target,
      host,
      score: report.totalScore,
      prevScore: prevSame ? prevSame.score : null,
      delta,
      grade: report.grade || '',
      timestamp: report.timestamp || new Date().toISOString()
    };

    const next = [entry, ...list.filter((item) => item.url !== report.target)].slice(0, HISTORY_LIMIT);
    store.set(HISTORY_KEY, JSON.stringify(next));
    return next;
  }

  function formatDeltaHtml(delta) {
    if (typeof delta !== 'number' || Number.isNaN(delta)) return '';
    if (delta > 0) return '<span class="delta-pos">+' + delta + ' pts</span>';
    if (delta < 0) return '<span class="delta-neg">' + delta + ' pts</span>';
    return '<span class="delta-zero">0 pts</span>';
  }

  // --- Command Palette (Tier 2: #cmdk-trigger & Cmd/Ctrl+K -> #cmdk-modal) ---
  const DEFAULT_PRESETS = [
    { label: 'agentprobe', url: 'https://agentprobe-self.vercel.app' },
    { label: 'jev-seo', url: 'https://jevseo.vercel.app' },
    { label: 'tdlib-android', url: 'https://tdlib-android.vercel.app' }
  ];

  const DOC_LINKS = [
    { label: 'Docs: Install & Quickstart', hint: '/docs#install', href: '/docs#install' },
    { label: 'Docs: 5 Audit Pillars', hint: '/docs#pillars', href: '/docs#pillars' },
    { label: 'Docs: CLI Flags', hint: '/docs#flags', href: '/docs#flags' },
    { label: 'Docs: CI Gate', hint: '/docs#ci', href: '/docs#ci' },
    { label: 'Docs: Node API', hint: '/docs#api', href: '/docs#api' }
  ];

  let onAuditNavigate = null;
  let onModeSwitch = null;

  function initCommandPalette() {
    const trigger = document.getElementById('cmdk-trigger');
    const modal = document.getElementById('cmdk-modal');
    if (!modal) return;

    const searchInput = modal.querySelector('#cmdk-input') || modal.querySelector('input');
    const closeBtn = modal.querySelector('#cmdk-close');
    const listEl = modal.querySelector('#cmdk-list') || modal.querySelector('[role="listbox"]');
    let activeIndex = 0;
    let currentItems = [];
    let lastFocused = null;

    function isOpen() {
      return typeof modal.showModal === 'function' ? Boolean(modal.open) : !modal.hidden;
    }

    function openModal() {
      lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof modal.showModal === 'function') {
        if (!modal.open) modal.showModal();
      } else {
        modal.hidden = false;
      }
      if (searchInput) {
        searchInput.value = '';
        searchInput.setAttribute('aria-expanded', 'true');
        renderItems('');
        requestAnimationFrame(() => searchInput.focus());
      } else {
        renderItems('');
      }
    }

    function closeModal() {
      if (typeof modal.close === 'function') {
        if (modal.open) modal.close();
      } else {
        modal.hidden = true;
      }
      if (searchInput) searchInput.setAttribute('aria-expanded', 'false');
      if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
      }
      lastFocused = null;
    }

    function buildCommands() {
      const items = [];
      const history = loadHistory();
      history.forEach((h) => {
        const deltaStr = typeof h.delta === 'number' && h.delta !== 0
          ? ' (' + (h.delta > 0 ? '+' : '') + h.delta + ' pts)'
          : '';
        items.push({
          label: 'Recent: ' + h.host,
          hint: h.score + '/100' + deltaStr,
          keywords: 'recent history ' + h.url + ' ' + h.host,
          run: () => {
            if (onAuditNavigate) onAuditNavigate(h.url);
            else location.href = '/?url=' + encodeURIComponent(h.url);
          }
        });
      });

      const presetNodes = Array.from(document.querySelectorAll('[data-preset]'));
      const presets = presetNodes.length
        ? presetNodes.map((n) => ({ label: n.textContent.trim(), url: n.dataset.preset }))
        : DEFAULT_PRESETS;

      presets.forEach((p) => {
        items.push({
          label: 'Audit preset: ' + p.label,
          hint: p.url.replace(/^https?:\/\//, ''),
          keywords: 'preset audit ' + p.label + ' ' + p.url,
          run: () => {
            if (onAuditNavigate) onAuditNavigate(p.url);
            else location.href = '/?url=' + encodeURIComponent(p.url);
          }
        });
      });

      if (onModeSwitch) {
        items.push({
          label: 'Mode: Live URL',
          hint: 'Single target',
          keywords: 'mode live url audit',
          run: () => onModeSwitch('url')
        });
        items.push({
          label: 'Mode: Paste Draft (Offline)',
          hint: 'HTML / llms.txt / robots.txt / JSON',
          keywords: 'mode offline paste draft validator llms.txt robots.txt html json',
          run: () => onModeSwitch('draft')
        });
        items.push({
          label: 'Mode: Compare two URLs',
          hint: 'Side-by-side delta',
          keywords: 'mode compare diff matrix url',
          run: () => onModeSwitch('compare')
        });
      }

      const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      items.push({
        label: 'Toggle theme (' + nextTheme + ')',
        hint: 'Appearance',
        keywords: 'theme dark light appearance toggle',
        run: () => applyTheme(nextTheme)
      });

      DOC_LINKS.forEach((doc) => {
        items.push({
          label: doc.label,
          hint: doc.hint,
          keywords: 'docs documentation ' + doc.label + ' ' + doc.href,
          run: () => { location.href = doc.href; }
        });
      });

      if (!onAuditNavigate) {
        items.push({
          label: 'Home: Live Audit Console',
          hint: '/',
          keywords: 'home console audit',
          run: () => { location.href = '/'; }
        });
      }

      return items;
    }

    function renderItems(query) {
      if (!listEl) return;
      const q = (query || '').trim().toLowerCase();
      const all = buildCommands();
      currentItems = q
        ? all.filter((item) => (item.label + ' ' + item.hint + ' ' + item.keywords).toLowerCase().includes(q))
        : all;
      activeIndex = 0;

      listEl.innerHTML = currentItems.map((item, idx) => (
        '<button type="button" id="cmdk-opt-' + idx + '" class="cmdk-item' + (idx === 0 ? ' is-active' : '') + '" role="option" aria-selected="' + (idx === 0) + '" data-cmdk-idx="' + idx + '">' +
          '<span>' + escapeHtml(item.label) + '</span>' +
          '<span class="cmdk-item-hint">' + escapeHtml(item.hint) + '</span>' +
        '</button>'
      )).join('');

      if (searchInput) {
        if (currentItems.length) searchInput.setAttribute('aria-activedescendant', 'cmdk-opt-0');
        else searchInput.removeAttribute('aria-activedescendant');
      }
    }

    function syncActive() {
      if (!listEl) return;
      listEl.querySelectorAll('[data-cmdk-idx]').forEach((btn, idx) => {
        const active = idx === activeIndex;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', String(active));
        if (active) {
          btn.scrollIntoView({ block: 'nearest' });
          if (searchInput) searchInput.setAttribute('aria-activedescendant', btn.id);
        }
      });
    }

    if (trigger) {
      trigger.addEventListener('click', () => {
        if (isOpen()) closeModal();
        else openModal();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeModal());
    }

    if (searchInput) {
      searchInput.addEventListener('input', () => renderItems(searchInput.value));
    }

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModal();
        return;
      }
      const itemBtn = event.target.closest('[data-cmdk-idx]');
      if (itemBtn) {
        const idx = Number(itemBtn.dataset.cmdkIdx);
        const item = currentItems[idx];
        closeModal();
        if (item) item.run();
      }
    });

    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (isOpen()) closeModal();
        else openModal();
        return;
      }
      if (!isOpen()) return;
      if (event.key === 'Escape') {
        closeModal();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (currentItems.length) {
          activeIndex = (activeIndex + 1) % currentItems.length;
          syncActive();
        }
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (currentItems.length) {
          activeIndex = (activeIndex - 1 + currentItems.length) % currentItems.length;
          syncActive();
        }
      } else if (event.key === 'Enter' && (event.target === searchInput || (listEl && listEl.contains(event.target)))) {
        event.preventDefault();
        const item = currentItems[activeIndex];
        closeModal();
        if (item) item.run();
      }
    });
  }

  const form = document.getElementById('audit-form');
  if (!form) {
    initCommandPalette();
    return;
  }

  // --- Audit Console DOM ---
  const input = document.getElementById('url');
  const inputB = document.getElementById('url-b');
  const draftTypeSelect = document.getElementById('draft-type');
  const draftInput = document.getElementById('draft-input');
  const historyBar = document.getElementById('history-bar');
  const out = document.getElementById('out');
  const submit = document.getElementById('go');
  const submitLabel = document.getElementById('go-label');
  let lastReport = null;
  let currentMode = 'url'; // 'url' | 'draft' | 'compare'
  let activeFilter = 'all';

  const STATUS_LABEL = { pass: 'Pass', warn: 'Warn', fail: 'Fail' };
  const PILLAR_LABEL = {
    crawler: 'Crawler access',
    llmstxt: 'LLM manifest',
    semantic: 'Structured context',
    actionability: 'Actionability',
    protocols: 'Protocol discovery'
  };

  const AI_BOTS = [
    'GPTBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot',
    'Google-Extended', 'Applebot-Extended', 'Meta-ExternalAgent', 'cohere-ai',
    'OAI-SearchBot', 'Amazonbot', 'ByteSpider', 'Diffbot', 'CCBot', 'FacebookBot'
  ];

  const band = (score) => (score >= 80 ? 'good' : score >= 50 ? 'mid' : 'bad');

  function normalize(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
  }

  function getMinScore() {
    const q = parseInt(new URLSearchParams(location.search).get('minScore') || '', 10);
    return Number.isNaN(q) ? 80 : Math.max(0, Math.min(100, q));
  }

  function applyMinScore(report, minScore) {
    const threshold = typeof minScore === 'number' ? minScore : getMinScore();
    return Object.assign({}, report, {
      minScoreThreshold: threshold,
      passed: report.totalScore >= threshold
    });
  }

  function setBusy(busy) {
    submit.disabled = busy;
    if (currentMode === 'compare') {
      submitLabel.textContent = busy ? 'Comparing' : 'Compare';
    } else if (currentMode === 'draft') {
      submitLabel.textContent = 'Validate Draft';
    } else {
      submitLabel.textContent = busy ? 'Auditing' : 'Run Audit';
    }
  }

  function switchMode(mode) {
    currentMode = mode === 'compare' || mode === 'draft' ? mode : 'url';
    document.querySelectorAll('.mode-tab[data-mode]').forEach((tab) => {
      const active = tab.dataset.mode === currentMode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });

    if (input) input.hidden = currentMode === 'draft';
    if (inputB) inputB.hidden = currentMode !== 'compare';
    if (draftTypeSelect) draftTypeSelect.hidden = currentMode !== 'draft';
    if (draftInput) draftInput.hidden = currentMode !== 'draft';
    setBusy(false);
  }

  onModeSwitch = switchMode;

  const modeTabs = Array.from(document.querySelectorAll('.mode-tab[data-mode]'));
  modeTabs.forEach((tab, idx) => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
    tab.addEventListener('keydown', (event) => {
      let nextIdx = -1;
      if (event.key === 'ArrowRight') nextIdx = (idx + 1) % modeTabs.length;
      else if (event.key === 'ArrowLeft') nextIdx = (idx - 1 + modeTabs.length) % modeTabs.length;
      else if (event.key === 'Home') nextIdx = 0;
      else if (event.key === 'End') nextIdx = modeTabs.length - 1;
      if (nextIdx >= 0) {
        event.preventDefault();
        switchMode(modeTabs[nextIdx].dataset.mode);
        modeTabs[nextIdx].focus();
      }
    });
  });

  // --- History Bar Rendering (Tier 2) ---
  function renderHistoryBar() {
    if (!historyBar) return;
    const history = loadHistory();
    if (!history.length) {
      historyBar.innerHTML = '';
      return;
    }
    historyBar.innerHTML =
      '<span>Recent:</span>' +
      '<div class="history-chips">' +
        history.map((item) => {
          const deltaHtml = formatDeltaHtml(item.delta);
          return (
            '<button type="button" class="history-chip" data-history-url="' + escapeHtml(item.url) + '" title="' + escapeHtml(item.url) + '">' +
              '<span class="history-chip-url">' + escapeHtml(item.host) + '</span>' +
              '<span class="history-chip-score">' + item.score + '</span>' +
              deltaHtml +
            '</button>'
          );
        }).join('') +
      '</div>' +
      '<button type="button" class="btn-copy" data-history-clear>Clear</button>';
  }

  document.addEventListener('click', (event) => {
    const histBtn = event.target.closest('[data-history-url]');
    if (histBtn) {
      switchMode('url');
      runAudit(histBtn.dataset.historyUrl);
      return;
    }
    if (event.target.closest('[data-history-clear]')) {
      store.remove(HISTORY_KEY);
      renderHistoryBar();
      notify('History cleared');
    }
  });

  // --- CompressionStream Snapshot Codec (Tier 1) ---
  function bytesToBase64Url(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToBytes(str) {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const bin = atob(b64);
    const outBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) outBytes[i] = bin.charCodeAt(i);
    return outBytes;
  }

  async function encodeSnapshot(report) {
    const bytes = new TextEncoder().encode(JSON.stringify(report));
    if (typeof CompressionStream === 'function') {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
        const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
        return bytesToBase64Url(compressed);
      } catch {
        return bytesToBase64Url(bytes);
      }
    }
    return bytesToBase64Url(bytes);
  }

  async function decodeSnapshot(hash) {
    const match = String(hash || '').match(/r=([A-Za-z0-9_-]+)/);
    if (!match) return null;
    try {
      const bytes = base64UrlToBytes(match[1]);
      if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream === 'function') {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return JSON.parse(await new Response(stream).text());
      }
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }

  // --- Inline Fix Generators (Tier 1) ---
  function getFixTemplate(check, targetUrl) {
    if (!check || check.status === 'pass') return null;
    let origin = 'https://your-site.com';
    let host = 'your-site.com';
    try {
      const parsed = new URL(normalize(targetUrl) || origin);
      origin = parsed.origin;
      host = parsed.hostname;
    } catch { /* fallback defaults */ }

    const id = String(check.id || '').toLowerCase();
    const name = String(check.name || '').toLowerCase();

    if (id.startsWith('crawler-') || name.includes('robots.txt') || name.includes('crawler') || name.includes('sitemap')) {
      return {
        filename: 'robots.txt',
        path: '/robots.txt',
        content: [
          ...AI_BOTS.map((bot) => 'User-agent: ' + bot + '\nAllow: /'),
          'User-agent: *\nAllow: /\nContent-Signal: ai-train=yes, search=yes, ai-input=yes',
          'Sitemap: ' + origin + '/sitemap.xml'
        ].join('\n\n') + '\n'
      };
    }

    if (id === 'llms-exists' || id === 'llms-spec-structure' || id === 'llms-token-budget' || name.includes('llms.txt')) {
      return {
        filename: 'llms.txt',
        path: '/llms.txt',
        content:
          '# ' + host + '\n\n' +
          '> Machine-readable overview and curated entry points for ' + host + '.\n\n' +
          '## Key Pages\n\n' +
          '- [Home](' + origin + '/): Primary overview and product entry point\n' +
          '- [Documentation](' + origin + '/docs): Guides, API reference, and examples\n' +
          '- [Sitemap](' + origin + '/sitemap.xml): Full URL index for crawlers\n'
      };
    }

    if (id === 'semantic-jsonld' || name.includes('json-ld')) {
      const jsonld = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: host,
        url: origin + '/',
        description: 'Official website and structured documentation for ' + host + '.'
      };
      return {
        filename: 'jsonld-schema.html',
        path: '<head> HTML snippet',
        content: '<script type="application/ld+json">\n' + JSON.stringify(jsonld, null, 2) + '\n</script>\n'
      };
    }

    if (id === 'protocol-mcp' || name.includes('mcp.json')) {
      const mcp = {
        name: host,
        version: '1.0.0',
        description: 'MCP server card for ' + host,
        servers: [{ url: origin, protocol: 'https' }],
        capabilities: { tools: true, resources: true }
      };
      return {
        filename: 'mcp.json',
        path: '/.well-known/mcp.json',
        content: JSON.stringify(mcp, null, 2) + '\n'
      };
    }

    if (id === 'protocol-ai-catalog' || name.includes('ai-catalog')) {
      const catalog = {
        $schema: 'https://ard.dev/schema/v1/ai-catalog.json',
        name: host,
        version: '1.0.0',
        description: 'Agentic resource catalog for ' + host,
        homepage: origin,
        protocols: ['mcp', 'openapi'],
        resources: [
          { name: 'llms.txt', type: 'llms-txt', url: origin + '/llms.txt' },
          { name: 'Documentation', type: 'docs', url: origin + '/docs' }
        ]
      };
      return {
        filename: 'ai-catalog.json',
        path: '/.well-known/ai-catalog.json',
        content: JSON.stringify(catalog, null, 2) + '\n'
      };
    }

    return null;
  }

  // --- Badge & Markdown Generators (Tier 1 & Tier 2) ---
  function shieldsColor(score) {
    if (score >= 90) return 'brightgreen';
    if (score >= 80) return 'green';
    if (score >= 70) return 'yellow';
    if (score >= 50) return 'orange';
    return 'red';
  }

  function buildBadgeSnippets(report) {
    const score = report.totalScore;
    const origin = location.origin || 'https://agentprobe-self.vercel.app';
    const targetEnc = encodeURIComponent(report.target);
    const linkHref = origin + '/?url=' + targetEnc;
    const apiImgUrl = origin + '/api/badge?url=' + targetEnc;
    const shieldsUrl = 'https://img.shields.io/badge/Agent_Readiness-' + score + '%2F100-' + shieldsColor(score) + '?style=flat-square';

    return {
      apiImgUrl,
      shieldsUrl,
      apiMd: '[![Agent Readiness](' + apiImgUrl + ')](' + linkHref + ')',
      apiHtml: '<a href="' + linkHref + '"><img src="' + apiImgUrl + '" alt="Agent Readiness Score"></a>',
      shieldsMd: '[![Agent Readiness](' + shieldsUrl + ')](' + linkHref + ')',
      shieldsHtml: '<a href="' + linkHref + '"><img src="' + shieldsUrl + '" alt="Agent Readiness ' + score + '/100"></a>'
    };
  }

  function buildMarkdownReport(report) {
    const fixes = collectFixes(report.pillars);
    const totalRecoverable = fixes.reduce((sum, f) => sum + f.gain, 0);
    const badges = buildBadgeSnippets(report);
    const gate = report.passed ? 'PASSED' : 'FAILED';

    const rows = Object.keys(PILLAR_LABEL).map((key) => {
      const p = report.pillars[key];
      if (!p) return '';
      const pct = Math.round((p.score / (p.maxScore || 20)) * 100);
      const st = pct >= 80 ? 'Pass' : pct >= 50 ? 'Warn' : 'Fail';
      return '| **' + PILLAR_LABEL[key] + '** | ' + p.score + ' / ' + p.maxScore + ' | ' + st + ' |';
    }).filter(Boolean);

    const fixLines = fixes.length
      ? '\n### Top Fixes (+' + totalRecoverable + ' pts recoverable)\n' +
        fixes.map((f) => '- **' + STATUS_LABEL[f.status] + '** · **' + f.name + '** (+' + f.gain + ' pts) — ' + f.fix).join('\n') + '\n'
      : '\n### Top Fixes\n- All checks passing!\n';

    return [
      '## agentprobe Audit Report: `' + report.target + '`',
      '',
      '**Score:** **' + report.totalScore + '/100** (' + report.grade + ') · **Gate:** ' + gate + ' (min ' + report.minScoreThreshold + ')',
      badges.shieldsMd,
      '',
      '| Pillar | Score | Status |',
      '| :--- | :---: | :---: |',
      ...rows,
      fixLines,
      '---',
      '*Audited with [agentprobe](https://github.com/AkashPriyadarshii/agentprobe) in ' + Math.round(report.durationMs || 0) + ' ms*'
    ].join('\n');
  }

  // --- Staged Progress Updates (Tier 3) ---
  const AUDIT_STAGES = [
    { at: 0, pct: 15, label: 'Fetching HTML & HTTP headers' },
    { at: 600, pct: 38, label: 'Checking robots.txt, llms.txt & llms-full.txt' },
    { at: 1300, pct: 64, label: 'Inspecting semantic DOM, JSON-LD & ARIA labels' },
    { at: 2100, pct: 84, label: 'Probing .well-known/ai-catalog.json & mcp.json' },
    { at: 3000, pct: 94, label: 'Scoring pillars & compiling fix recommendations' }
  ];

  function renderRunning(target, subtitle) {
    out.innerHTML =
      '<div class="running" role="status">' +
        '<p>' + escapeHtml(subtitle || ('Auditing ' + target + '...')) + '</p>' +
        '<div class="ap-progress-track" aria-hidden="true"><div class="ap-progress-fill" id="ap-progress-fill" style="width:15%"></div></div>' +
        '<div class="ap-stages" id="ap-stages">' +
          AUDIT_STAGES.map((s, idx) => (
            '<div class="ap-stage' + (idx === 0 ? ' is-active' : '') + '" data-stage-idx="' + idx + '">' +
              '<span class="ap-stage-dot"></span>' +
              '<span>' + escapeHtml(s.label) + '</span>' +
            '</div>'
          )).join('') +
        '</div>' +
        '<span class="elapsed" id="elapsed">0.0 s</span>' +
      '</div>';

    const started = performance.now();
    const elapsedEl = out.querySelector('#elapsed');
    const fillEl = out.querySelector('#ap-progress-fill');
    const stageEls = out.querySelectorAll('[data-stage-idx]');

    const timer = setInterval(() => {
      const ms = performance.now() - started;
      if (elapsedEl) elapsedEl.textContent = (ms / 1000).toFixed(1) + ' s';
      let active = 0;
      for (let i = 0; i < AUDIT_STAGES.length; i++) {
        if (ms >= AUDIT_STAGES[i].at) active = i;
      }
      if (fillEl) fillEl.style.width = AUDIT_STAGES[active].pct + '%';
      stageEls.forEach((el, idx) => {
        el.classList.toggle('is-done', idx < active);
        el.classList.toggle('is-active', idx === active);
      });
    }, 100);

    return () => clearInterval(timer);
  }

  function renderError(message, target) {
    const hint = /waf|403|401|blocked|fetch failed/i.test(message)
      ? 'A firewall can refuse a server-side fetch. Run <code>npx @akashpriyadarshii/agentprobe ' + escapeHtml(target) + '</code> locally.'
      : 'Check that the URL resolves publicly, then run it again.';
    out.innerHTML =
      '<div class="banner" role="alert">' +
        '<strong>Audit stopped</strong>' +
        '<span>' + escapeHtml(message) + '</span>' +
        '<span class="dim">' + hint + '</span>' +
      '</div>';
  }

  // --- Report Rendering (Tier 1 & Tier 2) ---
  function ruler(score) {
    return (
      '<div class="ruler">' +
        '<div class="ruler-track"><span class="needle" style="left:0"></span></div>' +
        '<div class="ruler-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>' +
      '</div>'
    );
  }

  function renderPillarRows(pillars) {
    return Object.keys(PILLAR_LABEL).map((key) => {
      const pillar = pillars[key];
      if (!pillar) return '';
      const maxScore = pillar.maxScore || 20;
      const pct = Math.round((pillar.score / maxScore) * 100);
      const label = PILLAR_LABEL[key] || pillar.name || key;
      return (
        '<div class="pillar-row">' +
          '<span class="name">' + escapeHtml(label) + '</span>' +
          '<span class="meter" role="meter" aria-label="' + escapeHtml(label) + ' score" aria-valuenow="' + pillar.score + '" aria-valuemin="0" aria-valuemax="' + maxScore + '" style="--v:' + pct + '%" data-band="' + band(pct) + '"></span>' +
          '<span class="pts">' + pillar.score + '/' + maxScore + '</span>' +
        '</div>'
      );
    }).join('');
  }

  function collectFixes(pillars) {
    const fixes = [];
    Object.keys(PILLAR_LABEL).forEach((key) => {
      const pillar = pillars[key];
      if (!pillar || !Array.isArray(pillar.checks)) return;
      pillar.checks.forEach((check) => {
        if (check.status === 'pass' || !check.recommendation) return;
        const gain = Math.max(0, (check.maxScore || 0) - (check.score || 0));
        fixes.push({
          id: check.id || '',
          pillar: key,
          pillarLabel: PILLAR_LABEL[key],
          status: check.status,
          name: check.name,
          fix: check.recommendation,
          gain
        });
      });
    });
    return fixes.sort((a, b) => {
      const rank = (s) => (s === 'fail' ? 0 : 1);
      const diff = rank(a.status) - rank(b.status);
      return diff !== 0 ? diff : b.gain - a.gain;
    });
  }

  function renderTopFixesPanel(fixes, targetUrl) {
    const totalGain = fixes.reduce((sum, f) => sum + f.gain, 0);
    if (!fixes.length) {
      return (
        '<section class="top-fixes" aria-label="Top fixes">' +
          '<div class="top-fixes-head"><span>Top Fixes</span><span class="gain-pill">All checks passing</span></div>' +
        '</section>'
      );
    }

    const rows = fixes.map((f) => {
      const tpl = getFixTemplate({ id: f.id, name: f.name, status: f.status }, targetUrl);
      const jumpBtn = f.id
        ? '<button type="button" class="btn btn-sm" data-jump-check="' + escapeHtml(f.id) + '">' + (tpl ? 'Generate Fix' : 'Inspect') + '</button>'
        : '';
      return (
        '<div class="top-fix-item">' +
          '<div class="top-fix-meta">' +
            '<span class="status ' + escapeHtml(f.status) + '">' + STATUS_LABEL[f.status] + '</span>' +
            '<strong>' + escapeHtml(f.name) + '</strong>' +
            '<span class="micro">(' + escapeHtml(f.pillarLabel) + ')</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:0.4rem">' +
            (f.gain > 0 ? '<span class="gain-pill">+' + f.gain + ' pts</span>' : '') +
            jumpBtn +
          '</div>' +
          '<div class="top-fix-rec">' + escapeHtml(f.fix) + '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<section class="top-fixes" aria-label="Top fixes">' +
        '<div class="top-fixes-head">' +
          '<span>Top Fixes (' + fixes.length + ')</span>' +
          '<span class="gain-pill">+' + totalGain + ' pts recoverable</span>' +
        '</div>' +
        '<div class="top-fixes-list">' + rows + '</div>' +
      '</section>'
    );
  }

  function renderFilterPills(summary) {
    const pills = [
      { key: 'all', label: 'All (' + (summary.totalChecks || 0) + ')' },
      { key: 'fail', label: 'Fail (' + (summary.failedChecks || 0) + ')' },
      { key: 'warn', label: 'Warn (' + (summary.warningChecks || 0) + ')' },
      { key: 'pass', label: 'Pass (' + (summary.passedChecks || 0) + ')' }
    ];
    return (
      '<div class="filter-pills" role="group" aria-label="Filter checks by status">' +
        pills.map((p) => (
          '<button type="button" class="filter-pill' + (activeFilter === p.key ? ' is-active' : '') + '" data-filter="' + p.key + '" aria-pressed="' + (activeFilter === p.key) + '">' + p.label + '</button>'
        )).join('') +
      '</div>'
    );
  }

  function renderChecks(pillars, targetUrl) {
    const keys = Object.keys(PILLAR_LABEL);
    const anyFail = keys.some((k) => pillars[k] && pillars[k].checks.some((c) => c.status === 'fail'));

    return keys.map((key, index) => {
      const pillar = pillars[key];
      if (!pillar) return '';
      const passed = pillar.checks.filter((check) => check.status === 'pass').length;
      const hasFail = pillar.checks.some((check) => check.status === 'fail');
      const hasWarn = pillar.checks.some((check) => check.status === 'warn');
      const shouldOpen = hasFail || (!anyFail && (hasWarn || index === 0));

      const rows = pillar.checks.map((check, i) => {
        const tpl = getFixTemplate(check, targetUrl);
        const fixId = 'fix-' + escapeHtml(check.id || (key + '-' + i));
        const toggleBtn = tpl
          ? '<button type="button" class="btn btn-sm" data-toggle-fix="' + fixId + '-drawer" aria-expanded="false" style="margin-top:0.25rem;width:fit-content">Generate Fix (' + escapeHtml(tpl.filename) + ')</button>'
          : '';
        const drawerHtml = tpl
          ? (
            '<div class="fix-drawer" id="' + fixId + '-drawer" hidden>' +
              '<div class="fix-drawer-head">' +
                '<span>Generated <code>' + escapeHtml(tpl.path) + '</code></span>' +
                '<span class="group">' +
                  '<button type="button" class="btn btn-sm" data-copy-from="#' + fixId + '" data-copy-label="' + escapeHtml(tpl.filename) + '">Copy</button>' +
                  '<button type="button" class="btn btn-sm" data-download-fix="' + fixId + '" data-filename="' + escapeHtml(tpl.filename) + '">Download</button>' +
                '</span>' +
              '</div>' +
              '<pre id="' + fixId + '">' + escapeHtml(tpl.content) + '</pre>' +
            '</div>'
          )
          : '';

        return (
          '<div class="check reveal" style="--i:' + i + '" data-status="' + escapeHtml(check.status) + '" data-check-id="' + escapeHtml(check.id || '') + '">' +
            '<span class="status ' + escapeHtml(check.status) + '">' + STATUS_LABEL[check.status] + '</span>' +
            '<span class="check-name">' + escapeHtml(check.name) +
              (check.details ? '<span class="check-detail">' + escapeHtml(check.details) + '</span>' : '') +
              (check.status !== 'pass' && check.recommendation ? '<span class="check-fix">' + escapeHtml(check.recommendation) + '</span>' : '') +
              toggleBtn +
            '</span>' +
            '<span class="check-pts">' + check.score + '/' + check.maxScore + '</span>' +
            drawerHtml +
          '</div>'
        );
      }).join('');

      return (
        '<details class="check-group" data-pillar="' + escapeHtml(key) + '"' + (shouldOpen ? ' open' : '') + '>' +
          '<summary>' +
            '<span>' + escapeHtml(PILLAR_LABEL[key]) + '</span>' +
            '<span class="tally">' + passed + '/' + pillar.checks.length + ' pass</span>' +
          '</summary>' +
          '<div class="check-list">' + rows + '</div>' +
        '</details>'
      );
    }).join('');
  }

  function applyCheckFilter(filterKey) {
    activeFilter = filterKey || 'all';
    out.querySelectorAll('[data-filter]').forEach((btn) => {
      const active = btn.dataset.filter === activeFilter;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    let visibleGroups = 0;
    out.querySelectorAll('.check-group').forEach((group) => {
      let visibleCount = 0;
      group.querySelectorAll('.check').forEach((row) => {
        const match = activeFilter === 'all' || row.dataset.status === activeFilter;
        row.hidden = !match;
        if (match) visibleCount++;
      });
      group.hidden = visibleCount === 0;
      if (visibleCount > 0) visibleGroups++;
      if (activeFilter !== 'all' && visibleCount > 0) group.open = true;
    });
    const checksWrap = out.querySelector('.checks');
    if (checksWrap) {
      let emptyEl = checksWrap.querySelector('.checks-empty');
      if (visibleGroups === 0) {
        if (!emptyEl) {
          emptyEl = document.createElement('div');
          emptyEl.className = 'checks-empty';
          emptyEl.setAttribute('role', 'status');
          emptyEl.innerHTML = '<span>No checks match this filter.</span><button type="button" class="btn btn-sm" data-filter="all">Show all checks</button>';
          checksWrap.appendChild(emptyEl);
        }
        emptyEl.hidden = false;
      } else if (emptyEl) {
        emptyEl.hidden = true;
      }
    }
  }

  function renderBadgeBox(report) {
    const b = buildBadgeSnippets(report);
    return (
      '<section class="badge-box" aria-label="README Badge Generator">' +
        '<div class="badge-box-head">' +
          '<span>README Badge Generator</span>' +
          '<div class="badge-preview">' +
            '<img src="' + escapeHtml(b.apiImgUrl) + '" alt="Agent Readiness score badge" loading="lazy" onerror="this.onerror=null;this.src=\'' + escapeHtml(b.shieldsUrl) + '\'">' +
          '</div>' +
        '</div>' +
        '<div class="micro">Live SVG (<code>/api/badge?url=</code>)</div>' +
        '<pre id="badge-api-md">' + escapeHtml(b.apiMd) + '</pre>' +
        '<div class="group" style="display:flex;flex-wrap:wrap;gap:0.45rem">' +
          '<button type="button" class="btn btn-sm" data-copy-from="#badge-api-md" data-copy-label="Badge Markdown">Copy Markdown</button>' +
          '<button type="button" class="btn btn-sm" data-copy="' + escapeHtml(b.apiHtml) + '" data-copy-label="Badge HTML">Copy HTML</button>' +
        '</div>' +
        '<div class="micro">Shields.io Snapshot (' + report.totalScore + '/100)</div>' +
        '<pre id="badge-shields-md">' + escapeHtml(b.shieldsMd) + '</pre>' +
        '<div class="group" style="display:flex;flex-wrap:wrap;gap:0.45rem">' +
          '<button type="button" class="btn btn-sm" data-copy-from="#badge-shields-md" data-copy-label="Shields Markdown">Copy Markdown</button>' +
          '<button type="button" class="btn btn-sm" data-copy="' + escapeHtml(b.shieldsHtml) + '" data-copy-label="Shields HTML">Copy HTML</button>' +
        '</div>' +
      '</section>'
    );
  }

  function renderReport(report, options = {}) {
    lastReport = report;
    activeFilter = 'all';
    const gateClass = report.passed ? 'is-pass' : 'is-fail';
    const gateText = report.passed ? 'Gate passed' : 'Gate failed';
    const fixes = collectFixes(report.pillars);
    const isOffline = Boolean(options.isOffline);
    const isSnapshot = Boolean(options.isSnapshot);

    out.innerHTML =
      '<article class="sheet">' +
        '<header class="sheet-head">' +
          '<span>' + (isOffline ? 'Offline Draft' : isSnapshot ? 'Shared Snapshot' : 'Report') + '</span>' +
          '<span class="target">' + escapeHtml(report.target) + '</span>' +
          '<span class="group" style="display:inline-flex;gap:0.4rem;align-items:center">' +
            (isSnapshot ? '<button type="button" class="btn btn-sm" data-action="rerun-live">Re-run live</button>' : '') +
            '<span class="gate ' + gateClass + '">' + gateText + '</span>' +
          '</span>' +
        '</header>' +
        '<div class="sheet-score">' +
          '<p class="figure">' + report.totalScore + '<small>/100</small></p>' +
          '<p class="grade" data-band="' + band(report.totalScore) + '">' + escapeHtml(report.grade) + '</p>' +
          '<p class="score-meta">' +
            report.summary.passedChecks + ' passed<br>' +
            report.summary.failedChecks + ' failed<br>' +
            report.summary.warningChecks + ' warnings<br>' +
            Math.round(report.durationMs || 0) + ' ms' +
          '</p>' +
        '</div>' +
        ruler(report.totalScore) +
        '<div class="sheet-rows">' + renderPillarRows(report.pillars) + '</div>' +
        '<div class="sheet-actions">' +
          '<span class="micro">' + report.summary.totalChecks + ' checks / ' + fixes.length + ' fixes / min ' + report.minScoreThreshold + '</span>' +
          '<span class="group">' +
            '<button class="btn btn-sm" type="button" data-action="copy-md">Copy Markdown</button>' +
            '<button class="btn btn-sm" type="button" data-copy-from="#raw-json" data-copy-label="Report JSON">Copy JSON</button>' +
            '<button class="btn btn-sm" type="button" data-action="download-json">Download .json</button>' +
            '<button class="btn btn-sm" type="button" data-action="download-md">Download .md</button>' +
            '<button class="btn btn-sm" type="button" data-action="print">Print / PDF</button>' +
            (!isOffline ? '<button class="btn btn-sm" type="button" data-action="share">Copy Share Link</button>' : '') +
          '</span>' +
        '</div>' +
        (!isOffline ? renderBadgeBox(report) : '') +
        renderTopFixesPanel(fixes, report.target) +
        renderFilterPills(report.summary) +
        '<div class="checks">' + renderChecks(report.pillars, report.target) + '</div>' +
        '<details class="raw">' +
          '<summary>Raw report JSON</summary>' +
          '<pre id="raw-json">' + escapeHtml(JSON.stringify(report, null, 2)) + '</pre>' +
        '</details>' +
      '</article>';

    const needle = out.querySelector('.needle');
    if (needle) requestAnimationFrame(() => { needle.style.left = report.totalScore + '%'; });
  }

  // --- Compare Mode Rendering (Tier 3) ---
  function renderCompareReport(reportA, reportB) {
    const totalDelta = reportA.totalScore - reportB.totalScore;
    const deltaClass = totalDelta > 0 ? 'is-up' : totalDelta < 0 ? 'is-down' : '';
    const winnerText = totalDelta > 0
      ? reportA.target + ' leads by +' + totalDelta + ' pts'
      : totalDelta < 0
        ? reportB.target + ' leads by +' + Math.abs(totalDelta) + ' pts'
        : 'Tied at ' + reportA.totalScore + '/100';

    const matrixRows = Object.keys(PILLAR_LABEL).map((key) => {
      const pA = reportA.pillars[key];
      const pB = reportB.pillars[key];
      if (!pA || !pB) return '';
      const d = pA.score - pB.score;
      const dHtml = d > 0
        ? '<span class="delta-pos">+' + d + '</span>'
        : d < 0
          ? '<span class="delta-neg">' + d + '</span>'
          : '<span class="delta-zero">0</span>';
      return (
        '<tr>' +
          '<td>' + escapeHtml(PILLAR_LABEL[key]) + '</td>' +
          '<td class="num">' + pA.score + '/' + pA.maxScore + '</td>' +
          '<td class="num">' + pB.score + '/' + pB.maxScore + '</td>' +
          '<td class="num">' + dHtml + '</td>' +
        '</tr>'
      );
    }).join('');

    const diffs = [];
    Object.keys(PILLAR_LABEL).forEach((key) => {
      const pA = reportA.pillars[key];
      const pB = reportB.pillars[key];
      if (!pA || !pB) return;
      pA.checks.forEach((cA) => {
        const cB = pB.checks.find((c) => c.id === cA.id || c.name === cA.name);
        if (cB && cA.status !== cB.status) {
          diffs.push({ name: cA.name, pillar: PILLAR_LABEL[key], a: cA.status, b: cB.status });
        }
      });
    });

    const diffHtml = diffs.length
      ? '<section class="top-fixes" aria-label="Check differences">' +
          '<div class="top-fixes-head"><span>Check Differences (' + diffs.length + ')</span></div>' +
          '<div class="top-fixes-list">' +
            diffs.map((d) => (
              '<div class="top-fix-item">' +
                '<div class="top-fix-meta">' +
                  '<span class="status ' + d.a + '">A:' + STATUS_LABEL[d.a] + '</span>' +
                  '<strong>' + escapeHtml(d.name) + '</strong>' +
                  '<span class="micro">(' + escapeHtml(d.pillar) + ')</span>' +
                '</div>' +
                '<span class="status ' + d.b + '">B:' + STATUS_LABEL[d.b] + '</span>' +
              '</div>'
            )).join('') +
          '</div>' +
        '</section>'
      : '<div class="micro">Both sites have identical pass/warn/fail statuses across checks.</div>';

    out.innerHTML =
      '<article class="sheet">' +
        '<header class="sheet-head">' +
          '<span>Compare</span>' +
          '<span class="target">' + escapeHtml(winnerText) + '</span>' +
          '<span class="compare-delta ' + deltaClass + '">' + (totalDelta > 0 ? '+' : '') + totalDelta + ' pts</span>' +
        '</header>' +
        '<div class="compare-grid">' +
          '<div class="compare-col">' +
            '<div class="compare-head">' +
              '<span class="target">' + escapeHtml(reportA.target) + '</span>' +
              '<span class="figure" style="font-size:1.4rem;margin:0">' + reportA.totalScore + '<small>/100</small></span>' +
            '</div>' +
            '<div class="sheet-rows">' + renderPillarRows(reportA.pillars) + '</div>' +
            '<button type="button" class="btn btn-sm" data-compare-view="a">Inspect Full Report A</button>' +
          '</div>' +
          '<div class="compare-col">' +
            '<div class="compare-head">' +
              '<span class="target">' + escapeHtml(reportB.target) + '</span>' +
              '<span class="figure" style="font-size:1.4rem;margin:0">' + reportB.totalScore + '<small>/100</small></span>' +
            '</div>' +
            '<div class="sheet-rows">' + renderPillarRows(reportB.pillars) + '</div>' +
            '<button type="button" class="btn btn-sm" data-compare-view="b">Inspect Full Report B</button>' +
          '</div>' +
        '</div>' +
        '<div class="table-wrap" style="margin:0">' +
          '<table class="compare-matrix">' +
            '<thead><tr><th>Pillar</th><th class="num">Site A</th><th class="num">Site B</th><th class="num">Delta (A - B)</th></tr></thead>' +
            '<tbody>' + matrixRows + '</tbody>' +
          '</table>' +
        '</div>' +
        diffHtml +
      '</article>';

    out._compareReports = { a: reportA, b: reportB };
  }

  // --- Offline Draft Validator (Tier 3) ---
  function gradeFor(score) {
    if (score >= 95) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }

  function buildOfflinePillar(name, checks) {
    return {
      name,
      score: checks.reduce((s, c) => s + c.score, 0),
      maxScore: checks.reduce((s, c) => s + c.maxScore, 0),
      checks
    };
  }

  function validateRobotsDraft(text) {
    const checks = [];
    if (text.trim()) {
      checks.push({ id: 'crawler-robots-exists', name: 'Robots.txt Content Present', status: 'pass', score: 4, maxScore: 4, details: text.length + ' bytes' });
    } else {
      checks.push({ id: 'crawler-robots-exists', name: 'Robots.txt Content Present', status: 'fail', score: 0, maxScore: 4, details: 'Draft is empty', recommendation: 'Add robots.txt directives.' });
    }

    const lines = text.split(/\r?\n/);
    const rulesByAgent = new Map();
    let currentAgents = [];
    for (const rawLine of lines) {
      const line = rawLine.split('#')[0].trim();
      if (!line) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();
      if (key === 'user-agent') {
        currentAgents.push(val.toLowerCase());
      } else if (key === 'disallow' || key === 'allow') {
        if (!currentAgents.length) continue;
        for (const ua of currentAgents) {
          if (!rulesByAgent.has(ua)) rulesByAgent.set(ua, []);
          rulesByAgent.get(ua).push({ type: key, path: val });
        }
      } else {
        currentAgents = [];
      }
    }

    const isBotAllowed = (bot) => {
      const specific = rulesByAgent.get(bot.toLowerCase());
      const rules = specific || rulesByAgent.get('*') || [];
      let allowRoot = true;
      for (const r of rules) {
        if (r.type === 'disallow' && (r.path === '/' || r.path === '/*')) allowRoot = false;
        if (r.type === 'allow' && r.path === '/') allowRoot = true;
      }
      return allowRoot;
    };

    const blocked = AI_BOTS.filter((b) => !isBotAllowed(b));
    if (blocked.length === 0) {
      checks.push({ id: 'crawler-ai-allowed', name: 'AI Agent Crawlers Allowed', status: 'pass', score: 12, maxScore: 12, details: 'All ' + AI_BOTS.length + ' monitored AI bots are permitted.' });
    } else if (blocked.length < AI_BOTS.length) {
      checks.push({ id: 'crawler-ai-allowed', name: 'AI Agent Crawlers Allowed', status: 'warn', score: 6, maxScore: 12, details: 'Blocked: ' + blocked.join(', '), recommendation: 'Allow AI bots in robots.txt: ' + blocked.join(', ') });
    } else {
      checks.push({ id: 'crawler-ai-allowed', name: 'AI Agent Crawlers Allowed', status: 'fail', score: 0, maxScore: 12, details: 'All monitored AI bots are disallowed.', recommendation: 'Remove Disallow: / rules for AI crawlers.' });
    }

    const hasSitemap = /^sitemap:\s*https?:\/\//im.test(text);
    checks.push(hasSitemap
      ? { id: 'crawler-sitemap', name: 'Sitemap Declared in robots.txt', status: 'pass', score: 4, maxScore: 4, details: 'Sitemap directive detected.' }
      : { id: 'crawler-sitemap', name: 'Sitemap Declared in robots.txt', status: 'warn', score: 1, maxScore: 4, details: 'No Sitemap: https://... directive found.', recommendation: 'Add "Sitemap: https://yourdomain.com/sitemap.xml" to robots.txt.' });

    const pillar = buildOfflinePillar('Bot Accessibility', checks);
    return {
      pillars: { crawler: pillar },
      totalScore: Math.round((pillar.score / pillar.maxScore) * 100)
    };
  }

  function validateLlmsDraft(text) {
    const checks = [];
    checks.push(text.trim()
      ? { id: 'llms-exists', name: 'llms.txt Manifest Content', status: 'pass', score: 7, maxScore: 7, details: text.length + ' bytes' }
      : { id: 'llms-exists', name: 'llms.txt Manifest Content', status: 'fail', score: 0, maxScore: 7, details: 'Draft is empty', recommendation: 'Add H1 title, blockquote summary, and Markdown links.' });

    const hasH1 = /^#\s+.+/m.test(text);
    const hasQuote = /^>\s+.+/m.test(text);
    const hasLinks = /-\s+\[.+\]\(.+\)/m.test(text);
    let fmt = 0;
    const issues = [];
    if (hasH1) fmt += 2; else issues.push('Missing H1 ("# Title")');
    if (hasQuote) fmt += 2; else issues.push('Missing blockquote ("> Summary")');
    if (hasLinks) fmt += 2; else issues.push('Missing link list ("- [Title](url)")');

    checks.push(fmt === 6
      ? { id: 'llms-spec-structure', name: 'llms.txt Spec Compliance', status: 'pass', score: 6, maxScore: 6, details: 'Valid H1, blockquote summary, and Markdown link list.' }
      : { id: 'llms-spec-structure', name: 'llms.txt Spec Compliance', status: fmt > 0 ? 'warn' : 'fail', score: fmt, maxScore: 6, details: issues.join(', '), recommendation: 'Format with # Title, > Summary, and - [Link](url) entries.' });

    const tokens = Math.ceil(text.length / 4);
    checks.push(tokens <= 15000
      ? { id: 'llms-token-budget', name: 'Token Budget Efficiency', status: 'pass', score: 3, maxScore: 3, details: 'Estimated tokens: ~' + tokens.toLocaleString() + ' (<= 15,000 budget)' }
      : { id: 'llms-token-budget', name: 'Token Budget Efficiency', status: 'warn', score: 1, maxScore: 3, details: 'Estimated tokens: ~' + tokens.toLocaleString() + ' (exceeds 15,000)', recommendation: 'Move long documentation to /llms-full.txt.' });

    const pillar = buildOfflinePillar('LLM Manifest (llms.txt)', checks);
    return {
      pillars: { llmstxt: pillar },
      totalScore: Math.round((pillar.score / pillar.maxScore) * 100)
    };
  }

  function validateHtmlDraft(text) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const semChecks = [];

    const hasMain = doc.querySelectorAll('main, [role="main"]').length > 0;
    const hasNav = doc.querySelectorAll('nav, [role="navigation"]').length > 0;
    const hasHeaderFooter = doc.querySelectorAll('header, footer, [role="banner"], [role="contentinfo"]').length > 0;
    const lmScore = (hasMain ? 3 : 0) + (hasNav ? 1 : 0) + (hasHeaderFooter ? 1 : 0);
    const missingLm = [!hasMain && '<main>', !hasNav && '<nav>', !hasHeaderFooter && '<header>/<footer>'].filter(Boolean);
    semChecks.push(lmScore === 5
      ? { id: 'semantic-landmarks', name: 'HTML5 Semantic Landmarks', status: 'pass', score: 5, maxScore: 5, details: 'Detected <main>, <nav>, and header/footer landmarks.' }
      : { id: 'semantic-landmarks', name: 'HTML5 Semantic Landmarks', status: lmScore >= 3 ? 'warn' : 'fail', score: lmScore, maxScore: 5, details: 'Missing: ' + missingLm.join(', '), recommendation: 'Use semantic landmarks (' + missingLm.join(', ') + ').' });

    const h1Count = doc.querySelectorAll('h1').length;
    semChecks.push(h1Count === 1
      ? { id: 'semantic-headings', name: 'Heading Structure & Single H1', status: 'pass', score: 4, maxScore: 4, details: 'Single H1: "' + doc.querySelector('h1').textContent.trim().slice(0, 50) + '"' }
      : { id: 'semantic-headings', name: 'Heading Structure & Single H1', status: h1Count > 1 ? 'warn' : 'fail', score: h1Count > 1 ? 2 : 0, maxScore: 4, details: h1Count === 0 ? 'No H1 found.' : 'Found ' + h1Count + ' H1 elements.', recommendation: 'Use exactly one H1 heading per page.' });

    const schemas = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
      try {
        const parsed = JSON.parse(el.textContent || '');
        (Array.isArray(parsed) ? parsed : [parsed]).forEach((item) => {
          if (item && item['@type']) schemas.push(String(item['@type']));
        });
      } catch { /* invalid JSON-LD */ }
    });
    semChecks.push(schemas.length > 0
      ? { id: 'semantic-jsonld', name: 'Schema.org JSON-LD Structured Data', status: 'pass', score: 8, maxScore: 8, details: 'Types: ' + Array.from(new Set(schemas)).join(', ') }
      : { id: 'semantic-jsonld', name: 'Schema.org JSON-LD Structured Data', status: 'fail', score: 0, maxScore: 8, details: 'No valid JSON-LD blocks found.', recommendation: 'Add <script type="application/ld+json"> with Schema.org metadata.' });

    const title = (doc.querySelector('title')?.textContent || '').trim();
    const desc = (doc.querySelector('meta[name="description"]')?.getAttribute('content') || '').trim();
    const ogTitle = (doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '').trim();
    const metaScore = (title ? 1 : 0) + (desc ? 1 : 0) + (ogTitle ? 1 : 0);
    semChecks.push(metaScore === 3
      ? { id: 'semantic-metadata', name: 'Machine-Readable Metadata', status: 'pass', score: 3, maxScore: 3, details: 'Title, description, and og:title present.' }
      : { id: 'semantic-metadata', name: 'Machine-Readable Metadata', status: 'warn', score: metaScore, maxScore: 3, details: 'title: ' + Boolean(title) + ', desc: ' + Boolean(desc) + ', og:title: ' + Boolean(ogTitle), recommendation: 'Include <title>, meta description, and og:title.' });

    const actChecks = [];
    const btns = Array.from(doc.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]'));
    const unlabeledBtns = btns.filter((el) => !(el.textContent.trim() || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.getAttribute('value'))).length;
    actChecks.push(unlabeledBtns === 0
      ? { id: 'action-button-labels', name: 'Interactive Button Actionability', status: 'pass', score: 5, maxScore: 5, details: btns.length ? 'All ' + btns.length + ' buttons labeled.' : 'No buttons detected.' }
      : { id: 'action-button-labels', name: 'Interactive Button Actionability', status: 'warn', score: Math.max(0, 5 - unlabeledBtns * 2), maxScore: 5, details: unlabeledBtns + ' unlabeled button(s).', recommendation: 'Add visible text or aria-label to icon buttons.' });

    const inputs = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea, select'));
    const unlabeledInputs = inputs.filter((el) => {
      const id = el.getAttribute('id');
      const hasLabel = id ? doc.querySelector('label[for="' + id.replace(/"/g, '\\"') + '"]') !== null : false;
      return !(hasLabel || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name'));
    }).length;
    actChecks.push(unlabeledInputs === 0
      ? { id: 'action-input-labels', name: 'Form Inputs & Form Controls', status: 'pass', score: 4, maxScore: 4, details: inputs.length ? 'All ' + inputs.length + ' inputs labeled.' : 'No inputs detected.' }
      : { id: 'action-input-labels', name: 'Form Inputs & Form Controls', status: 'warn', score: Math.max(0, 4 - unlabeledInputs * 2), maxScore: 4, details: unlabeledInputs + ' unlabeled input(s).', recommendation: 'Attach <label for> or aria-label to every input.' });

    const bodyText = (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ').trim();
    actChecks.push(bodyText.length > 200
      ? { id: 'action-prerendered-content', name: 'Static / SSR Content Availability', status: 'pass', score: 4, maxScore: 4, details: bodyText.length + ' chars of pre-rendered body text.' }
      : { id: 'action-prerendered-content', name: 'Static / SSR Content Availability', status: 'fail', score: 1, maxScore: 4, details: 'Only ' + bodyText.length + ' chars of initial text.', recommendation: 'Serve pre-rendered SSR/SSG HTML rather than an empty SPA shell.' });

    const semanticPillar = buildOfflinePillar('Structured Context & Schema', semChecks);
    const actionPillar = buildOfflinePillar('Actionability & Negotiation', actChecks);
    const totalPts = semanticPillar.score + actionPillar.score;
    const totalMax = semanticPillar.maxScore + actionPillar.maxScore;
    return {
      pillars: { semantic: semanticPillar, actionability: actionPillar },
      totalScore: Math.round((totalPts / totalMax) * 100)
    };
  }

  function validateJsonManifestDraft(text) {
    const checks = [];
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      checks.push({
        id: 'protocol-json-valid',
        name: 'Valid JSON Syntax',
        status: 'fail',
        score: 0,
        maxScore: 7,
        details: 'JSON parse error: ' + (err && err.message ? err.message : 'invalid JSON'),
        recommendation: 'Fix JSON syntax errors in your .well-known manifest.'
      });
      const p = buildOfflinePillar('Protocol Discovery & Commerce', checks);
      return { pillars: { protocols: p }, totalScore: 0 };
    }

    const isMcp = Boolean(parsed && (parsed.servers || parsed.capabilities || parsed.tools));
    const isCatalog = Boolean(parsed && (parsed.resources || parsed.protocols || parsed.$schema));

    checks.push({
      id: 'protocol-json-valid',
      name: 'Valid JSON Syntax',
      status: 'pass',
      score: 7,
      maxScore: 7,
      details: 'Valid JSON object with ' + Object.keys(parsed || {}).length + ' top-level keys.'
    });

    checks.push(isCatalog
      ? { id: 'protocol-ai-catalog', name: 'Agentic Resource Discovery (ai-catalog.json)', status: 'pass', score: 7, maxScore: 7, details: 'Includes ARD discovery keys (resources/protocols).' }
      : { id: 'protocol-ai-catalog', name: 'Agentic Resource Discovery (ai-catalog.json)', status: 'warn', score: 2, maxScore: 7, details: 'Missing resources or protocols array.', recommendation: 'Include "resources" and "protocols" for ai-catalog.json.' });

    checks.push(isMcp
      ? { id: 'protocol-mcp', name: 'Model Context Protocol (mcp.json)', status: 'pass', score: 6, maxScore: 6, details: 'Includes MCP server/capabilities/tools fields.' }
      : { id: 'protocol-mcp', name: 'Model Context Protocol (mcp.json)', status: 'warn', score: 2, maxScore: 6, details: 'Missing MCP servers/capabilities/tools fields.', recommendation: 'Add "servers" or "capabilities" for mcp.json discovery.' });

    const pillar = buildOfflinePillar('Protocol Discovery & Commerce', checks);
    return {
      pillars: { protocols: pillar },
      totalScore: Math.round((pillar.score / pillar.maxScore) * 100)
    };
  }

  function runOfflineDraft() {
    const text = draftInput ? draftInput.value : '';
    const kind = draftTypeSelect ? draftTypeSelect.value : 'html';
    if (!text.trim()) {
      out.innerHTML = '<div class="banner" role="alert"><strong>Empty draft</strong><span>Paste HTML, llms.txt, robots.txt, or JSON manifest content above to validate offline.</span></div>';
      if (draftInput) draftInput.focus();
      return;
    }

    const started = performance.now();
    const res = kind === 'robots.txt'
      ? validateRobotsDraft(text)
      : kind === 'llms.txt'
        ? validateLlmsDraft(text)
        : kind === 'json'
          ? validateJsonManifestDraft(text)
          : validateHtmlDraft(text);

    const allChecks = Object.values(res.pillars).flatMap((p) => p.checks);
    const minScore = getMinScore();
    const report = {
      version: '0.0.2-offline',
      target: 'offline://' + kind,
      timestamp: new Date().toISOString(),
      durationMs: Math.max(1, performance.now() - started),
      grade: gradeFor(res.totalScore),
      totalScore: res.totalScore,
      passed: res.totalScore >= minScore,
      minScoreThreshold: minScore,
      pillars: res.pillars,
      summary: {
        passedChecks: allChecks.filter((c) => c.status === 'pass').length,
        failedChecks: allChecks.filter((c) => c.status === 'fail').length,
        warningChecks: allChecks.filter((c) => c.status === 'warn').length,
        totalChecks: allChecks.length
      },
      quickFixes: collectFixes(res.pillars).map((f) => f.fix)
    };

    renderReport(report, { isOffline: true });
  }

  // --- Delegated #out Sheet Actions ---
  out.addEventListener('click', async (event) => {
    const filterBtn = event.target.closest('[data-filter]');
    if (filterBtn) {
      applyCheckFilter(filterBtn.dataset.filter);
      return;
    }

    const toggleFixBtn = event.target.closest('[data-toggle-fix]');
    if (toggleFixBtn) {
      const drawer = document.getElementById(toggleFixBtn.dataset.toggleFix);
      if (drawer) {
        drawer.hidden = !drawer.hidden;
        toggleFixBtn.setAttribute('aria-expanded', String(!drawer.hidden));
      }
      return;
    }

    const dlFixBtn = event.target.closest('[data-download-fix]');
    if (dlFixBtn) {
      const codeEl = document.getElementById(dlFixBtn.dataset.downloadFix);
      if (codeEl) downloadFile(dlFixBtn.dataset.filename || 'fix.txt', codeEl.textContent);
      return;
    }

    const jumpBtn = event.target.closest('[data-jump-check]');
    if (jumpBtn) {
      const checkId = jumpBtn.dataset.jumpCheck;
      const checkRow = out.querySelector('.check[data-check-id="' + CSS.escape(checkId) + '"]');
      if (checkRow) {
        const group = checkRow.closest('.check-group');
        if (group) group.open = true;
        if (checkRow.hidden) applyCheckFilter('all');
        const toggleBtn = checkRow.querySelector('[data-toggle-fix]');
        const drawer = checkRow.querySelector('.fix-drawer');
        if (drawer) drawer.hidden = false;
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
        checkRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    const compareViewBtn = event.target.closest('[data-compare-view]');
    if (compareViewBtn && out._compareReports) {
      const picked = out._compareReports[compareViewBtn.dataset.compareView];
      if (picked) renderReport(picked);
      return;
    }

    const actionBtn = event.target.closest('[data-action]');
    if (!actionBtn || !lastReport) return;
    const action = actionBtn.dataset.action;

    let slug = 'site';
    try { slug = new URL(lastReport.target).hostname.replace(/[^a-z0-9.-]/gi, '_'); } catch { /* offline */ }

    if (action === 'copy-md') {
      copy(buildMarkdownReport(lastReport), 'Markdown PR report');
    } else if (action === 'download-json') {
      downloadFile('agentprobe-' + slug + '.json', JSON.stringify(lastReport, null, 2), 'application/json;charset=utf-8');
    } else if (action === 'download-md') {
      downloadFile('agentprobe-' + slug + '.md', buildMarkdownReport(lastReport), 'text/markdown;charset=utf-8');
    } else if (action === 'print') {
      window.print();
    } else if (action === 'share') {
      const encoded = await encodeSnapshot(lastReport);
      const shareUrl = new URL(location.href);
      shareUrl.searchParams.set('url', lastReport.target);
      shareUrl.searchParams.set('minScore', String(lastReport.minScoreThreshold));
      shareUrl.hash = 'r=' + encoded;
      await copy(shareUrl.toString(), 'Share link');
    } else if (action === 'rerun-live') {
      runAudit(lastReport.target);
    }
  });

  // --- Live Audit & Compare Runners ---
  async function fetchAudit(target) {
    const minScore = getMinScore();
    const response = await fetch('/api/audit?url=' + encodeURIComponent(target) + '&minScore=' + minScore, {
      signal: AbortSignal.timeout(25000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'HTTP ' + response.status);
    return applyMinScore(payload, minScore);
  }

  async function runAudit(rawUrl, options = {}) {
    const target = normalize(rawUrl);
    if (!target) {
      out.innerHTML = '<div class="banner" role="alert"><strong>No target</strong><span>Enter a public URL to audit.</span></div>';
      input.focus();
      return;
    }
    input.value = target;

    const minScore = getMinScore();
    const params = new URLSearchParams(location.search);
    params.set('url', target);
    params.set('minScore', String(minScore));
    params.delete('urlB');
    history.replaceState(null, '', location.pathname + '?' + params.toString());

    setBusy(true);
    const stopTicker = renderRunning(target, 'Fetching ' + target + ' and running all 5 agentprobe engines...');

    try {
      const report = await fetchAudit(target);
      saveHistoryEntry(report);
      renderHistoryBar();
      renderReport(report);
      if (options.scroll !== false) out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (error) {
      renderError(error && error.message ? error.message : String(error), target);
    } finally {
      stopTicker();
      setBusy(false);
    }
  }

  async function runCompare(rawA, rawB) {
    const urlA = normalize(rawA);
    const urlB = normalize(rawB);
    if (!urlA || !urlB) {
      out.innerHTML = '<div class="banner" role="alert"><strong>Missing URL</strong><span>Enter both Site A and Site B URLs to compare.</span></div>';
      (!urlA ? input : inputB).focus();
      return;
    }
    input.value = urlA;
    if (inputB) inputB.value = urlB;

    const params = new URLSearchParams(location.search);
    params.set('url', urlA);
    params.set('urlB', urlB);
    params.set('minScore', String(getMinScore()));
    history.replaceState(null, '', location.pathname + '?' + params.toString());

    setBusy(true);
    const stopTicker = renderRunning(urlA, 'Comparing ' + urlA + ' vs ' + urlB + '...');

    try {
      const [reportA, reportB] = await Promise.all([fetchAudit(urlA), fetchAudit(urlB)]);
      saveHistoryEntry(reportA);
      saveHistoryEntry(reportB);
      renderHistoryBar();
      lastReport = reportA;
      renderCompareReport(reportA, reportB);
      out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (error) {
      renderError(error && error.message ? error.message : String(error), urlA + ' / ' + urlB);
    } finally {
      stopTicker();
      setBusy(false);
    }
  }

  onAuditNavigate = (url) => {
    switchMode('url');
    runAudit(url);
  };

  initCommandPalette();
  renderHistoryBar();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (currentMode === 'draft') runOfflineDraft();
    else if (currentMode === 'compare') runCompare(input.value, inputB ? inputB.value : '');
    else runAudit(input.value);
  });

  document.querySelectorAll('[data-preset]').forEach((chip) => {
    chip.addEventListener('click', () => {
      switchMode('url');
      runAudit(chip.dataset.preset);
    });
  });

  document.addEventListener('keydown', (event) => {
    const active = document.activeElement;
    const tag = active ? active.tagName : '';
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (active && active.isContentEditable);
    if (event.key === '/' && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      if (currentMode === 'draft' && draftInput) {
        draftInput.focus();
      } else {
        input.focus();
        input.select();
      }
    }
  });

  // --- Initial Hydration (#r= snapshot > ?url=&urlB= compare > ?url= live) ---
  (async () => {
    const params = new URLSearchParams(location.search);
    const presetUrl = params.get('url');
    const presetUrlB = params.get('urlB');

    if (location.hash && location.hash.includes('r=')) {
      const snap = await decodeSnapshot(location.hash);
      if (snap && snap.pillars && typeof snap.totalScore === 'number') {
        if (snap.target) input.value = snap.target;
        renderReport(applyMinScore(snap, getMinScore()), { isSnapshot: true });
        return;
      }
    }

    if (presetUrl && presetUrlB) {
      switchMode('compare');
      runCompare(presetUrl, presetUrlB);
    } else if (presetUrl) {
      input.value = presetUrl;
      runAudit(presetUrl, { scroll: false });
    } else if (location.hash === '#url') {
      input.focus();
    }
  })();

  window.agentprobeLastReport = () => lastReport;
})();
