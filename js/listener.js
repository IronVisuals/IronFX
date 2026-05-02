/**
 * Invisible IronFX shortcut listener.
 * Mirrors the Excalibur/Spellbook-style split: this hidden CEP extension keeps
 * the local hotkey bridge alive even when the visible panel is not open.
 */

/* global CSInterface, SystemPath */

(function () {
  'use strict';

  var LISTENER_EXTENSION_ID = 'com.ironfx.listener';
  var POPUP_EXTENSION_ID = 'com.ironfx.popup';
  var BRIDGE_PORT = 32178;

  var cs = new CSInterface();
  var bridgeServer = null;
  var helperStarted = false;

  function init() {
    keepLoaded();
    startHotkeyBridge();
  }

  function keepLoaded() {
    try {
      cs.evalScript('IronFX.keepLoaded(' + JSON.stringify(LISTENER_EXTENSION_ID) + ')');
    } catch (e) {}
  }

  function startHotkeyBridge() {
    var nodeRequire = getNodeRequire();
    if (!nodeRequire) {
      console.warn('[IronFX Listener] Node.js is unavailable; hotkey bridge cannot start.');
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
          res.end(JSON.stringify({ ok: true, app: 'IronFX', listener: true }));
          return;
        }

        if (url.indexOf('/open') === 0) {
          openFromExternalHotkey(res);
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false, error: 'not_found' }));
      });

      bridgeServer.on('error', function (err) {
        console.warn('[IronFX Listener] bridge failed:', err && err.message ? err.message : err);
        startExternalHotkeyHelper(nodeRequire);
      });

      bridgeServer.listen(BRIDGE_PORT, '127.0.0.1', function () {
        console.log('[IronFX Listener] bridge listening on 127.0.0.1:' + BRIDGE_PORT);
        startExternalHotkeyHelper(nodeRequire);
      });
    } catch (e) {
      console.warn('[IronFX Listener] could not start bridge:', e);
      startExternalHotkeyHelper(nodeRequire);
    }
  }

  function openFromExternalHotkey(res) {
    cs.evalScript('IronFX.getSelectionInfo()', function (raw) {
      var info = {};
      try {
        info = JSON.parse(raw || '{}');
      } catch (e) {}

      if (!info.count) {
        res.statusCode = 409;
        res.end(JSON.stringify({ ok: false, error: 'no_clip_selected' }));
        return;
      }

      var opened = requestPopupOpen();
      res.end(JSON.stringify({ ok: !!opened, openedPopup: !!opened }));
    });
  }

  function requestPopupOpen() {
    try {
      if (cs && typeof cs.requestOpenExtension === 'function') {
        return cs.requestOpenExtension(POPUP_EXTENSION_ID, '');
      }
    } catch (e1) {}

    try {
      if (cs && cs._native && typeof cs._native.requestOpenExtension === 'function') {
        cs._native.requestOpenExtension(POPUP_EXTENSION_ID, '');
        return true;
      }
    } catch (e2) {}

    return false;
  }

  function startExternalHotkeyHelper(nodeRequire) {
    if (helperStarted) return;
    helperStarted = true;

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
      console.log('[IronFX Listener] external hotkey helper autostart requested.');
    } catch (e2) {
      console.warn('[IronFX Listener] could not autostart helper:', e2);
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
