# IronFX - fixed build

Fast effects and preset search panel for Adobe Premiere Pro 2026. This package keeps your uploaded CEP project structure and fixes the broken apply path, preset scanning and shortcut/settings UI.

## What changed in this build

- Fixed native effect application by using QE DOM correctly: `qe.project.getVideoEffectByName()` / `getAudioEffectByName()` + `qeClip.addVideoEffect()` / `addAudioEffect()`.
- Removed the hard dependency on `app.beginUndoGroup()` so Premiere does not fail before applying the effect when the CEP host does not expose that function.
- Reworked selected clip detection so each selected clip keeps its track index and clip index, which makes QE clip matching much more reliable.
- Added a settings screen inside the panel.
- Added configurable IronFX shortcut in the settings screen. The shortcut is stored in `localStorage` and works while the panel has keyboard focus.
- Added extra preset folder selection from the settings screen.
- Reworked preset scanning to search Premiere profile folders recursively, including `Profile-*` folders and `.prfpset` / `.prpreset` files.
- Added parser logic to extract multiple preset names from a single `.prfpset` file instead of only showing the file name.
- Hardened result rendering with HTML escaping for preset names read from local files.
- Updated CEP manifest target to Premiere Pro 2026+ / CSXS 11.

## Important reality check

This fixed package is still a CEP extension because the uploaded project is CEP. CEP can repair the current plugin and can use ExtendScript/QE fallbacks, but it cannot truly register a Premiere-wide global shortcut from inside the panel. The shortcut setting implemented here is the in-panel shortcut. For a real application-level hotkey when Timeline or Program Monitor has focus, use Premiere Keyboard Shortcuts to open/focus the extension or add a native helper/UXP hybrid bridge.

For a fully UXP-first IronFX, the native effect list should be generated through Premiere UXP `VideoFilterFactory.getDisplayNames()` / `getMatchNames()` and the audio factory equivalent, not a static CEP database.

## Requirements

| Requirement | Version |
|---|---|
| Adobe Premiere Pro | 2026 / v25+ |
| CEP runtime | CSXS 11 |
| OS | Windows 10/11 or macOS |

## Installation

### Windows: allow unsigned CEP extensions

Run once in Command Prompt or Git Bash:

```bat
reg add "HKCU\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f
```

Restart Premiere Pro.

### macOS: allow unsigned CEP extensions

```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
```

Restart Premiere Pro.

### Link the extension folder

Windows, from the IronFX project folder:

```bat
mklink /J "%APPDATA%\Adobe\CEP\extensions\com.ironfx.plugin" "%CD%"
```

macOS:

```bash
ln -sf "$(pwd)" "$HOME/Library/Application Support/Adobe/CEP/extensions/com.ironfx.plugin"
```

Then open Premiere Pro and use:

```text
Window -> Extensions -> IronFX
```

## Using the settings screen

Open the gear icon in the IronFX header.

You can configure:

- Popup shortcut, default `Ctrl+Space`.
- Extra preset folders.
- Save and reindex.

The extra folders are added to the automatic scan. IronFX already scans the common Premiere profile locations under:

```text
%APPDATA%\Adobe\Premiere Pro\...
%USERPROFILE%\Documents\Adobe\Premiere Pro\...
~/Library/Application Support/Adobe/Premiere Pro/...
~/Documents/Adobe/Premiere Pro/...
```

## Applying effects

1. Select one or more clips in the active timeline.
2. Type an effect or preset name.
3. Press `Enter` or click the result.

The fixed application flow is:

```text
main.js -> IronFX.applyEffect(payload) -> selected clip refs -> QE active sequence -> matching QE clip -> addVideoEffect/addAudioEffect or preset apply
```

## Known limitations

- CEP cannot programmatically install a true global Premiere shortcut.
- Preset files can store multiple presets in one `.prfpset`. IronFX indexes names from the file, but Premiere's private preset application behavior may still depend on what QE exposes in your installed Premiere build.
- Some third-party effects may use names that differ from their display names. Add them to `js/effects-db.js` or move the project to a UXP-native indexer for full host-provided discovery.

## Project structure

```text
com.ironfx.plugin/
├── CSXS/manifest.xml
├── index.html
├── css/style.css
├── js/
│   ├── CSInterface.js
│   ├── effects-db.js
│   └── main.js
└── jsx/IronFX.jsx
```
