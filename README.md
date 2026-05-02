# IronFX

Fast effects & preset search panel for Adobe Premiere Pro — inspired by FX Console, built as a high-performance alternative to Excalibur / Dagger.

## Features

- Instant fuzzy search across all native Premiere Pro video & audio effects (~160 built-in)
- Automatic scanning of all **user presets** (`.prfpset` / `.prpreset`) at startup
- Apply effects or presets to selected clip(s) with a single `Enter` or click
- Full **undo group** support — one `Ctrl+Z` undoes the entire application
- Live clip-selection indicator in the footer
- Keyboard navigation: `↑` `↓` to move, `Esc` to clear, `Enter` to apply
- Re-index button `↻` to re-scan presets without restarting Premiere

---

## Requirements

| Requirement | Version |
|---|---|
| Adobe Premiere Pro | 2022 (v22) or later |
| CEP runtime | 10.0 (bundled with Premiere 2022+) |
| OS | Windows 10/11 or macOS 12+ |

---

## Installation

### Step 1 — Allow unsigned extensions (one-time)

**Windows**
```
reg add "HKCU\Software\Adobe\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f
```

**macOS**
```
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
```

Restart Premiere Pro after running this command.

### Step 2 — Link the extension folder

Clone or download this repo, then create a symlink so Premiere picks it up:

**Windows (run as Administrator in the IronFX folder)**
```
npm run link:win
```
or manually:
```
mklink /J "%APPDATA%\Adobe\CEP\extensions\com.ironfx.plugin" "%CD%"
```

**macOS**
```
npm run link:mac
```

### Step 3 — Open the panel in Premiere Pro

Restart Premiere Pro, then go to:

**Window → Extensions → IronFX**

The panel will open and immediately index all effects + your user presets.

---

## Keyboard Shortcut Setup (Focus Stealing)

CEP extensions cannot register global hotkeys on their own — you assign the shortcut inside Premiere:

1. Open **Edit → Keyboard Shortcuts…** (or `Alt+Shift+\`)
2. Search for **IronFX** in the command list
3. Assign any shortcut — e.g. **Ctrl+Space**
4. Click **OK**

Now pressing that shortcut from anywhere inside Premiere (Timeline, Program Monitor, etc.) will focus the IronFX panel and automatically move the cursor to the search bar, ready to type.

---

## User Presets Location

IronFX scans the following folder at startup:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Adobe\Premiere Pro\<version>\Effect Presets and Custom Items\` |
| macOS | `~/Library/Application Support/Adobe/Premiere Pro/<version>/Effect Presets and Custom Items/` |

Sub-folders become the **category** label shown under each preset in the results list. Add or remove presets and click the **↻** button to re-index without restarting.

---

## Remote Debugging

A `.debug` file is included. To inspect the panel in Chrome DevTools:

1. Open Premiere Pro with the panel visible
2. Navigate to `http://localhost:8099` in Chrome
3. Click **Inspect** next to the IronFX panel

---

## Architecture

```
IronFX/
├── CSXS/manifest.xml     CEP bundle definition (host: PPRO ≥ 22.0, CEP 10)
├── index.html            Panel shell
├── css/style.css         Dark theme matching Premiere's UI
├── js/
│   ├── CSInterface.js    Adobe CEP native bridge wrapper
│   ├── effects-db.js     Built-in effects list + EffectsSearch (fuzzy engine)
│   └── main.js           Panel controller — search, navigation, apply
└── jsx/IronFX.jsx        ExtendScript host — preset scan, effect apply, undo group
```

### Effect Application Flow

1. User types → `EffectsSearch.search()` runs synchronously in-memory → renders results
2. User hits `Enter` → `main.js` calls `cs.evalScript('IronFX.applyEffect(...)')`
3. JSX: `app.beginUndoGroup()` → `clip.components.addComponent(matchName)` → `app.endUndoGroup()`
4. For presets: `qeClip.applyPreset(path)` via QE DOM, with a `components.importPreset()` fallback
5. Result JSON returned to `main.js` → status bar updated

### Preset Application Notes

Premiere Pro does not expose a public API for applying `.prfpset` files. IronFX uses two strategies:

1. **QE DOM** (`qe.project.getActiveSequence()` → `qeClip.applyPreset(path)`) — works in PP 2020+
2. **`components.importPreset(file)`** — official API available in some versions

If both fail for a given preset, the result will report 0 clips affected and show an error in the status bar.

---

## License

MIT © IronVisuals
