param(
  [int]$Port = 32178,
  [switch]$Quiet,
  [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$source = @"
using System;
using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace IronFX {
  public sealed class HotkeyForm : Form {
    private const int WM_HOTKEY = 0x0312;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int HOTKEY_OPEN = 1;
    private const int HOTKEY_QUIT = 2;
    private const int HOTKEY_OPEN_BRACKET = 3;
    private const int WH_KEYBOARD_LL = 13;
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_CONTROL = 0x0002;
    private const uint MOD_SHIFT = 0x0004;
    private const int VK_CONTROL = 0x11;
    private const int VK_LCONTROL = 0xA2;
    private const int VK_RCONTROL = 0xA3;
    private const uint VK_SPACE = 0x20;
    private const uint VK_OEM_4 = 0xDB; // [ key on US/ABNT-style keyboards.
    private const uint VK_Q = 0x51;
    private const uint SWP_NOZORDER = 0x0004;
    private const uint SWP_NOACTIVATE = 0x0010;
    private readonly int port;

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    private readonly LowLevelKeyboardProc keyboardProc;
    private IntPtr keyboardHook = IntPtr.Zero;
    private long lastNotifyTicks = 0;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT point);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT {
      public int X;
      public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT {
      public uint vkCode;
      public uint scanCode;
      public uint flags;
      public uint time;
      public IntPtr dwExtraInfo;
    }

    public HotkeyForm(int port) {
      this.port = port;
      keyboardProc = HookCallback;
      ShowInTaskbar = false;
      WindowState = FormWindowState.Minimized;
      FormBorderStyle = FormBorderStyle.FixedToolWindow;
      Opacity = 0;
    }

    protected override void SetVisibleCore(bool value) {
      base.SetVisibleCore(false);
    }

    protected override void OnHandleCreated(EventArgs e) {
      base.OnHandleCreated(e);
      if (!RegisterHotKey(Handle, HOTKEY_OPEN, MOD_CONTROL, VK_SPACE)) {
        Console.WriteLine("Could not register Ctrl+Space. Another app may already own that hotkey.");
      }
      if (!RegisterHotKey(Handle, HOTKEY_OPEN_BRACKET, MOD_CONTROL, VK_OEM_4)) {
        Console.WriteLine("Could not register Ctrl+[. Another app may already own that hotkey.");
      }
      if (!RegisterHotKey(Handle, HOTKEY_QUIT, MOD_CONTROL | MOD_ALT | MOD_SHIFT, VK_Q)) {
        Console.WriteLine("Could not register Ctrl+Alt+Shift+Q stop shortcut.");
      }
      InstallKeyboardHook();
    }

    protected override void OnHandleDestroyed(EventArgs e) {
      UnregisterHotKey(Handle, HOTKEY_OPEN);
      UnregisterHotKey(Handle, HOTKEY_OPEN_BRACKET);
      UnregisterHotKey(Handle, HOTKEY_QUIT);
      if (keyboardHook != IntPtr.Zero) {
        UnhookWindowsHookEx(keyboardHook);
        keyboardHook = IntPtr.Zero;
      }
      base.OnHandleDestroyed(e);
    }

    protected override void WndProc(ref Message m) {
      if (m.Msg == WM_HOTKEY) {
        int id = m.WParam.ToInt32();
        if (id == HOTKEY_OPEN || id == HOTKEY_OPEN_BRACKET) {
          if (IsPremiereForeground()) {
            NotifyIronFXDebounced();
          }
          return;
        }
        if (id == HOTKEY_QUIT) {
          Close();
          return;
        }
      }
      base.WndProc(ref m);
    }

    private void InstallKeyboardHook() {
      try {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
          keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, keyboardProc, GetModuleHandle(curModule.ModuleName), 0);
        }
        if (keyboardHook == IntPtr.Zero) {
          Console.WriteLine("Could not install keyboard hook fallback.");
        }
      } catch {
        Console.WriteLine("Could not install keyboard hook fallback.");
      }
    }

    private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
      if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN)) {
        KBDLLHOOKSTRUCT keyData = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
        bool ctrlDown = IsKeyDown(VK_CONTROL) || IsKeyDown(VK_LCONTROL) || IsKeyDown(VK_RCONTROL);
        bool shouldOpen = ctrlDown && (keyData.vkCode == VK_SPACE || keyData.vkCode == VK_OEM_4);

        if (shouldOpen && IsPremiereForeground()) {
          NotifyIronFXDebounced();
          return (IntPtr)1;
        }
      }

      return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
    }

    private bool IsKeyDown(int key) {
      return (GetAsyncKeyState(key) & 0x8000) != 0;
    }

    private void NotifyIronFXDebounced() {
      long now = DateTime.UtcNow.Ticks;
      if (now - lastNotifyTicks < TimeSpan.FromMilliseconds(350).Ticks) return;
      lastNotifyTicks = now;
      Task.Run(() => NotifyIronFX());
    }

    private bool IsPremiereForeground() {
      try {
        uint pid;
        GetWindowThreadProcessId(GetForegroundWindow(), out pid);
        if (pid == 0) return false;
        Process proc = Process.GetProcessById((int)pid);
        string name = (proc.ProcessName ?? "").ToLowerInvariant();
        return name.Contains("adobe premiere");
      } catch {
        return false;
      }
    }

    private void NotifyIronFX() {
      try {
        string url = "http://127.0.0.1:" + port + "/open";
        HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
        request.Method = "POST";
        request.Timeout = 700;
        request.ReadWriteTimeout = 700;
        using (HttpWebResponse response = (HttpWebResponse)request.GetResponse()) {}
        Task.Run(() => MoveIronFXWindowNearCursor());
      } catch {
      }
    }

    private void MoveIronFXWindowNearCursor() {
      for (int attempt = 0; attempt < 12; attempt++) {
        try {
          System.Threading.Thread.Sleep(90);
          IntPtr ironFxWindow = FindIronFXWindow();
          if (ironFxWindow != IntPtr.Zero) {
            MoveWindowToCursor(ironFxWindow);
            return;
          }
        } catch {
        }
      }
    }

    private IntPtr FindIronFXWindow() {
      IntPtr found = IntPtr.Zero;
      EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
        if (found != IntPtr.Zero) return false;
        if (!IsWindowVisible(hWnd)) return true;

        int length = GetWindowTextLength(hWnd);
        if (length <= 0 || length > 512) return true;

        StringBuilder title = new StringBuilder(length + 1);
        GetWindowText(hWnd, title, title.Capacity);
        string text = title.ToString();
        if (text.IndexOf("IronFX", StringComparison.OrdinalIgnoreCase) >= 0) {
          found = hWnd;
          return false;
        }
        return true;
      }, IntPtr.Zero);
      return found;
    }

    private void MoveWindowToCursor(IntPtr hWnd) {
      POINT point;
      if (!GetCursorPos(out point)) return;

      int width = 560;
      int height = 440;
      int x = point.X + 14;
      int y = point.Y + 14;
      Screen screen = Screen.FromPoint(new System.Drawing.Point(point.X, point.Y));
      System.Drawing.Rectangle area = screen.WorkingArea;

      if (x + width > area.Right) x = Math.Max(area.Left, point.X - width - 14);
      if (y + height > area.Bottom) y = Math.Max(area.Top, point.Y - height - 14);

      SetWindowPos(hWnd, IntPtr.Zero, x, y, width, height, SWP_NOZORDER | SWP_NOACTIVATE);
    }
  }

  public static class HotkeyRunner {
    [STAThread]
    public static void Run(int port) {
      Application.EnableVisualStyles();
      Application.SetCompatibleTextRenderingDefault(false);
      Application.Run(new HotkeyForm(port));
    }
  }
}
"@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Net

if ($ValidateOnly) {
  if (-not $Quiet) {
    Write-Host "IronFX hotkey helper validation passed."
  }
  return
}

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Global\IronFXHotkeyHelper", [ref]$createdNew)
if (-not $createdNew) {
  if (-not $Quiet) {
    Write-Host "IronFX hotkey helper is already running."
  }
  return
}

try {
  if (-not $Quiet) {
    Write-Host "IronFX hotkey helper is running."
    Write-Host "Ctrl+Space or Ctrl+[ opens IronFX while Premiere Pro is foreground and a timeline clip is selected."
    Write-Host "Ctrl+Alt+Shift+Q stops this helper. Keep this window open, or launch it at Windows startup."
  }

  [IronFX.HotkeyRunner]::Run($Port)
} finally {
  try { $mutex.ReleaseMutex() } catch {}
  try { $mutex.Dispose() } catch {}
}
