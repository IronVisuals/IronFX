/**
 * main.js - IronFX CEP panel controller
 *
 * Fixes in this build:
 * - Stable apply path through QE DOM using effect display names.
 * - Settings modal with configurable IronFX shortcut.
 * - Extra preset folder picker + persisted settings.
 * - Safer preset indexing call with custom folders passed to ExtendScript.
 */

/* global CSInterface, EffectsSearch, BUILT_IN_EFFECTS, SystemPath */

(function () {
  'use strict';

  var SETTINGS_KEY = 'ironfx.settings.v2';
  var POPUP_EXTENSION_ID = 'com.ironfx.popup';
  var BRIDGE_PORT = 32178;
  var DEFAULT_SETTINGS = {
    shortcut: 'Ctrl+Space',
    presetDirs: [],
    autoStartHotkeyHelper: true
  };

  var cs = new CSInterface();
  var engine = new EffectsSearch();

  var results = [];
  var selIdx = 0;
  var ready = false;
  var settings = loadSettings();
  var captureMode = false;
  var isPopupMode = false;
  var bridgeServer = null;
  var externalHotkeyProcessStarted = false;

  var $input = document.getElementById('search-input');
  var $list = document.getElementById('results-list');
  var $clearBtn = document.getElementById('clear-btn');
  var $statusDot = document.getElementById('status-dot');
  var $statusText = document.getElementById('status-text');
  var $count = document.getElementById('results-count');
  var $clipStatus = document.getElementById('clip-status');
  var $initialState = document.getElementById('initial-state');
  var $emptyState = document.getElementById('empty-state');
  var $emptyQuery = document.getElementById('empty-query');
  var $reindex = document.getElementById('reindex-btn');
  var $settingsBtn = document.getElementById('settings-btn');
  var $currentShortcutLabel = document.getElementById('current-shortcut-label');

  var $settingsModal = document.getElementById('settings-modal');
  var $settingsBackdrop = document.getElementById('settings-backdrop');
  var $settingsClose = document.getElementById('settings-close');
  var $shortcutInput = document.getElementById('shortcut-input');
  var $captureShortcutBtn = document.getElementById('capture-shortcut-btn');
  var $resetShortcutBtn = document.getElementById('reset-shortcut-btn');
  var $addPresetFolderBtn = document.getElementById('add-preset-folder-btn');
  var $clearPresetFoldersBtn = document.getElementById('clear-preset-folders-btn');
  var $presetFoldersList = document.getElementById('preset-folders-list');
  var $saveSettingsBtn = document.getElementById('save-settings-btn');

  function init() {
    isPopupMode = detectPopupMode();
    document.body.classList.toggle('popup-mode', isPopupMode);
    applySettingsToUI();
    bindEvents();
    keepExtensionLoaded();
    startHotkeyBridge();
    loadPresets();
    startClipPoll();
    focusSearch(true);
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return clone(DEFAULT_SETTINGS);
      var parsed = JSON.parse(raw);
      return normalizeSettings(parsed);
    } catch (e) {
      return clone(DEFAULT_SETTINGS);
    }
  }

  function saveSettings() {
    settings = normalizeSettings(settings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    applySettingsToUI();
  }

  function normalizeSettings(value) {
    var out = clone(DEFAULT_SETTINGS);
    if (value && typeof value.shortcut === 'string' && value.shortcut) {
      out.shortcut = value.shortcut;
    }
    if (value && value.presetDirs && value.presetDirs.length) {
      out.presetDirs = uniqueStrings(value.presetDirs);
    }
    if (value && typeof value.autoStartHotkeyHelper === 'boolean') {
      out.autoStartHotkeyHelper = value.autoStartHotkeyHelper;
    }
    return out;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function uniqueStrings(arr) {
    var seen = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var v = String(arr[i] || '').trim();
      if (v && !seen[v]) {
        seen[v] = true;
        out.push(v);
      }
    }
    return out;
  }

  function bindEvents() {
    $input.addEventListener('input', onInput);
    $input.addEventListener('keydown', onInputKeyDown);
    $clearBtn.addEventListener('click', clear);

    $reindex.addEventListener('click', function () {
      if (!$reindex.classList.contains('spinning')) loadPresets();
    });

    $settingsBtn.addEventListener('click', openSettings);
    $settingsBackdrop.addEventListener('click', closeSettings);
    $settingsClose.addEventListener('click', closeSettings);
    $captureShortcutBtn.addEventListener('click', startShortcutCapture);
    $resetShortcutBtn.addEventListener('click', function () {
      settings.shortcut = DEFAULT_SETTINGS.shortcut;
      applySettingsToUI();
    });
    $addPresetFolderBtn.addEventListener('click', addPresetFolder);
    $clearPresetFoldersBtn.addEventListener('click', function () {
      settings.presetDirs = [];
      renderPresetFolders();
    });
    $saveSettingsBtn.addEventListener('click', function () {
      saveSettings();
      closeSettings();
      loadPresets();
    });

    window.addEventListener('focus', function () { focusSearch(true); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) focusSearch(true);
    });

    document.addEventListener('keydown', function (e) {
      if (captureMode) {
        e.preventDefault();
        e.stopPropagation();
        var combo = eventToShortcut(e);
        if (combo) {
          settings.shortcut = combo;
          captureMode = false;
          $captureShortcutBtn.textContent = 'Record';
          applySettingsToUI();
        }
        return;
      }

      if (matchesShortcut(e, settings.shortcut)) {
        e.preventDefault();
        e.stopPropagation();
        openIronFXPopup();
        return;
      }

      if (document.activeElement !== $input &&
          $settingsModal.classList.contains('hidden') &&
          !e.ctrlKey && !e.metaKey && !e.altKey &&
          e.key && e.key.length === 1) {
        focusSearch(false);
      }
    }, true);
  }

  function focusSearch(selectText) {
    setTimeout(function () {
      if ($input) {
        $input.focus();
        if (selectText) $input.select();
      }
    }, 20);
  }

  function openIronFXPopup() {
    if (!$settingsModal.classList.contains('hidden')) closeSettings();
    focusSearch(true);
    setStatus('IronFX active', 'ok');
    setTimeout(function () { setStatus('Ready', 'idle'); }, 1200);
  }

  function loadPresets() {
    ready = false;
    setStatus('Indexing effects and presets...', 'loading');
    $reindex.classList.add('spinning');

    var dirsJson = JSON.stringify(settings.presetDirs || []);
    cs.evalScript('IronFX.getUserPresets(' + JSON.stringify(dirsJson) + ')', function (raw) {
      $reindex.classList.remove('spinning');

      var presets = [];
      var warnings = [];
      try {
        var parsed = JSON.parse(raw || '{}');
        presets = parsed.presets || [];
        warnings = parsed.warnings || [];
        if (parsed.error) warnings.push(parsed.error);
      } catch (e) {
        warnings.push('Could not parse preset scan response');
      }

      engine.init(BUILT_IN_EFFECTS, presets);
      ready = true;
      showInitial();

      var total = BUILT_IN_EFFECTS.length + presets.length;
      if (warnings.length) {
        setStatus(total + ' items, ' + presets.length + ' presets (warnings)', 'error');
        console.warn('[IronFX] preset scan warnings:', warnings.join(' | '));
      } else {
        setStatus(total + ' items, ' + presets.length + ' presets', 'ok');
      }
      setTimeout(function () { setStatus('Ready', 'idle'); }, 2500);
    });
  }

  function onInput() {
    var q = $input.value;
    $clearBtn.classList.toggle('hidden', q.length === 0);

    if (!q.trim()) {
      showInitial();
      return;
    }

    if (!ready) return;

    results = engine.search(q);
    selIdx = 0;
    render(results, q);
  }

  function render(items, query) {
    $initialState.classList.add('hidden');
    $emptyState.classList.add('hidden');

    if (!items.length) {
      $list.innerHTML = '';
      $emptyQuery.textContent = query;
      $emptyState.classList.remove('hidden');
      $count.textContent = '';
      return;
    }

    $count.textContent = items.length + ' result' + (items.length !== 1 ? 's' : '');

    var html = '';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var icon = item.type === 'audio' ? '&#9834;' : item.isPreset ? '&#9733;' : '&#9670;';
      var badgeCls = item.isPreset ? 'badge-preset' : item.type === 'audio' ? 'badge-audio' : 'badge-effect';
      var badgeTxt = item.isPreset ? 'PRESET' : item.type === 'audio' ? 'AUDIO' : 'FX';
      var selCls = i === selIdx ? ' is-selected' : '';
      var category = escapeHtml(item.category || '');
      var nameHtml = item.highlight || escapeHtml(item.name || '');

      html += '<div class="result-item' + selCls + '" data-idx="' + i + '" role="option">' +
                '<span class="result-icon">' + icon + '</span>' +
                '<div class="result-info">' +
                  '<div class="result-name">' + nameHtml + '</div>' +
                  '<div class="result-category">' + category + '</div>' +
                '</div>' +
                '<span class="result-badge ' + badgeCls + '">' + badgeTxt + '</span>' +
              '</div>';
    }

    $list.innerHTML = html;

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
    selIdx = 0;
  }

  function clear() {
    $input.value = '';
    $clearBtn.classList.add('hidden');
    showInitial();
    focusSearch(false);
  }

  function onInputKeyDown(e) {
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
        if (isPopupMode && !$input.value && $settingsModal.classList.contains('hidden')) {
          closePopup();
        } else {
          clear();
        }
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

  function applyEffect(item) {
    if (!item) return;

    var node = $list.querySelector('[data-idx="' + results.indexOf(item) + '"]');
    if (node) {
      node.classList.add('flash');
      setTimeout(function () { node.classList.remove('flash'); }, 450);
    }

    setStatus('Applying ' + item.name + '...', 'loading');

    var payload = JSON.stringify({
      matchName: item.matchName || '',
      name: item.name || '',
      type: item.type || 'video',
      isPreset: !!item.isPreset,
      presetPath: item.presetPath || '',
      presetName: item.presetName || item.name || '',
      sourceFile: item.sourceFile || ''
    });

    cs.evalScript('IronFX.applyEffect(' + JSON.stringify(payload) + ')', function (raw) {
      var res;
      try {
        res = JSON.parse(raw || '{}');
      } catch (e) {
        setStatus('Error: invalid host response', 'error');
        setTimeout(function () { setStatus('Ready', 'idle'); }, 3500);
        return;
      }

      if (res.partialAffected && !res.clipsAffected) {
        setStatus('Preset partially applied; settings/keyframes unsupported', 'error');
        console.warn('[IronFX] partial preset apply:', res);
        setTimeout(function () { setStatus('Ready', 'idle'); }, 6500);
        updateClipStatus();
        return;
      }

      if (res.error) {
        setStatus(formatApplyError(res), 'error');
        console.error('[IronFX] apply error:', res);
        setTimeout(function () { setStatus('Ready', 'idle'); }, 5000);
        return;
      }

      var n = res.clipsAffected || 0;
      setStatus('Applied to ' + n + ' clip' + (n !== 1 ? 's' : ''), 'ok');
      setTimeout(function () { setStatus('Ready', 'idle'); }, 2200);
      updateClipStatus();
      if (isPopupMode) {
        setTimeout(closePopup, 180);
      }
    });
  }

  function formatApplyError(res) {
    var msg = res && res.error ? String(res.error) : 'Unknown apply error';
    var warnings = res && res.warnings ? res.warnings : [];
    if (warnings.length) {
      msg += ' (' + String(warnings[0]) + ')';
    }
    return 'Error: ' + msg;
  }

  function keepExtensionLoaded() {
    try {
      cs.evalScript('IronFX.keepLoaded()');
    } catch (e) {}
  }

  function startHotkeyBridge() {
    if (isPopupMode || bridgeServer) return;

    var nodeRequire = getNodeRequire();
    if (!nodeRequire) {
      console.warn('[IronFX] Node.js is unavailable; external hotkey bridge cannot start.');
      return;
    }

    try {
      var http = nodeRequire('http');
      bridgeServer = http.createServer(function (req, res) {
        var url = String(req.url || '/');
        setBridgeHeaders(res);

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (url.indexOf('/health') === 0) {
          res.end(JSON.stringify({ ok: true, app: 'IronFX' }));
          return;
        }

        if (url.indexOf('/open') === 0) {
          openFromExternalHotkey(res);
          return;
        }

        res.statusCode = 404;
        res.end('not_found');
      });

      bridgeServer.on('error', function (err) {
        console.warn('[IronFX] hotkey bridge failed:', err && err.message ? err.message : err);
        startExternalHotkeyHelper(nodeRequire);
      });

      bridgeServer.listen(BRIDGE_PORT, '127.0.0.1', function () {
        console.log('[IronFX] hotkey bridge listening on 127.0.0.1:' + BRIDGE_PORT);
        startExternalHotkeyHelper(nodeRequire);
      });
    } catch (e) {
      bridgeServer = null;
      console.warn('[IronFX] could not start hotkey bridge:', e);
      startExternalHotkeyHelper(nodeRequire);
    }
  }

  function startExternalHotkeyHelper(nodeRequire) {
    if (isPopupMode || externalHotkeyProcessStarted || !settings.autoStartHotkeyHelper) return;
    externalHotkeyProcessStarted = true;

    try {
      var os = nodeRequire('os');
      if (!os || os.platform() !== 'win32') return;

      var childProcess = nodeRequire('child_process');
      var path = nodeRequire('path');
      var extensionPath = '';

      try {
        extensionPath = cs.getSystemPath(SystemPath.EXTENSION);
      } catch (e1) {}

      if (!extensionPath) return;

      var scriptPath = path.join(extensionPath, 'tools', 'IronFXHotkey.ps1');
      var child = childProcess.spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden',
        '-File', scriptPath,
        '-Port', String(BRIDGE_PORT),
        '-Quiet'
      ], {
        cwd: extensionPath,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });

      if (child && typeof child.unref === 'function') child.unref();
      console.log('[IronFX] external hotkey helper autostart requested.');
    } catch (e2) {
      console.warn('[IronFX] could not autostart external hotkey helper:', e2);
    }
  }

  function getNodeRequire() {
    try {
      if (typeof require === 'function') return require;
      if (window.cep_node && typeof window.cep_node.require === 'function') {
        return window.cep_node.require;
      }
    } catch (e) {}
    return null;
  }

  function setBridgeHeaders(res) {
    try {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    } catch (e) {}
  }

  function openFromExternalHotkey(res) {
    cs.evalScript('IronFX.getSelectionInfo()', function (raw) {
      var info = {};
      try {
        info = JSON.parse(raw || '{}');
      } catch (e) {}

      if (!info.count) {
        setStatus('No clip selected', 'error');
        setTimeout(function () { setStatus('Ready', 'idle'); }, 2200);
        res.statusCode = 409;
        res.end(JSON.stringify({ ok: false, error: 'no_clip_selected' }));
        return;
      }

      var opened = requestPopupOpen();
      if (!opened) openIronFXPopup();
      res.end(JSON.stringify({ ok: true, openedPopup: opened }));
    });
  }

  function requestPopupOpen() {
    try {
      if (cs && typeof cs.requestOpenExtension === 'function') {
        return cs.requestOpenExtension(POPUP_EXTENSION_ID, 'source=hotkey');
      }
    } catch (e1) {}

    try {
      if (cs && cs._native && typeof cs._native.requestOpenExtension === 'function') {
        cs._native.requestOpenExtension(POPUP_EXTENSION_ID, 'source=hotkey');
        return true;
      }
    } catch (e2) {}

    return false;
  }

  function startClipPoll() {
    updateClipStatus();
    setInterval(updateClipStatus, 1500);
  }

  function updateClipStatus() {
    cs.evalScript('IronFX.getSelectionInfo()', function (raw) {
      try {
        var info = JSON.parse(raw || '{}');
        if (info.count > 0) {
          $clipStatus.textContent = info.count + ' clip' + (info.count !== 1 ? 's' : '') + ' selected';
          $clipStatus.className = 'has-clips';
        } else {
          $clipStatus.textContent = 'No clip selected';
          $clipStatus.className = 'no-clips';
        }
      } catch (e) {
        $clipStatus.textContent = '-';
        $clipStatus.className = '';
      }
    });
  }

  function openSettings() {
    applySettingsToUI();
    $settingsModal.classList.remove('hidden');
    $settingsModal.setAttribute('aria-hidden', 'false');
  }

  function closeSettings() {
    captureMode = false;
    $captureShortcutBtn.textContent = 'Record';
    $settingsModal.classList.add('hidden');
    $settingsModal.setAttribute('aria-hidden', 'true');
    focusSearch(false);
  }

  function applySettingsToUI() {
    $shortcutInput.value = settings.shortcut || DEFAULT_SETTINGS.shortcut;
    $currentShortcutLabel.textContent = settings.shortcut || DEFAULT_SETTINGS.shortcut;
    renderPresetFolders();
  }

  function renderPresetFolders() {
    var dirs = settings.presetDirs || [];
    if (!dirs.length) {
      $presetFoldersList.innerHTML = '<div class="folder-empty">No extra folders added.</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < dirs.length; i++) {
      html += '<div class="folder-row">' +
                '<span title="' + escapeHtml(dirs[i]) + '">' + escapeHtml(dirs[i]) + '</span>' +
                '<button data-folder-idx="' + i + '">Remove</button>' +
              '</div>';
    }
    $presetFoldersList.innerHTML = html;

    var buttons = $presetFoldersList.querySelectorAll('button[data-folder-idx]');
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].addEventListener('click', function () {
        var idx = parseInt(this.getAttribute('data-folder-idx'), 10);
        settings.presetDirs.splice(idx, 1);
        renderPresetFolders();
      });
    }
  }

  function addPresetFolder() {
    var picked = pickFolder();
    if (!picked) return;
    settings.presetDirs = uniqueStrings((settings.presetDirs || []).concat([picked]));
    renderPresetFolders();
  }

  function pickFolder() {
    try {
      if (window.cep && window.cep.fs) {
        var result;
        if (typeof window.cep.fs.showOpenDialogEx === 'function') {
          result = window.cep.fs.showOpenDialogEx(false, true, 'Select preset folder', '', []);
        } else if (typeof window.cep.fs.showOpenDialog === 'function') {
          result = window.cep.fs.showOpenDialog(false, true, 'Select preset folder', '', []);
        }
        if (result && result.data && result.data.length) return result.data[0];
      }
    } catch (e) {
      console.warn('[IronFX] folder picker failed:', e);
    }
    setStatus('Folder picker unavailable in this CEP host', 'error');
    setTimeout(function () { setStatus('Ready', 'idle'); }, 3500);
    return '';
  }

  function startShortcutCapture() {
    captureMode = true;
    $captureShortcutBtn.textContent = 'Press keys...';
    $shortcutInput.value = 'Press shortcut...';
  }

  function eventToShortcut(e) {
    var key = normalizeKeyName(e.key);
    if (!key) return '';
    if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return '';

    var parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Cmd');
    parts.push(key);
    return parts.join('+');
  }

  function normalizeKeyName(key) {
    if (!key) return '';
    if (key === ' ') return 'Space';
    if (key === 'Esc') return 'Escape';
    if (key.length === 1) return key.toUpperCase();
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  function matchesShortcut(e, shortcut) {
    if (!shortcut) return false;
    return eventToShortcut(e) === shortcut;
  }

  function setStatus(msg, state) {
    $statusText.textContent = msg;
    $statusDot.className = 'dot-' + (state || 'idle');
  }

  function detectPopupMode() {
    try {
      if (cs && typeof cs.getExtensionID === 'function' && cs.getExtensionID() === POPUP_EXTENSION_ID) {
        return true;
      }
    } catch (e1) {}

    try {
      return /[?&]mode=popup\b|popup\.html/i.test(window.location.href);
    } catch (e2) {
      return false;
    }
  }

  function closePopup() {
    if (!isPopupMode) return;
    try {
      if (cs && typeof cs.closeExtension === 'function') {
        cs.closeExtension();
      }
    } catch (e) {}
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.IronFXPanel = {
    reloadIndex: loadPresets,
    openSettings: openSettings,
    isPopupMode: function () { return isPopupMode; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
