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

        var parsedState = _applyParsedPresetToRef(qeClip, f, payload, ref.kind, ref.clip, warnings);
        if (parsedState === 'applied' || parsedState === 'partial') return parsedState;

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

  function _applyParsedPresetToRef(qeClip, file, payload, kind, clip, warnings) {
    var effectBlocks = _extractPresetEffectBlocks(file, payload, kind, warnings);
    if (!effectBlocks.length) return 'none';

    var before = _componentSignature(clip);
    var paramChanged = false;

    for (var i = 0; i < effectBlocks.length; i++) {
      var block = effectBlocks[i];
      var component = _ensurePresetComponent(qeClip, clip, block, kind, warnings);
      if (!component) continue;

      if (_applyPresetParamsToComponent(component, block.paramsText, clip, warnings)) {
        paramChanged = true;
      }
    }

    if (paramChanged) return 'applied';

    if (_componentSignature(clip) !== before) {
      warnings.push('The preset parser added base effect(s), but no saved parameter values/keyframes could be mapped to scriptable Premiere parameters.');
      return 'partial';
    }

    return 'none';
  }

  function _extractPresetEffectBlocks(file, payload, kind, warnings) {
    var text = _readFileText(file, warnings);
    var blockText = _findPresetTextBlock(text, payload.presetName || payload.name || _basename(file.name), kind);
    var out = [];

    if (!blockText) return out;

    var guid = kind === 'audio'
      ? '80b8e3d5-6dca-4195-aefb-cb5f407ab009'
      : '228cda18-3625-4d2d-951e-348879e4ed93';
    var effectRe = new RegExp(guid + '\\s+\\d+\\s+((?:AE|PR|BE|ADBE)\\.[\\s\\S]*?)\\s+\\d+\\s+((?:AE|PR|BE|ADBE)\\.[\\s\\S]*?)\\s+false\\s+([\\s\\S]*?)\\s+false', 'ig');
    var matches = [];
    var m;

    while ((m = effectRe.exec(blockText)) !== null) {
      var matchName = _cleanPresetName(m[1]);
      var repeatedMatchName = _cleanPresetName(m[2]);
      var displayName = _cleanPresetName(m[3]);

      if (!_looksLikeEffectMatchName(matchName)) continue;
      if (_looksLikeEffectMatchName(repeatedMatchName) && repeatedMatchName !== matchName) continue;

      matches.push({
        start: m.index,
        end: effectRe.lastIndex,
        matchName: matchName,
        displayName: displayName
      });

      if (matches.length > 80) break;
    }

    for (var i = 0; i < matches.length; i++) {
      var end = i + 1 < matches.length ? matches[i + 1].start : blockText.length;
      out.push({
        matchName: matches[i].matchName,
        displayName: matches[i].displayName,
        paramsText: blockText.substring(matches[i].end, end)
      });
    }

    return out;
  }

  function _findPresetTextBlock(text, presetName, kind) {
    if (!text) return '';

    var desired = _cleanPresetName(presetName).toLowerCase();
    var mediaGuid = '(228cda18-3625-4d2d-951e-348879e4ed93|80b8e3d5-6dca-4195-aefb-cb5f407ab009)';
    var headerRe = new RegExp('(?:^|\\s)(?:true|false)\\s+false\\s+\\d+\\s+false\\s+(.{2,140}?)\\s+false\\s+\\d+\\s+\\d+\\s+\\d+(?:\\.\\d*)?\\s+\\d{10,}\\s+\\d+\\s+' + mediaGuid, 'ig');
    var headers = [];
    var m;

    while ((m = headerRe.exec(text)) !== null) {
      var guid = String(m[2] || '').toLowerCase();
      var type = guid === '80b8e3d5-6dca-4195-aefb-cb5f407ab009' ? 'audio' : 'video';
      headers.push({
        index: m.index,
        name: _cleanPresetName(m[1]),
        type: type
      });
      if (headers.length > 5000) break;
    }

    for (var i = 0; i < headers.length; i++) {
      if (headers[i].type !== kind) continue;
      if (headers[i].name.toLowerCase() !== desired) continue;

      var next = text.length;
      for (var j = i + 1; j < headers.length; j++) {
        if (headers[j].type === kind) {
          next = headers[j].index;
          break;
        }
      }
      return text.substring(headers[i].index, next);
    }

    return '';
  }

  function _ensurePresetComponent(qeClip, clip, effectBlock, kind, warnings) {
    var existingFixed = _findExistingPresetComponent(clip, effectBlock);
    if (existingFixed && _isFixedEffectName(effectBlock.displayName, effectBlock.matchName)) {
      return existingFixed;
    }

    var beforeCount = _componentCount(clip);
    var effectPayload = {
      name: effectBlock.displayName || effectBlock.matchName,
      matchName: effectBlock.matchName
    };
    var effect = kind === 'audio' ? _findAudioEffect(effectPayload) : _findVideoEffect(effectPayload);

    if (!effect) {
      warnings.push('Could not resolve preset effect ' + effectBlock.matchName + ' (' + effectBlock.displayName + ').');
      return null;
    }

    try {
      if (kind === 'audio' && typeof qeClip.addAudioEffect === 'function') {
        qeClip.addAudioEffect(effect);
      } else if (kind !== 'audio' && typeof qeClip.addVideoEffect === 'function') {
        qeClip.addVideoEffect(effect);
      }
    } catch (e) {
      warnings.push('Could not add preset effect ' + effectBlock.matchName + ': ' + e.toString());
      return null;
    }

    try { $.sleep(80); } catch (ignore) {}

    var added = _getComponentAt(clip, beforeCount);
    if (added) return added;

    return _findExistingPresetComponent(clip, effectBlock);
  }

  function _isFixedEffectName(displayName, matchName) {
    var s = (String(displayName || '') + ' ' + String(matchName || '')).toLowerCase();
    return s.indexOf('motion') !== -1 ||
           s.indexOf('opacity') !== -1 ||
           s.indexOf('volume') !== -1 ||
           s.indexOf('time remapping') !== -1 ||
           s.indexOf('timeremapping') !== -1;
  }

  function _findExistingPresetComponent(clip, effectBlock) {
    try {
      if (!clip || !clip.components) return null;
      var count = _componentCount(clip);
      for (var i = count - 1; i >= 0; i--) {
        var component = _getComponentAt(clip, i);
        if (!component) continue;
        var matchName = _safeProp(component, 'matchName');
        var displayName = _safeProp(component, 'displayName');
        if (matchName && effectBlock.matchName && matchName === effectBlock.matchName) return component;
        if (displayName && effectBlock.displayName && displayName === effectBlock.displayName) return component;
      }
    } catch (e) {}
    return null;
  }

  function _applyPresetParamsToComponent(component, paramsText, clip, warnings) {
    var paramBlocks = _parsePresetParamBlocks(paramsText);
    var changed = false;

    for (var i = 0; i < paramBlocks.length; i++) {
      var presetParam = paramBlocks[i];
      var componentParam = _findComponentParam(component, presetParam.name);
      if (!componentParam) continue;

      if (_applyPresetParamValue(componentParam, presetParam, clip, warnings)) {
        changed = true;
      }
    }

    return changed;
  }

  function _parsePresetParamBlocks(text) {
    var out = [];
    if (!text) return out;

    var paramRe = /(\d+)\s+false\s+false\s+false\s+([\s\S]{1,90}?)\s+(\d+)\s+([\s\S]*?)(?=\s+\d+\s+false\s+false\s+false\s+[\s\S]{1,90}?\s+\d+\s+|$)/g;
    var m;

    while ((m = paramRe.exec(text)) !== null) {
      var name = _cleanPresetName(m[2]);
      if (!_looksLikePresetParamName(name)) continue;
      out.push({
        id: m[1],
        name: name,
        controlType: Number(m[3]),
        data: m[4]
      });
      if (out.length > 500) break;
    }

    return out;
  }

  function _looksLikePresetParamName(name) {
    if (!name || name.length > 90) return false;
    if (/^(true|false|null|undefined)$/i.test(name)) return false;
    if (/^-?\d+(\.\d*)?$/.test(name)) return false;
    if (/^(AE|PR|BE|ADBE)\./i.test(name)) return false;
    return true;
  }

  function _findComponentParam(component, presetName) {
    var wanted = _normalizeParamName(presetName);
    try {
      if (!component || !component.properties) return null;
      var props = component.properties;
      var count = Number(props.numItems || props.length || 0);

      for (var i = 0; i < count; i++) {
        var p = props[i];
        if (!p) continue;
        if (_normalizeParamName(_safeProp(p, 'displayName')) === wanted) return p;
      }

      for (var j = 0; j < count; j++) {
        var p2 = props[j];
        var normalized = _normalizeParamName(_safeProp(p2, 'displayName'));
        if (normalized && (normalized.indexOf(wanted) !== -1 || wanted.indexOf(normalized) !== -1)) return p2;
      }
    } catch (e) {}
    return null;
  }

  function _normalizeParamName(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function _applyPresetParamValue(param, presetParam, clip, warnings) {
    var keyframes = _extractPresetKeyframes(presetParam.data);
    var staticValue = keyframes.length ? keyframes[0].value : _extractStaticPresetValue(presetParam.data);
    if (staticValue === null || typeof staticValue === 'undefined') return false;

    try {
      if (keyframes.length > 0 && typeof param.setTimeVarying === 'function' && _paramSupportsKeyframes(param)) {
        var baseTicks = _firstPresetKeyTicks(keyframes);
        var clipStartTicks = _clipStartTicks(clip);

        param.setTimeVarying(true);
        _clearParamKeyframes(param);

        for (var i = 0; i < keyframes.length; i++) {
          var targetTicks = _offsetPresetKeyTicks(keyframes[i].ticks, baseTicks, clipStartTicks);
          var t = _timeFromTicks(targetTicks);
          try { param.addKey(t); } catch (ignoreAddKey) {}
          param.setValueAtKey(t, keyframes[i].value, 1);
          if (typeof param.setInterpolationTypeAtKey === 'function' && keyframes[i].interpolation !== null) {
            try { param.setInterpolationTypeAtKey(t, keyframes[i].interpolation, 1); } catch (ignoreInterp) {}
          }
        }
        return true;
      }

      if (_looksLikeColorParam(param, presetParam, staticValue) && staticValue instanceof Array && staticValue.length >= 3 && typeof param.setColorValue === 'function') {
        var color = _coerceColorArray(staticValue);
        param.setColorValue(color[0], color[1], color[2], color[3], 1);
        return true;
      }

      if (typeof param.setValue === 'function') {
        param.setValue(staticValue, 1);
        return true;
      }
    } catch (e) {
      warnings.push('Could not set preset parameter ' + presetParam.name + ': ' + e.toString());
    }

    return false;
  }

  function _clearParamKeyframes(param) {
    try {
      if (!param || typeof param.getKeys !== 'function' || typeof param.removeKey !== 'function') return;
      var keys = param.getKeys();
      if (!(keys instanceof Array)) return;
      for (var i = keys.length - 1; i >= 0; i--) {
        try { param.removeKey(keys[i]); } catch (ignoreRemove) {}
      }
    } catch (e) {}
  }

  function _paramSupportsKeyframes(param) {
    try {
      if (typeof param.areKeyframesSupported === 'function') return !!param.areKeyframesSupported();
    } catch (e) {}
    return false;
  }

  function _extractPresetKeyframes(data) {
    var out = [];
    var re = /(-?\d{10,}),([^,\s]+(?::[^,\s]+)*)/g;
    var m;

    while ((m = re.exec(data || '')) !== null) {
      var ticks = m[1];
      if (ticks === '-91445760000000000') continue;
      var value = _parsePresetScalarOrVector(m[2]);
      if (value === null || typeof value === 'undefined') continue;
      out.push({ ticks: ticks, value: value, interpolation: _extractInterpolationNear(data, re.lastIndex) });
      if (out.length > 200) break;
    }

    return out;
  }

  function _firstPresetKeyTicks(keyframes) {
    if (!keyframes || !keyframes.length) return null;
    return String(keyframes[0].ticks);
  }

  function _clipStartTicks(clip) {
    try {
      if (clip && clip.start && typeof clip.start.ticks !== 'undefined') return String(clip.start.ticks);
    } catch (e1) {}
    try {
      if (clip && clip.start && typeof clip.start.seconds !== 'undefined') {
        return String(Math.round(Number(clip.start.seconds) * 254016000000));
      }
    } catch (e2) {}
    return null;
  }

  function _offsetPresetKeyTicks(ticks, baseTicks, clipStartTicks) {
    if (baseTicks === null || clipStartTicks === null) return String(ticks);
    var raw = Number(ticks);
    var base = Number(baseTicks);
    var start = Number(clipStartTicks);
    if (isNaN(raw) || isNaN(base) || isNaN(start)) return String(ticks);
    return String(Math.round(start + (raw - base)));
  }

  function _extractStaticPresetValue(data) {
    var re = /-91445760000000000,([^,\s]+(?::[^,\s]+)*)/g;
    var m;
    var last = null;

    while ((m = re.exec(data || '')) !== null) {
      last = _parsePresetScalarOrVector(m[1]);
    }

    return last;
  }

  function _parsePresetScalarOrVector(value) {
    var s = String(value || '');
    if (!s) return null;

    if (s.indexOf(':') !== -1) {
      var parts = s.split(':');
      var arr = [];
      for (var i = 0; i < parts.length; i++) {
        var n = Number(parts[i]);
        if (isNaN(n)) return null;
        arr.push(n);
      }
      return arr;
    }

    if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);

    var num = Number(s);
    if (!isNaN(num)) return num;
    return null;
  }

  function _extractInterpolationNear(data, index) {
    try {
      var tail = String(data || '').substring(index, index + 80);
      var m = tail.match(/,\d+,\d+,\d+,\d+,\d+,\d+,(\d+)/);
      if (m) return Number(m[1]);
    } catch (e) {}
    return null;
  }

  function _timeFromTicks(ticks) {
    var t = new Time();
    try {
      t.ticks = String(ticks);
    } catch (e) {}
    return t;
  }

  function _looksLikeColorParam(param, presetParam, value) {
    if (!(value instanceof Array) || value.length < 3) return false;
    var s = (_safeProp(param, 'displayName') + ' ' + presetParam.name).toLowerCase();
    return s.indexOf('color') !== -1 || s.indexOf('colour') !== -1 || s.indexOf('tint') !== -1;
  }

  function _coerceColorArray(value) {
    var a = value instanceof Array ? value : [];
    var alpha = a.length > 3 ? a[3] : 255;
    var red = a.length > 0 ? a[0] : 0;
    var green = a.length > 1 ? a[1] : red;
    var blue = a.length > 2 ? a[2] : green;

    if (red <= 1 && green <= 1 && blue <= 1 && alpha <= 1) {
      alpha = Math.round(alpha * 255);
      red = Math.round(red * 255);
      green = Math.round(green * 255);
      blue = Math.round(blue * 255);
    }

    return [alpha, red, green, blue];
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

  function _componentCount(clip) {
    try {
      if (!clip || !clip.components) return 0;
      return Number(clip.components.numItems || clip.components.length || 0);
    } catch (e) {}
    return 0;
  }

  function _getComponentAt(clip, index) {
    try {
      if (!clip || !clip.components || index < 0) return null;
      return clip.components[index] || null;
    } catch (e) {}
    return null;
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

  function keepLoaded(extensionId) {
    var result = { ok: true, warnings: [] };
    var id = extensionId || 'com.ironfx.panel';
    try {
      if (app && typeof app.setExtensionPersistent === 'function') {
        app.setExtensionPersistent(id, 1);
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
