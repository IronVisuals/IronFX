/**
 * main.js — IronFX panel controller
 *
 * Responsibilities:
 *   - Bootstrap: request preset list from JSX, seed the search index
 *   - UI: render results, handle keyboard nav (↑ ↓ Enter Esc)
 *   - Apply: send applyEffect() call to JSX, wrapped in undo group
 *   - Focus: auto-focus search input whenever the panel gains focus
 *   - Clip polling: show how many clips are selected in the footer
 */

/* global CSInterface, EffectsSearch, BUILT_IN_EFFECTS */

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────────

  var cs      = new CSInterface();
  var engine  = new EffectsSearch();

  var results    = [];
  var selIdx     = 0;
  var ready      = false;
  var clipPollId = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────

  var $input        = document.getElementById('search-input');
  var $list         = document.getElementById('results-list');
  var $clearBtn     = document.getElementById('clear-btn');
  var $statusDot    = document.getElementById('status-dot');
  var $statusText   = document.getElementById('status-text');
  var $count        = document.getElementById('results-count');
  var $clipStatus   = document.getElementById('clip-status');
  var $initialState = document.getElementById('initial-state');
  var $emptyState   = document.getElementById('empty-state');
  var $emptyQuery   = document.getElementById('empty-query');
  var $reindex      = document.getElementById('reindex-btn');

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  function init() {
    setStatus('Indexing effects…', 'loading');
    loadPresets();
    bindEvents();
    startClipPoll();
    $input.focus();
  }

  function loadPresets() {
    $reindex.classList.add('spinning');

    cs.evalScript('IronFX.getUserPresets()', function (raw) {
      $reindex.classList.remove('spinning');

      var presets = [];
      try {
        var parsed = JSON.parse(raw);
        if (!parsed.error) presets = parsed.presets || [];
      } catch (e) { /* swallow */ }

      engine.init(BUILT_IN_EFFECTS, presets);
      ready = true;

      var total = BUILT_IN_EFFECTS.length + presets.length;
      setStatus(total + ' effects · ' + presets.length + ' presets', 'ok');
      setTimeout(function () { setStatus('Ready', 'idle'); }, 3000);
    });
  }

  // ── Events ────────────────────────────────────────────────────────────────

  function bindEvents() {
    $input.addEventListener('input',   onInput);
    $input.addEventListener('keydown', onKeyDown);
    $clearBtn.addEventListener('click', clear);
    $reindex.addEventListener('click', function () {
      if (!$reindex.classList.contains('spinning')) loadPresets();
    });

    // Auto-focus search whenever this panel or the window gains focus.
    // This is the key mechanism: Premiere's keyboard shortcut to "show panel"
    // triggers a focus event on the CEP window.
    window.addEventListener('focus', function () {
      $input.focus();
      $input.select();
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        $input.focus();
        $input.select();
      }
    });

    // Any printable key typed while input is not focused re-routes to input
    document.addEventListener('keydown', function (e) {
      if (document.activeElement !== $input &&
          !e.ctrlKey && !e.metaKey && !e.altKey &&
          e.key.length === 1) {
        $input.focus();
      }
    });
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  function onInput() {
    var q = $input.value;
    $clearBtn.classList.toggle('hidden', q.length === 0);

    if (!q.trim()) {
      showInitial();
      return;
    }
    if (!ready) return;

    results = engine.search(q);
    selIdx  = 0;
    render(results, q);
  }

  function render(items, query) {
    $initialState.classList.add('hidden');
    $emptyState.classList.add('hidden');

    if (items.length === 0) {
      $list.innerHTML  = '';
      $emptyQuery.textContent = query;
      $emptyState.classList.remove('hidden');
      $count.textContent = '';
      return;
    }

    $count.textContent = items.length + ' result' + (items.length !== 1 ? 's' : '');

    var html = '';
    for (var i = 0; i < items.length; i++) {
      var item   = items[i];
      var icon   = item.type === 'audio' ? '♪' : item.isPreset ? '★' : '◆';
      var badgeCls = item.isPreset ? 'badge-preset' : item.type === 'audio' ? 'badge-audio' : 'badge-effect';
      var badgeTxt = item.isPreset ? 'PRESET'       : item.type === 'audio' ? 'AUDIO'       : 'FX';
      var selCls   = (i === selIdx) ? ' is-selected' : '';

      html += '<div class="result-item' + selCls + '" data-idx="' + i + '" role="option">' +
                '<span class="result-icon">' + icon + '</span>' +
                '<div class="result-info">' +
                  '<div class="result-name">' + (item.highlight || item.name) + '</div>' +
                  '<div class="result-category">' + item.category + '</div>' +
                '</div>' +
                '<span class="result-badge ' + badgeCls + '">' + badgeTxt + '</span>' +
              '</div>';
    }

    $list.innerHTML = html;

    // Attach click handlers after innerHTML update
    var nodes = $list.querySelectorAll('.result-item');
    for (var j = 0; j < nodes.length; j++) {
      (function (node, idx) {
        node.addEventListener('click', function () { applyEffect(results[idx]); });
        node.addEventListener('mouseenter', function () {
          selIdx = idx;
          updateSelection();
        });
      })(nodes[j], j);
    }
  }

  function showInitial() {
    $list.innerHTML = '';
    $emptyState.classList.add('hidden');
    $initialState.classList.remove('hidden');
    $count.textContent = '';
    results = [];
    selIdx  = 0;
  }

  function clear() {
    $input.value = '';
    $clearBtn.classList.add('hidden');
    showInitial();
    $input.focus();
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────

  function onKeyDown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (results.length) {
          selIdx = Math.min(selIdx + 1, results.length - 1);
          updateSelection();
          scrollSelected();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (results.length) {
          selIdx = Math.max(selIdx - 1, 0);
          updateSelection();
          scrollSelected();
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (results[selIdx]) applyEffect(results[selIdx]);
        break;

      case 'Escape':
        clear();
        break;

      default:
        break;
    }
  }

  function updateSelection() {
    var nodes = $list.querySelectorAll('.result-item');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('is-selected', i === selIdx);
    }
  }

  function scrollSelected() {
    var sel = $list.querySelector('.result-item.is-selected');
    if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ── Apply ──────────────────────────────────────────────────────────────────

  function applyEffect(item) {
    // Flash the row
    var node = $list.querySelector('[data-idx="' + results.indexOf(item) + '"]');
    if (node) {
      node.classList.add('flash');
      setTimeout(function () { node.classList.remove('flash'); }, 450);
    }

    setStatus('Applying…', 'loading');

    var payload = JSON.stringify({
      matchName:  item.matchName,
      name:       item.name,
      type:       item.type,
      isPreset:   item.isPreset,
      presetPath: item.presetPath,
    });

    cs.evalScript('IronFX.applyEffect(' + JSON.stringify(payload) + ')', function (raw) {
      try {
        var res = JSON.parse(raw);
        if (res.error) {
          setStatus('Error: ' + res.error, 'error');
          setTimeout(function () { setStatus('Ready', 'idle'); }, 4000);
        } else {
          var n = res.clipsAffected;
          setStatus('✔ Applied to ' + n + ' clip' + (n !== 1 ? 's' : ''), 'ok');
          setTimeout(function () { setStatus('Ready', 'idle'); }, 2500);
        }
      } catch (e) {
        setStatus('✔ Applied', 'ok');
        setTimeout(function () { setStatus('Ready', 'idle'); }, 2000);
      }
    });
  }

  // ── Clip status polling ────────────────────────────────────────────────────

  function startClipPoll() {
    updateClipStatus();
    clipPollId = setInterval(updateClipStatus, 1500);
  }

  function updateClipStatus() {
    cs.evalScript('IronFX.getSelectionInfo()', function (raw) {
      try {
        var info = JSON.parse(raw);
        if (info.count > 0) {
          $clipStatus.textContent = info.count + ' clip' + (info.count !== 1 ? 's' : '') + ' selected';
          $clipStatus.className = 'has-clips';
        } else {
          $clipStatus.textContent = 'No clip selected';
          $clipStatus.className = 'no-clips';
        }
      } catch (e) {
        $clipStatus.textContent = '—';
        $clipStatus.className = '';
      }
    });
  }

  // ── Status helpers ─────────────────────────────────────────────────────────

  function setStatus(msg, state) {
    $statusText.textContent = msg;
    $statusDot.className    = 'dot-' + state;
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
