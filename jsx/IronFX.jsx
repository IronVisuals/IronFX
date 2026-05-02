/**
 * IronFX.jsx - Premiere Pro host bridge for CEP.
 * ES3-compatible ExtendScript.
 *
 * Public API:
 *   IronFX.getUserPresets(extraDirsJson)
 *   IronFX.applyEffect(payloadJson)
 *   IronFX.getSelectionInfo()
 */

if (typeof JSON === 'undefined') {
  JSON = {};
  JSON.stringify = function (v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
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

$.level = 0;

var IronFX = (function () {

  function getUserPresets(extraDirsJson) {
    var result = { presets: [], warnings: [], error: null };
    var extraDirs = [];

    try {
      if (extraDirsJson && typeof extraDirsJson === 'string') {
        extraDirs = JSON.parse(extraDirsJson);
      }
    } catch (parseErr) {
      result.warnings.push('Could not parse extra preset folders: ' + parseErr.toString());
      extraDirs = [];
    }

    try {
      var roots = _getPresetRoots(extraDirs, result.warnings);
      var seenFiles = {};
      var seenPresets = {};

      for (var i = 0; i < roots.length; i++) {
        _scanPresetRoot(roots[i], result.presets, result.warnings, seenFiles, seenPresets);
      }

      if (result.presets.length === 0) {
        result.warnings.push('No .prfpset/.prpreset files found in Premiere profile folders or extra folders.');
      }
    } catch (e) {
      result.error = e.toString();
    }

    return JSON.stringify(result);
  }

  function _getPresetRoots(extraDirs, warnings) {
    var roots = [];
    var isWin = ($.os.toLowerCase().indexOf('win') !== -1);

    if (isWin) {
      _pushFolder(roots, new Folder($.getenv('APPDATA') + '\\Adobe\\Premiere Pro'));
      _pushFolder(roots, new Folder($.getenv('USERPROFILE') + '\\Documents\\Adobe\\Premiere Pro'));
      _pushFolder(roots, new Folder($.getenv('USERPROFILE') + '\\OneDrive\\Documents\\Adobe\\Premiere Pro'));
    } else {
      _pushFolder(roots, new Folder($.getenv('HOME') + '/Library/Application Support/Adobe/Premiere Pro'));
      _pushFolder(roots, new Folder($.getenv('HOME') + '/Documents/Adobe/Premiere Pro'));
    }

    if (extraDirs && extraDirs.length) {
      for (var i = 0; i < extraDirs.length; i++) {
        _pushFolder(roots, new Folder(extraDirs[i]));
      }
    }

    var expanded = [];
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      _pushFolder(expanded, root);
      try {
        var children = root.getFiles('*');
        for (var c = 0; c < children.length; c++) {
          if (children[c] instanceof Folder) {
            if (/^\d+(\.\d+)?$/.test(children[c].name) || /^Profile/i.test(children[c].name)) {
              _pushFolder(expanded, children[c]);
            }
          }
        }
      } catch (e) {
        warnings.push('Could not expand preset root ' + root.fsName + ': ' + e.toString());
      }
    }

    return _uniqueFolders(expanded);
  }

  function _pushFolder(arr, folder) {
    try {
      if (folder && folder.exists) arr.push(folder);
    } catch (e) {}
  }

  function _uniqueFolders(folders) {
    var seen = {};
    var out = [];
    for (var i = 0; i < folders.length; i++) {
      var key = folders[i].fsName;
      if (!seen[key]) {
        seen[key] = true;
        out.push(folders[i]);
      }
    }
    return out;
  }

  function _scanPresetRoot(root, out, warnings, seenFiles, seenPresets) {
    _scanFolder(root, root.name, out, warnings, seenFiles, seenPresets, 0);
  }

  function _scanFolder(folder, categoryPath, out, warnings, seenFiles, seenPresets, depth) {
    if (!folder || !folder.exists || depth > 8) return;

    var items;
    try {
      items = folder.getFiles('*');
    } catch (e) {
      warnings.push('Could not read folder ' + folder.fsName + ': ' + e.toString());
      return;
    }

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item instanceof Folder) {
        var sub = categoryPath ? (categoryPath + ' / ' + item.name) : item.name;
        _scanFolder(item, sub, out, warnings, seenFiles, seenPresets, depth + 1);
      } else if (item instanceof File) {
        var ext = _extension(item.name);
        if (ext === 'prfpset' || ext === 'prpreset') {
          _indexPresetFile(item, categoryPath || 'User Presets', out, warnings, seenFiles, seenPresets);
        }
      }
    }
  }

  function _indexPresetFile(file, categoryPath, out, warnings, seenFiles, seenPresets) {
    var fileKey = file.fsName;
    if (seenFiles[fileKey]) return;
    seenFiles[fileKey] = true;

    var entries = _extractPresetEntries(file, warnings);
    if (entries.length === 0) {
      entries = [{ name: _basename(file.name), type: 'video' }];
    }

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var name = entry.name;
      var presetType = entry.type || 'video';
      var presetKey = file.fsName + '::' + name + '::' + presetType;
      if (seenPresets[presetKey]) continue;
      seenPresets[presetKey] = true;

      out.push({
        name: name,
        matchName: '',
        category: categoryPath || 'User Presets',
        type: presetType,
        isPreset: true,
        presetPath: file.fsName,
        presetName: name,
        sourceFile: file.name
      });
    }
  }

  function _extractPresetEntries(file, warnings) {
    var text = _readFileText(file, warnings);
    var entries = [];
    var seen = {};

    if (!text) return entries;

    _collectRegexPresetEntries(text, /<Preset[^>]*(?:name|Name|displayName|DisplayName)=["']([^"']+)["']/g, entries, seen, 'video');
    _collectRegexPresetEntries(text, /<(?:Name|name|DisplayName|displayName)>([^<]+)<\/(?:Name|name|DisplayName|displayName)>/g, entries, seen, 'video');
    _collectRegexPresetEntries(text, /(?:PresetName|presetName|displayName|DisplayName|Name|name)=["']([^"']+)["']/g, entries, seen, 'video');
    _collectPremiereTextPresetEntries(text, entries, seen);

    return entries;
  }

  function _collectRegexPresetEntries(text, regex, out, seen, type) {
    var m;
    while ((m = regex.exec(text)) !== null) {
      var name = _cleanPresetName(m[1]);
      if (_looksLikePresetName(name) && !seen[name]) {
        seen[name] = true;
        out.push({ name: name, type: type || 'video' });
      }
      if (out.length > 5000) break;
    }
  }

  function _collectPremiereTextPresetEntries(text, out, seen) {
    var mediaGuid = '(228cda18-3625-4d2d-951e-348879e4ed93|80b8e3d5-6dca-4195-aefb-cb5f407ab009)';
    var re = new RegExp('(?:^|\\s)(?:true|false)\\s+false\\s+\\d+\\s+false\\s+(.{2,140}?)\\s+false\\s+\\d+\\s+\\d+\\s+\\d+(?:\\.\\d*)?\\s+\\d{10,}\\s+\\d+\\s+' + mediaGuid, 'ig');
    var m;

    while ((m = re.exec(text)) !== null) {
      var name = _cleanPresetName(m[1]);
      var guid = String(m[2] || '').toLowerCase();
      var type = guid === '80b8e3d5-6dca-4195-aefb-cb5f407ab009' ? 'audio' : 'video';
      var key = name + '::' + type;

      if (_looksLikePresetName(name) && !seen[key]) {
        seen[key] = true;
        out.push({ name: name, type: type });
      }
      if (out.length > 5000) break;
    }
  }

  function _readFileText(file, warnings) {
    try {
      file.encoding = 'UTF-8';
      if (!file.open('r')) return '';
      var text = file.read();
      file.close();
      return text;
    } catch (e) {
      try { file.close(); } catch (ignore) {}
      warnings.push('Could not parse preset file ' + file.fsName + ': ' + e.toString());
      return '';
    }
  }

  function _cleanPresetName(value) {
    var s = String(value || '');
    s = s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    s = s.replace(/[\r\n\t]+/g, ' ');
    s = _trim(s);
    return s;
  }

  function _looksLikePresetName(name) {
    if (!name) return false;
    if (name.length < 2 || name.length > 140) return false;
    if (/^(true|false|null|none|undefined)$/i.test(name)) return false;
    if (/^\d+(\.\d+)?$/.test(name)) return false;
    if (/^(ADBE|AE\.|PR\.|BE\.|VideoFilter|AudioFilter)/i.test(name)) return false;
    if (/\.(dll|bundle|plugin|prfpset|prpreset)$/i.test(name)) return false;
    return true;
  }

  function _basename(name) {
    return String(name || '').replace(/\.(prfpset|prpreset)$/i, '');
  }

  function _extension(name) {
    var parts = String(name || '').split('.');
    if (parts.length < 2) return '';
    return parts[parts.length - 1].toLowerCase();
  }

  function _trim(s) {
    return String(s || '').replace(/^\s+|\s+$/g, '');
  }

  function applyEffect(payloadStr) {
    var result = { clipsAffected: 0, partialAffected: 0, skipped: 0, warnings: [], error: null };
    var payload;
    var undoStarted = false;

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

      var refs = _getSelectedClipRefs(seq);
      if (refs.length === 0) {
        result.error = 'No clips selected in the timeline';
        return JSON.stringify(result);
      }

      undoStarted = _beginUndo('IronFX: ' + (payload.name || payload.presetName || 'Apply'));
      if (!undoStarted) result.warnings.push('Premiere CEP host did not expose app.beginUndoGroup(); action was applied without a named undo group.');

      for (var i = 0; i < refs.length; i++) {
        var ok = false;
        var partial = false;
        if (payload.isPreset && payload.presetPath) {
          var presetState = _applyPresetToRef(refs[i], payload, result.warnings);
          ok = presetState === 'applied';
          partial = presetState === 'partial';
        } else {
          ok = _applyNativeEffectToRef(refs[i], payload, result.warnings);
        }
        if (ok) result.clipsAffected++;
        else if (partial) result.partialAffected++;
        else result.skipped++;
      }

      if (undoStarted) _endUndo();
      undoStarted = false;

      if (result.clipsAffected === 0 && result.partialAffected > 0) {
        result.error = 'Preset could only be applied partially. The base effect was added, but saved preset settings/keyframes were not applied by Premiere scripting.';
      } else if (result.clipsAffected === 0) {
        result.error = 'Nothing was applied. Check clip type, effect name, preset file, or installation.';
      }
    } catch (err) {
      result.error = err.toString();
      if (undoStarted) {
        try { _endUndo(); } catch (ignore2) {}
      }
    }

    return JSON.stringify(result);
  }

  function _beginUndo(name) {
    try {
      if (app && typeof app.beginUndoGroup === 'function') {
        app.beginUndoGroup(name);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function _endUndo() {
    try {
      if (app && typeof app.endUndoGroup === 'function') app.endUndoGroup();
    } catch (e) {}
  }

  function _applyNativeEffectToRef(ref, payload, warnings) {
    var wantedType = payload.type || 'video';
    if (wantedType === 'audio' && ref.kind !== 'audio') return false;
    if (wantedType !== 'audio' && ref.kind !== 'video') return false;

    try {
      app.enableQE();
      var qeSeq = qe.project.getActiveSequence();
      if (!qeSeq) return false;

      var qeClip = _getQEClipForRef(qeSeq, ref);
      if (!qeClip) return false;

      if (wantedType === 'audio') {
        return _addAudioEffectQE(qeClip, payload);
      }
      return _addVideoEffectQE(qeClip, payload);
    } catch (e) {
      warnings.push('QE apply failed for ' + (payload.name || payload.matchName) + ': ' + e.toString());
    }

    return _applyComponentFallback(ref.clip, payload, warnings);
  }

  function _addVideoEffectQE(qeClip, payload) {
    var effect = _findVideoEffect(payload);
    if (!effect) return false;

    try {
      if (typeof qeClip.addVideoEffect === 'function') {
        qeClip.addVideoEffect(effect);
        return true;
      }
    } catch (e1) {
      try {
        qeClip.addVideoEffect(payload.name);
        return true;
      } catch (e2) {}
    }
    return false;
  }

  function _addAudioEffectQE(qeClip, payload) {
    var effect = _findAudioEffect(payload);
    if (!effect) return false;

    try {
      if (typeof qeClip.addAudioEffect === 'function') {
        qeClip.addAudioEffect(effect);
        return true;
      }
    } catch (e1) {
      try {
        qeClip.addAudioEffect(payload.name);
        return true;
      } catch (e2) {}
    }
    return false;
  }

  function _findVideoEffect(payload) {
    var names = _effectCandidateNames(payload);
    for (var i = 0; i < names.length; i++) {
      try {
        if (qe.project && typeof qe.project.getVideoEffectByName === 'function') {
          var effect = qe.project.getVideoEffectByName(names[i]);
          if (effect) return effect;
          try {
            effect = qe.project.getVideoEffectByName(names[i], true);
            if (effect) return effect;
          } catch (ignoreVideoFuzzy) {}
        }
      } catch (e) {}
    }
    return null;
  }

  function _findAudioEffect(payload) {
    var names = _effectCandidateNames(payload);
    for (var i = 0; i < names.length; i++) {
      try {
        if (qe.project && typeof qe.project.getAudioEffectByName === 'function') {
          var effect = qe.project.getAudioEffectByName(names[i]);
          if (effect) return effect;
          try {
            effect = qe.project.getAudioEffectByName(names[i], true);
            if (effect) return effect;
          } catch (ignoreAudioFuzzy) {}
        }
      } catch (e) {}
    }
    return null;
  }

  function _effectCandidateNames(payload) {
    var out = [];
    _pushUniqueString(out, payload.name);
    _pushUniqueString(out, payload.matchName);

    if (payload.matchName) {
      var simplified = String(payload.matchName).replace(/^AEVideoFilter\s+/i, '').replace(/^AE\.\s*/i, '').replace(/^PR\.\s*/i, '').replace(/^ADBE\s+/i, '');
      _pushUniqueString(out, simplified);
      _pushUniqueString(out, 'AE.' + simplified);
    }
    return out;
  }

  function _pushUniqueString(arr, value) {
    var s = _trim(value);
    if (!s) return;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === s) return;
    }
    arr.push(s);
  }

  function _applyComponentFallback(clip, payload, warnings) {
    try {
      if (clip && clip.components && typeof clip.components.addComponent === 'function') {
        var added = clip.components.addComponent(payload.matchName || payload.name);
        return added !== null && added !== undefined;
      }
    } catch (e) {
      warnings.push('Component fallback failed: ' + e.toString());
    }
    return false;
  }

  function _applyPresetToRef(ref, payload, warnings) {
    var wantedType = payload.type || 'video';
    if (wantedType === 'audio' && ref.kind !== 'audio') return 'none';
    if (wantedType !== 'audio' && ref.kind !== 'video') return 'none';

    var f = new File(payload.presetPath);
    if (!f.exists) {
      warnings.push('Preset file not found: ' + payload.presetPath);
      return 'none';
    }

    try {
      app.enableQE();
      var qeSeq = qe.project.getActiveSequence();
      var qeClip = qeSeq ? _getQEClipForRef(qeSeq, ref) : null;
      if (qeClip) {
        if (_tryPresetAsNamedEffect(qeClip, payload, ref.kind, ref.clip, warnings)) {
          return 'applied';
        }

        if (_tryQEApplyPresetFile(qeClip, f, payload, ref.clip, warnings)) {
          return 'applied';
        }

        if (_applyPresetBaseEffectsFromFile(qeClip, f, payload, ref.kind, ref.clip, warnings)) {
          return 'partial';
        }
      }
    } catch (e) {
      warnings.push('QE preset apply failed for ' + payload.presetName + ': ' + e.toString());
    }

    if (_tryComponentPresetFallback(ref.clip, f, payload, warnings)) return 'applied';

    return 'none';
  }

  function _tryQEApplyPresetFile(qeClip, file, payload, clip, warnings) {
    var path = file.fsName;
    var name = payload.presetName || payload.name || '';
    var attempts = [
      { method: 'applyPreset', args: [path, name] },
      { method: 'applyPreset', args: [path] },
      { method: 'applyPreset', args: [file] },
      { method: 'addPreset', args: [path, name] },
      { method: 'addPreset', args: [path] },
      { method: 'addPreset', args: [file] }
    ];
    var exposedMethod = false;
    var lastError = '';
    var unchangedCalls = 0;

    for (var i = 0; i < attempts.length; i++) {
      var attempt = attempts[i];
      if (typeof qeClip[attempt.method] !== 'function') continue;
      exposedMethod = true;

      try {
        var before = _componentSignature(clip);
        var ret = qeClip[attempt.method].apply(qeClip, attempt.args);
        if (ret !== false && _componentSignatureChanged(clip, before)) return true;
        unchangedCalls++;
      } catch (e) {
        lastError = e.toString();
      }
    }

    if (!exposedMethod) {
      warnings.push('This Premiere QE clip does not expose applyPreset/addPreset for preset files.');
    } else if (unchangedCalls > 0) {
      warnings.push('QE preset file call returned without changing the clip.');
    } else if (lastError) {
      warnings.push('QE preset file call failed: ' + lastError);
    }
    return false;
  }

  function _tryPresetAsNamedEffect(qeClip, payload, kind, clip, warnings) {
    var names = [];
    _pushUniqueString(names, payload.presetName);
    _pushUniqueString(names, payload.name);
    _pushUniqueString(names, _basename(payload.sourceFile || ''));
    _pushUniqueString(names, _basename(payload.presetPath || ''));

    for (var i = 0; i < names.length; i++) {
      var lookupPayload = { name: names[i], matchName: names[i] };
      var effect = kind === 'audio' ? _findAudioEffect(lookupPayload) : _findVideoEffect(lookupPayload);
      if (!effect) continue;

      try {
        var before = _componentSignature(clip);
        if (kind === 'audio' && typeof qeClip.addAudioEffect === 'function') {
          qeClip.addAudioEffect(effect);
          if (_componentSignatureChanged(clip, before)) return true;
        }
        if (kind !== 'audio' && typeof qeClip.addVideoEffect === 'function') {
          qeClip.addVideoEffect(effect);
          if (_componentSignatureChanged(clip, before)) return true;
        }
      } catch (e) {
        warnings.push('Installed preset lookup failed for ' + names[i] + ': ' + e.toString());
      }
    }

    warnings.push('Preset was not found by name in Premiere Effects/Preset registry.');
    return false;
  }

  function _tryComponentPresetFallback(clip, file, payload, warnings) {
    if (!clip || !clip.components) return false;

    var methods = ['importPreset', 'applyPreset', 'applyEffectPreset'];
    var args = [
      [file.fsName],
      [file],
      [file.fsName, payload.presetName || payload.name || '']
    ];
    var exposedMethod = false;
    var lastError = '';

    for (var m = 0; m < methods.length; m++) {
      var method = methods[m];
      if (typeof clip.components[method] !== 'function') continue;
      exposedMethod = true;

      for (var a = 0; a < args.length; a++) {
        try {
          var before = _componentSignature(clip);
          var ret = clip.components[method].apply(clip.components, args[a]);
          if (ret !== false && _componentSignatureChanged(clip, before)) return true;
        } catch (e) {
          lastError = e.toString();
        }
      }
    }

    if (!exposedMethod) {
      warnings.push('TrackItem components do not expose a preset import/apply method in this Premiere build.');
    } else if (lastError) {
      warnings.push('Component preset fallback failed: ' + lastError);
    }

    return false;
  }

  function _applyPresetBaseEffectsFromFile(qeClip, file, payload, kind, clip, warnings) {
    var effects = _extractEffectRefsFromPresetFile(file, kind, warnings);
    if (!effects.length) return false;

    var changed = false;
    for (var i = 0; i < effects.length; i++) {
      var effectPayload = {
        name: effects[i].displayName || effects[i].matchName,
        matchName: effects[i].matchName
      };
      var effect = kind === 'audio' ? _findAudioEffect(effectPayload) : _findVideoEffect(effectPayload);
      if (!effect) {
        warnings.push('Could not resolve preset base effect: ' + effects[i].matchName);
        continue;
      }

      try {
        var before = _componentSignature(clip);
        if (kind === 'audio' && typeof qeClip.addAudioEffect === 'function') {
          qeClip.addAudioEffect(effect);
        } else if (kind !== 'audio' && typeof qeClip.addVideoEffect === 'function') {
          qeClip.addVideoEffect(effect);
        }
        if (_componentSignatureChanged(clip, before)) changed = true;
      } catch (e) {
        warnings.push('Could not add preset base effect ' + effects[i].matchName + ': ' + e.toString());
      }
    }

    if (changed) {
      warnings.push('Only the base effect(s) from the preset file were added; saved parameter values/keyframes were not applied.');
    }

    return changed;
  }

  function _extractEffectRefsFromPresetFile(file, kind, warnings) {
    var text = _readFileText(file, warnings);
    var out = [];
    var seen = {};
    if (!text) return out;

    var videoGuid = '228cda18-3625-4d2d-951e-348879e4ed93';
    var audioGuid = '80b8e3d5-6dca-4195-aefb-cb5f407ab009';
    var guid = kind === 'audio' ? audioGuid : videoGuid;
    var re = new RegExp(guid + '\\s+\\d+\\s+((?:AE|PR|BE|ADBE)\\.[\\s\\S]{2,120}?)\\s+\\d+\\s+\\1\\s+false\\s+([\\s\\S]{2,80}?)\\s+false', 'ig');
    var m;

    while ((m = re.exec(text)) !== null) {
      var matchName = _cleanPresetName(m[1]);
      var displayName = _cleanPresetName(m[2]);
      var key = matchName + '::' + displayName;

      if (_looksLikeEffectMatchName(matchName) && !seen[key]) {
        seen[key] = true;
        out.push({ matchName: matchName, displayName: displayName });
      }
      if (out.length > 50) break;
    }

    return out;
  }

  function _looksLikeEffectMatchName(value) {
    var s = _trim(value);
    if (!s || s.length > 140) return false;
    return /^(AE|PR|BE|ADBE)\./i.test(s);
  }

  function _componentSignatureChanged(clip, before) {
    try { $.sleep(90); } catch (e) {}
    return _componentSignature(clip) !== before;
  }

  function _componentSignature(clip) {
    var parts = [];
    try {
      if (!clip || !clip.components) return 'no-components';

      var comps = clip.components;
      var count = Number(comps.numItems || 0);
      parts.push('count=' + count);

      for (var i = 0; i < count; i++) {
        var comp = comps[i];
        if (!comp) continue;

        parts.push('component=' + _safeProp(comp, 'displayName') + '|' + _safeProp(comp, 'matchName'));
        var props = comp.properties;
        var propCount = props ? Number(props.numItems || props.length || 0) : 0;
        parts.push('props=' + propCount);

        for (var p = 0; p < propCount && p < 80; p++) {
          var param = props[p];
          if (!param) continue;
          parts.push('param=' + _safeProp(param, 'displayName') + ':' + _paramValueSignature(param));
        }
      }
    } catch (e) {
      parts.push('signature-error=' + e.toString());
    }
    return parts.join('\n');
  }

  function _safeProp(obj, prop) {
    try {
      if (obj && typeof obj[prop] !== 'undefined') return String(obj[prop]);
    } catch (e) {}
    return '';
  }

  function _paramValueSignature(param) {
    var out = [];
    try {
      if (param && typeof param.getValue === 'function') out.push('v=' + _simpleValue(param.getValue()));
    } catch (e1) {}
    try {
      if (param && typeof param.isTimeVarying === 'function') out.push('tv=' + param.isTimeVarying());
    } catch (e2) {}
    try {
      if (param && typeof param.getKeys === 'function') out.push('keys=' + _simpleValue(param.getKeys()));
    } catch (e3) {}
    return out.join(',');
  }

  function _simpleValue(value) {
    try {
      if (value === null || typeof value === 'undefined') return '';
      if (value instanceof Array) return '[' + value.join(',') + ']';
      if (typeof value === 'object') {
        if (typeof value.seconds !== 'undefined') return String(value.seconds);
        if (typeof value.ticks !== 'undefined') return String(value.ticks);
      }
      return String(value);
    } catch (e) {
      return '[unreadable]';
    }
  }

  function _getSelectedClipRefs(seq) {
    var refs = [];

    try {
      var vt = seq.videoTracks;
      for (var vi = 0; vi < vt.numTracks; vi++) {
        var vTrack = vt[vi];
        for (var vc = 0; vc < vTrack.clips.numItems; vc++) {
          var vClip = vTrack.clips[vc];
          if (_isClipSelected(vClip)) {
            refs.push({ clip: vClip, kind: 'video', trackIndex: vi, clipIndex: vc });
          }
        }
      }
    } catch (e1) {}

    try {
      var at = seq.audioTracks;
      for (var ai = 0; ai < at.numTracks; ai++) {
        var aTrack = at[ai];
        for (var ac = 0; ac < aTrack.clips.numItems; ac++) {
          var aClip = aTrack.clips[ac];
          if (_isClipSelected(aClip)) {
            refs.push({ clip: aClip, kind: 'audio', trackIndex: ai, clipIndex: ac });
          }
        }
      }
    } catch (e2) {}

    return refs;
  }

  function _isClipSelected(clip) {
    try {
      if (clip && typeof clip.isSelected === 'function') return clip.isSelected();
      if (clip && typeof clip.isSelected !== 'undefined') return !!clip.isSelected;
    } catch (e) {}
    return false;
  }

  function _getQEClipForRef(qeSeq, ref) {
    var track = _getQETrack(qeSeq, ref.kind, ref.trackIndex);
    if (!track) return null;

    var clip = _getQEItem(track, ref.clipIndex);
    if (clip) return clip;

    return _findQEClipByStart(qeSeq, ref);
  }

  function _getQETrack(qeSeq, kind, index) {
    try {
      if (kind === 'video' && typeof qeSeq.getVideoTrackAt === 'function') return qeSeq.getVideoTrackAt(index);
      if (kind === 'audio' && typeof qeSeq.getAudioTrackAt === 'function') return qeSeq.getAudioTrackAt(index);
    } catch (e1) {}

    try {
      var list = kind === 'video' ? qeSeq.videoTrackList : qeSeq.audioTrackList;
      if (!list) return null;
      if (typeof list.getTrackAt === 'function') return list.getTrackAt(index);
      return list[index];
    } catch (e2) {}
    return null;
  }

  function _getQEItem(track, index) {
    try {
      if (typeof track.getItemAt === 'function') return track.getItemAt(index);
      if (track[index]) return track[index];
    } catch (e) {}
    return null;
  }

  function _findQEClipByStart(qeSeq, ref) {
    try {
      var target = _clipStartSeconds(ref.clip);
      var track = _getQETrack(qeSeq, ref.kind, ref.trackIndex);
      if (!track) return null;
      var count = track.numItems || track.numClips || 0;
      for (var i = 0; i < count; i++) {
        var item = _getQEItem(track, i);
        if (item && Math.abs(_qeStartSeconds(item) - target) < 0.002) return item;
      }
    } catch (e) {}
    return null;
  }

  function _clipStartSeconds(clip) {
    try {
      if (clip.start && typeof clip.start.seconds !== 'undefined') return Number(clip.start.seconds);
    } catch (e) {}
    return 0;
  }

  function _qeStartSeconds(qeClip) {
    try {
      if (qeClip.start && typeof qeClip.start.secs !== 'undefined') return Number(qeClip.start.secs);
      if (qeClip.start && typeof qeClip.start.seconds !== 'undefined') return Number(qeClip.start.seconds);
    } catch (e) {}
    return 0;
  }

  function getSelectionInfo() {
    var result = { count: 0 };
    try {
      var seq = app.project.activeSequence;
      if (!seq) return JSON.stringify(result);
      result.count = _getSelectedClipRefs(seq).length;
    } catch (e) {}
    return JSON.stringify(result);
  }

  function keepLoaded() {
    var result = { ok: true, warnings: [] };
    try {
      if (app && typeof app.setExtensionPersistent === 'function') {
        app.setExtensionPersistent('com.ironfx.panel', 1);
      } else {
        result.warnings.push('app.setExtensionPersistent is unavailable in this host.');
      }
    } catch (e) {
      result.ok = false;
      result.warnings.push(e.toString());
    }
    return JSON.stringify(result);
  }

  return {
    getUserPresets: getUserPresets,
    applyEffect: applyEffect,
    getSelectionInfo: getSelectionInfo,
    keepLoaded: keepLoaded
  };

})();
