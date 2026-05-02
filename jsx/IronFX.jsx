/**
 * IronFX.jsx — ExtendScript host bridge
 *
 * Runs inside Premiere Pro's ExtendScript engine (ES3 + Adobe DOM).
 * All public functions return JSON strings so the CEP layer can parse them.
 *
 * Public API:
 *   IronFX.getUserPresets()         → { presets: [...], error: null }
 *   IronFX.applyEffect(payloadStr)  → { clipsAffected: N, error: null }
 *   IronFX.getSelectionInfo()       → { count: N }
 */

// Ensure JSON is available (PP 2019+ includes it; polyfill for safety)
if (typeof JSON === 'undefined') {
  JSON = {};
  JSON.stringify = function (v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string')  return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v instanceof Array) {
      var a = [];
      for (var i = 0; i < v.length; i++) a.push(JSON.stringify(v[i]));
      return '[' + a.join(',') + ']';
    }
    if (typeof v === 'object') {
      var pairs = [];
      for (var k in v) {
        if (v.hasOwnProperty(k)) pairs.push(JSON.stringify(k) + ':' + JSON.stringify(v[k]));
      }
      return '{' + pairs.join(',') + '}';
    }
    return 'null';
  };
  JSON.parse = function (s) { return eval('(' + s + ')'); };
}

// ── Suppress ESTK debugger interrupts in production
$.level = 0;

// ============================================================================

var IronFX = (function () {

  // ── Preset scanning ─────────────────────────────────────────────────────────

  function getUserPresets() {
    var result = { presets: [], error: null };
    try {
      var folder = _resolvePresetsFolder();
      if (!folder) {
        result.error = 'Presets folder not found';
        return JSON.stringify(result);
      }
      _scanFolder(folder, '', result.presets);
    } catch (e) {
      result.error = e.toString();
    }
    return JSON.stringify(result);
  }

  function _resolvePresetsFolder() {
    var isWin = ($.os.toLowerCase().indexOf('win') !== -1);
    var basePath;

    if (isWin) {
      var appData = $.getenv('APPDATA');
      if (!appData) return null;
      basePath = appData + '\\Adobe\\Premiere Pro';
    } else {
      var home = $.getenv('HOME');
      if (!home) return null;
      basePath = home + '/Library/Application Support/Adobe/Premiere Pro';
    }

    var baseFolder = new Folder(basePath);
    if (!baseFolder.exists) return null;

    // Find the highest numeric version sub-folder (e.g. "22.0", "23.0", "24.0")
    var children  = baseFolder.getFiles('*');
    var bestVer   = 0;
    var bestChild = null;

    for (var i = 0; i < children.length; i++) {
      if (children[i] instanceof Folder) {
        var ver = parseFloat(children[i].name);
        if (!isNaN(ver) && ver > bestVer) {
          bestVer   = ver;
          bestChild = children[i];
        }
      }
    }

    if (!bestChild) return null;

    var sep = isWin ? '\\' : '/';
    var candidates = [
      new Folder(bestChild.fsName + sep + 'Effect Presets and Custom Items'),
      new Folder(bestChild.fsName + sep + 'Presets'),
    ];

    for (var j = 0; j < candidates.length; j++) {
      if (candidates[j].exists) return candidates[j];
    }

    return null;
  }

  function _scanFolder(folder, categoryPath, out) {
    var items = folder.getFiles('*');
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item instanceof Folder) {
        var sub = categoryPath ? (categoryPath + ' / ' + item.name) : item.name;
        _scanFolder(item, sub, out);
      } else if (item instanceof File) {
        var ext = item.name.split('.').pop().toLowerCase();
        if (ext === 'prfpset' || ext === 'prpreset') {
          var label = item.name.replace(/\.(prfpset|prpreset)$/i, '');
          out.push({
            name:       label,
            matchName:  '',
            category:   categoryPath || 'User Presets',
            type:       'video',
            isPreset:   true,
            presetPath: item.fsName,
          });
        }
      }
    }
  }

  // ── Apply effect ────────────────────────────────────────────────────────────

  function applyEffect(payloadStr) {
    var result = { clipsAffected: 0, error: null };
    var payload;

    try {
      payload = JSON.parse(payloadStr);
    } catch (e) {
      result.error = 'Bad payload: ' + e.toString();
      return JSON.stringify(result);
    }

    try {
      var seq = app.project.activeSequence;
      if (!seq) {
        result.error = 'No active sequence';
        return JSON.stringify(result);
      }

      var clips = _getSelectedClips(seq);
      if (clips.length === 0) {
        result.error = 'No clips selected in the timeline';
        return JSON.stringify(result);
      }

      app.beginUndoGroup('IronFX: ' + payload.name);

      try {
        for (var i = 0; i < clips.length; i++) {
          var ok;
          if (payload.isPreset && payload.presetPath) {
            ok = _applyPreset(clips[i], payload.presetPath);
          } else {
            ok = _applyEffect(clips[i], payload.matchName);
          }
          if (ok) result.clipsAffected++;
        }
      } finally {
        app.endUndoGroup();
      }

      if (result.clipsAffected === 0) {
        result.error = 'Effect could not be applied. Verify it is installed.';
      }

    } catch (e) {
      result.error = e.toString();
      try { app.endUndoGroup(); } catch (ignore) {}
    }

    return JSON.stringify(result);
  }

  // Primary path: official Premiere Pro ExtendScript API
  function _applyEffect(clip, matchName) {
    try {
      var comp = clip.components;
      if (!comp) return false;
      var added = comp.addComponent(matchName);
      return (added !== null && added !== undefined);
    } catch (e) {
      // Fallback: QE DOM (undocumented but widely used)
      return _applyEffectQE(clip, matchName);
    }
  }

  // QE DOM fallback for effects that addComponent() cannot reach
  function _applyEffectQE(clip, matchName) {
    try {
      app.enableQE();
      var qeSeq = qe.project.getActiveSequence();
      if (!qeSeq) return false;

      var qeClip = _matchQEClip(qeSeq, clip);
      if (!qeClip) return false;

      // QE clip exposes addVideoEffect / addAudioEffect
      if (typeof qeClip.addVideoEffect === 'function') {
        qeClip.addVideoEffect(matchName);
        return true;
      }
    } catch (e) {}
    return false;
  }

  // Preset application: try QE applyPreset(), fall back to file-based import
  function _applyPreset(clip, presetPath) {
    // Method 1: QE DOM applyPreset (Premiere Pro 2020+)
    try {
      app.enableQE();
      var qeSeq = qe.project.getActiveSequence();
      if (qeSeq) {
        var qeClip = _matchQEClip(qeSeq, clip);
        if (qeClip && typeof qeClip.applyPreset === 'function') {
          qeClip.applyPreset(presetPath);
          return true;
        }
      }
    } catch (e) {}

    // Method 2: components.importPreset (available in some API versions)
    try {
      var f = new File(presetPath);
      if (!f.exists) return false;
      var comp = clip.components;
      if (comp && typeof comp.importPreset === 'function') {
        comp.importPreset(f);
        return true;
      }
    } catch (e) {}

    return false;
  }

  // Match a standard TrackItem to a QE clip by timeline start position
  function _matchQEClip(qeSeq, clip) {
    try {
      var targetSec = clip.start.seconds;
      var trackLists = [qeSeq.videoTrackList, qeSeq.audioTrackList];

      for (var t = 0; t < trackLists.length; t++) {
        var tl = trackLists[t];
        if (!tl) continue;
        for (var i = 0; i < tl.numTracks; i++) {
          var track = tl[i];
          for (var j = 0; j < track.numItems; j++) {
            var qeClip = track[j];
            if (Math.abs(qeClip.start.secs - targetSec) < 0.001) {
              return qeClip;
            }
          }
        }
      }
    } catch (e) {}
    return null;
  }

  // ── Selection helpers ────────────────────────────────────────────────────────

  function _getSelectedClips(seq) {
    var clips = [];

    // Modern API: Sequence.getSelection() (PP 14.0 / 2020+)
    try {
      var sel = seq.getSelection();
      if (sel && sel.length > 0) return sel;
    } catch (e) {}

    // Legacy fallback: iterate all tracks and test clip.isSelected()
    try {
      var vt = seq.videoTracks;
      for (var vi = 0; vi < vt.numTracks; vi++) {
        var vTrack = vt[vi];
        for (var vc = 0; vc < vTrack.clips.numItems; vc++) {
          try {
            var vClip = vTrack.clips[vc];
            if (vClip.isSelected()) clips.push(vClip);
          } catch (e) {}
        }
      }

      var at = seq.audioTracks;
      for (var ai = 0; ai < at.numTracks; ai++) {
        var aTrack = at[ai];
        for (var ac = 0; ac < aTrack.clips.numItems; ac++) {
          try {
            var aClip = aTrack.clips[ac];
            if (aClip.isSelected()) clips.push(aClip);
          } catch (e) {}
        }
      }
    } catch (e) {}

    return clips;
  }

  function getSelectionInfo() {
    var result = { count: 0 };
    try {
      var seq = app.project.activeSequence;
      if (!seq) return JSON.stringify(result);
      result.count = _getSelectedClips(seq).length;
    } catch (e) {}
    return JSON.stringify(result);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  return {
    getUserPresets:   getUserPresets,
    applyEffect:      applyEffect,
    getSelectionInfo: getSelectionInfo,
  };

})();
