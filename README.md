# IronFX - fixed build

Fast effects and preset search panel for Adobe Premiere Pro 2026. This package keeps your uploaded CEP project structure and fixes the broken apply path, preset scanning and shortcut/settings UI.

## What changed in this build

- Fixed native effect application by using QE DOM correctly: `qe.project.getVideoEffectByName()` / `getAudioEffectByName()` + `qeClip.addVideoEffect()` / `addAudioEffect()`.
- Removed the hard dependency on `app.beginUndoGroup()` so Premiere does not fail before applying the effect when the CEP host does not expose that function.
- Reworked selected clip detection so each selected clip keeps its track index and clip index, which makes QE clip matching much more reliable.
- Added a settings screen inside the panel.
- Added configurable IronFX shortcut in the settings screen. The shortcut is stored in `localStorage` and works while the panel has keyboard focus.
- Added a second CEP entry, `IronFX Popup`, used by the local hotkey bridge to open a modeless IronFX search window.
- Added a Windows external hotkey helper (`tools/IronFXHotkey.ps1`) that registers `Ctrl+Space` / `Ctrl+[` outside Premiere and asks the IronFX panel to open the popup through a local bridge.
- The IronFX panel now attempts to start the Windows hotkey helper automatically when the panel loads.
- Added extra preset folder selection from the settings screen.
- Reworked preset scanning to search Premiere profile folders recursively, including `Profile-*` folders and `.prfpset` / `.prpreset` files.
- Added parser logic to extract multiple preset names from a single `.prfpset` file instead of only showing the file name.
- Added fallback preset application paths for manually added presets: QE preset-by-file, installed preset lookup by name, and component-level preset methods when exposed by the host.
- Preset application now verifies that the selected clip actually changed before reporting success. Calls that return without modifying Effect Controls are treated as failures.
- Hardened result rendering with HTML escaping for preset names read from local files.
- Updated CEP manifest target to Premiere Pro 2026+ / CSXS 11.

## Important reality check

This fixed package is still a CEP extension because the uploaded project is CEP. CEP can repair the current plugin and can use ExtendScript/QE fallbacks, but it cannot silently install a Premiere-wide global shortcut from inside the panel.

Premiere does not reliably expose CEP extension commands inside Keyboard Shortcuts. For the FX Console-style workflow, this build exposes a local bridge instead:

- `IronFX`: the dockable panel and local bridge host.
- `IronFX Popup`: a modeless popup using the same UI.
- `tools/IronFXHotkey.ps1`: Windows global hotkey helper.

Open `IronFX` once from `Window -> Extensions`. The panel will try to start the helper automatically. If you want to start it manually, use:

```bat
tools\StartIronFXHotkey.cmd
```

While the helper is running, `Ctrl+Space` or `Ctrl+[` opens IronFX when Premiere is foreground and a timeline clip is selected. `Ctrl+Alt+Shift+Q` stops the helper until IronFX/Premiere is restarted. The in-panel shortcut setting still works when IronFX itself has keyboard focus.

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

## Windows global hotkey helper

The helper does not automate Premiere's Keyboard Shortcuts window. It registers a Windows-level hotkey and sends a local request to the IronFX CEP panel:

```text
Ctrl+Space / Ctrl+[ -> tools/IronFXHotkey.ps1 -> http://127.0.0.1:32178/open -> IronFX Popup
```

Requirements:

- Open the `IronFX` panel once after Premiere starts so the local bridge is running.
- The helper is auto-started by the panel on Windows; `tools\StartIronFXHotkey.cmd` remains available as a manual fallback.
- The helper only responds when the foreground process is Adobe Premiere Pro.
- The helper tries to move the IronFX window near the mouse cursor after opening. Premiere does not expose the selected clip's screen coordinates to CEP, so exact placement over the selected timeline clip is not guaranteed.

## Applying effects

1. Select one or more clips in the active timeline.
2. Open `IronFX` or trigger the `IronFX Popup` shortcut.
3. Type an effect or preset name.
4. Press `Enter` or click the result.

The fixed application flow is:

```text
main.js -> IronFX.applyEffect(payload) -> selected clip refs -> QE active sequence -> matching QE clip -> addVideoEffect/addAudioEffect or preset apply
```

For manual presets, IronFX now tries multiple host paths:

```text
installed preset lookup by name -> QE applyPreset/addPreset by file -> component preset fallback
```

If Premiere accepts a preset call but the selected clip does not change, IronFX no longer reports success. It may add the preset's base effect as a partial fallback, but it will warn that saved settings/keyframes were not applied.

Custom presets are only fully reliable when Premiere exposes them through its own QE effect registry. Adobe does not provide a supported ExtendScript/CEP API for directly applying arbitrary `.prfpset` files with saved keyframes.

## Known limitations

- CEP cannot programmatically install a true global Premiere shortcut; use the Windows helper for `Ctrl+Space`.
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
