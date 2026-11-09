// agentprobe site: theme, copy, live audit console.
(() => {
  'use strict';

  const root = document.documentElement;
  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* storage blocked, session only */ }
    }
  };

  const savedTheme = store.get('ap-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') root.dataset.theme = savedTheme;

  const toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    const sync = () => {
      const dark = root.dataset.theme === 'dark';
      toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
      toggle.setAttribute('title', dark ? 'Light theme' : 'Dark theme');
    };
    sync();
    toggle.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      store.set('ap-theme', next);
      sync();
    });
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
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      notify(label + ' copied');
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
      notify(label + ' copied');
    }
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-copy]');
    if (!trigger) return;
    const source = trigger.dataset.copyFrom
      ? document.querySelector(trigger.dataset.copyFrom)
      : null;
    const text = source ? source.textContent.trim() : trigger.dataset.copy;
    if (text) copy(text, trigger.dataset.copyLabel || 'Text');
  });

  const form = document.getElementById('audit-form');
  if (!form) return;

  const input = document.getElementById('url');
  const out = document.getElementById('out');
  const submit = document.getElementById('go');
  const submitLabel = document.getElementById('go-label');
  let lastReport = null;

  const STATUS_LABEL = { pass: 'Pass', warn: 'Warn', fail: 'Fail' };
  const PILLAR_LABEL = {
    crawler: 'Crawler access',
    llmstxt: 'LLM manifest',
    semantic: 'Structured context',
    actionability: 'Actionability',
    protocols: 'Protocol discovery'
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  const band = (score) => (score >= 80 ? 'good' : score >= 50 ? 'mid' : 'bad');

  function normalize(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
  }

  function setBusy(busy) {
    submit.disabled = busy;
    submitLabel.textContent = busy ? 'Auditing' : 'Run audit';
  }

  function ruler(score) {
    return (
      '<div class="ruler">' +
        '<div class="ruler-track"><span class="needle" style="left:0"></span></div>' +
        '<div class="ruler-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>' +
      '</div>'
    );
  }

  function renderRunning(target) {
    out.innerHTML =
      '<div class="running" role="status">' +
        '<p>Fetching ' + escapeHtml(target) + ', robots.txt, llms.txt and the .well-known manifests.</p>' +
        '<div class="bar" aria-hidden="true"></div>' +
        '<span class="elapsed" id="elapsed">0.0 s</span>' +
      '</div>';
    const started = performance.now();
    const elapsed = out.querySelector('#elapsed');
    const timer = setInterval(() => {
      elapsed.textContent = ((performance.now() - started) / 1000).toFixed(1) + ' s';
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

  function renderPillarRows(pillars) {
    return Object.keys(PILLAR_LABEL).map((key) => {
      const pillar = pillars[key];
      if (!pillar) return '';
      const pct = Math.round((pillar.score / pillar.maxScore) * 100);
      return (
        '<div class="pillar-row">' +
          '<span class="name">' + escapeHtml(PILLAR_LABEL[key]) + '</span>' +
          '<span class="meter" style="--v:' + pct + '%" data-band="' + band(pct) + '"></span>' +
          '<span class="pts">' + pillar.score + '/' + pillar.maxScore + '</span>' +
        '</div>'
      );
    }).join('');
  }

  function renderChecks(pillars) {
    return Object.keys(PILLAR_LABEL).map((key, index) => {
      const pillar = pillars[key];
      if (!pillar) return '';
      const passed = pillar.checks.filter((check) => check.status === 'pass').length;
      const rows = pillar.checks.map((check, i) => (
        '<div class="check reveal" style="--i:' + i + '">' +
          '<span class="status ' + check.status + '">' + STATUS_LABEL[check.status] + '</span>' +
          '<span class="check-name">' + escapeHtml(check.name) +
            (check.details ? '<span class="check-detail">' + escapeHtml(check.details) + '</span>' : '') +
            (check.status !== 'pass' && check.recommendation ? '<span class="check-fix">' + escapeHtml(check.recommendation) + '</span>' : '') +
          '</span>' +
          '<span class="check-pts">' + check.score + '/' + check.maxScore + '</span>' +
        '</div>'
      )).join('');
      return (
        '<details class="check-group"' + (index === 0 ? ' open' : '') + '>' +
          '<summary>' +
            '<span>' + escapeHtml(PILLAR_LABEL[key]) + '</span>' +
            '<span class="tally">' + passed + '/' + pillar.checks.length + ' pass</span>' +
          '</summary>' +
          '<div class="check-list">' + rows + '</div>' +
        '</details>'
      );
    }).join('');
  }

  function collectFixes(pillars) {
    const fixes = [];
    Object.keys(PILLAR_LABEL).forEach((key) => {
      const pillar = pillars[key];
      if (!pillar) return;
      pillar.checks.forEach((check) => {
        if (check.status === 'pass' || !check.recommendation) return;
        fixes.push({ status: check.status, name: check.name, fix: check.recommendation });
      });
    });
    return fixes.sort((a, b) => (a.status === 'fail' ? -1 : 1) - (b.status === 'fail' ? -1 : 1));
  }

  function renderReport(report) {
    lastReport = report;
    const gateClass = report.passed ? 'is-pass' : 'is-fail';
    const gateText = report.passed ? 'Gate passed' : 'Gate failed';
    const fixes = collectFixes(report.pillars);

    out.innerHTML =
      '<article class="sheet">' +
        '<header class="sheet-head">' +
          '<span>Report</span>' +
          '<span class="target">' + escapeHtml(report.target) + '</span>' +
          '<span class="gate ' + gateClass + '">' + gateText + '</span>' +
        '</header>' +
        '<div class="sheet-score">' +
          '<p class="figure">' + report.totalScore + '<small>/100</small></p>' +
          '<p class="grade" data-band="' + band(report.totalScore) + '">' + escapeHtml(report.grade) + '</p>' +
          '<p class="score-meta">' +
            report.summary.passedChecks + ' passed<br>' +
            report.summary.failedChecks + ' failed<br>' +
            report.summary.warningChecks + ' warnings<br>' +
            Math.round(report.durationMs) + ' ms' +
          '</p>' +
        '</div>' +
        ruler(report.totalScore) +
        '<div class="sheet-rows">' + renderPillarRows(report.pillars) + '</div>' +
        '<div class="sheet-actions">' +
          '<span class="micro">' + report.summary.totalChecks + ' checks / ' + fixes.length + ' fixes / min ' + report.minScoreThreshold + '</span>' +
          '<span class="group">' +
            '<button class="btn btn-sm" type="button" data-copy-from="#raw-json" data-copy-label="Report JSON">Copy JSON</button>' +
            '<a class="btn btn-sm" href="/docs#score">How scoring works</a>' +
          '</span>' +
        '</div>' +
        '<div class="checks">' + renderChecks(report.pillars) + '</div>' +
        '<details class="raw">' +
          '<summary>Raw report JSON</summary>' +
          '<pre id="raw-json">' + escapeHtml(JSON.stringify(report, null, 2)) + '</pre>' +
        '</details>' +
      '</article>';

    const needle = out.querySelector('.needle');
    if (needle) requestAnimationFrame(() => { needle.style.left = report.totalScore + '%'; });
  }

  async function runAudit(rawUrl, options = {}) {
    const target = normalize(rawUrl);
    if (!target) {
      out.innerHTML = '<div class="banner" role="alert"><strong>No target</strong><span>Enter a public URL to audit.</span></div>';
      input.focus();
      return;
    }
    input.value = target;

    const params = new URLSearchParams(location.search);
    params.set('url', target);
    history.replaceState(null, '', location.pathname + '?' + params.toString() + location.hash);

    setBusy(true);
    const stopTicker = renderRunning(target);

    try {
      const response = await fetch('/api/audit?url=' + encodeURIComponent(target));
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'HTTP ' + response.status);
      renderReport(payload);
      if (options.scroll !== false) out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (error) {
      renderError(error && error.message ? error.message : String(error), target);
    } finally {
      stopTicker();
      setBusy(false);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runAudit(input.value);
  });

  document.querySelectorAll('[data-preset]').forEach((chip) => {
    chip.addEventListener('click', () => runAudit(chip.dataset.preset));
  });

  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (event.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      input.focus();
      input.select();
    }
  });

  const presetUrl = new URLSearchParams(location.search).get('url');
  if (presetUrl) {
    input.value = presetUrl;
    runAudit(presetUrl, { scroll: false });
  } else if (location.hash === '#url') {
    input.focus();
  }

  window.agentprobeLastReport = () => lastReport;
})();
