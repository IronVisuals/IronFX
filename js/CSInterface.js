/**
 * CSInterface.js — Adobe CEP (Common Extensibility Platform) bridge
 * Wraps the native window.__adobe_cep__ object injected by the CEP runtime.
 * Version: 10.0  |  License: Apache 2.0 (Adobe)
 */

'use strict';

var SystemPath = {
  APPLICATION:        'application',
  EXTENSION:          'extension',
  HOST_APPLICATION:   'hostApplication',
  COMMON_FILES:       'commonFiles',
  MY_DOCUMENTS:       'myDocuments',
  APPLICATION_DATA:   'userData',
  APPLICATION_SUPPORT:'applicationSupport',
};

/**
 * @constructor
 */
function CSInterface() {
  this._native = window.__adobe_cep__ || null;
  this._listeners = {};
}

/**
 * Evaluate an ExtendScript string inside the host application.
 * @param {string}   script
 * @param {Function} [callback]  Receives the result string.
 */
CSInterface.prototype.evalScript = function (script, callback) {
  var cb = (typeof callback === 'function') ? callback : function () {};
  if (this._native) {
    this._native.evalScript(script, cb);
  } else {
    cb('{"error":"CSInterface: not running inside CEP"}');
  }
};

/**
 * Add a listener for a CEP or custom event.
 * @param {string}   type
 * @param {Function} listener
 */
CSInterface.prototype.addEventListener = function (type, listener) {
  if (!this._listeners[type]) {
    this._listeners[type] = [];
    if (this._native) {
      var self = this;
      this._native.addEventListener(type, function (rawEvent) {
        var handlers = self._listeners[type] || [];
        for (var i = 0; i < handlers.length; i++) {
          try { handlers[i](rawEvent); } catch (e) {}
        }
      });
    }
  }
  if (this._listeners[type].indexOf(listener) === -1) {
    this._listeners[type].push(listener);
  }
};

/**
 * Remove a previously registered listener.
 */
CSInterface.prototype.removeEventListener = function (type, listener) {
  var list = this._listeners[type];
  if (!list) return;
  var idx = list.indexOf(listener);
  if (idx !== -1) list.splice(idx, 1);
};

/**
 * Dispatch a CEP event to other extensions or the host.
 * @param {object} event  Must have .type, .scope, .appId, .extensionId, .data
 */
CSInterface.prototype.dispatchEvent = function (event) {
  if (this._native) {
    this._native.dispatchEvent(JSON.stringify(event));
  }
};

/**
 * Get a well-known system path.
 * @param  {string} pathType  One of SystemPath.*
 * @returns {string}
 */
CSInterface.prototype.getSystemPath = function (pathType) {
  if (this._native) {
    return decodeURI(this._native.getSystemPath(pathType));
  }
  return '';
};

/** @returns {string} The extension's bundle ID */
CSInterface.prototype.getExtensionID = function () {
  return this._native ? this._native.getExtensionID() : 'com.ironfx.panel';
};

/** Close this extension panel. */
CSInterface.prototype.closeExtension = function () {
  if (this._native) this._native.closeExtension();
};

/**
 * Ask CEP to open another extension from the same bundle.
 * @param {string} extensionId
 * @param {string} params
 */
CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
  if (this._native && typeof this._native.requestOpenExtension === 'function') {
    this._native.requestOpenExtension(extensionId, params || '');
    return true;
  }
  return false;
};

/**
 * Set the panel window title.
 * @param {string} title
 */
CSInterface.prototype.setWindowTitle = function (title) {
  if (this._native) this._native.setWindowTitle(title);
};

/** @returns {string} */
CSInterface.prototype.getWindowTitle = function () {
  return this._native ? this._native.getWindowTitle() : 'IronFX';
};

/**
 * Resize the panel content area.
 * @param {number} width
 * @param {number} height
 */
CSInterface.prototype.resizeTo = function (width, height) {
  if (this._native) this._native.resizeTo(width, height);
};

/**
 * Returns host environment info as a JSON string.
 * @returns {string}
 */
CSInterface.prototype.getHostEnvironment = function () {
  return this._native ? this._native.getHostEnvironment() : '{}';
};

/** True when running inside the CEP runtime (Premiere, etc.) */
CSInterface.prototype.isInCEP = function () {
  return !!this._native;
};
