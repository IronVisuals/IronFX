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
    private const int HOTKEY_OPEN = 1;
    private const int HOTKEY_QUIT = 2;
    private const int HOTKEY_OPEN_BRACKET = 3;
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_CONTROL = 0x0002;
    private const uint MOD_SHIFT = 0x0004;
    private const uint VK_SPACE = 0x20;
    private const uint VK_OEM_4 = 0xDB; // [ key on US/ABNT-style keyboards.
    private const uint VK_Q = 0x51;
    private const uint SWP_NOZORDER = 0x0004;
    private const uint SWP_NOACTIVATE = 0x0010;
    private readonly int port;

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

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

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT {
      public int X;
      public int Y;
    }

    public HotkeyForm(int port) {
      this.port = port;
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
    }

    protected override void OnHandleDestroyed(EventArgs e) {
      UnregisterHotKey(Handle, HOTKEY_OPEN);
      UnregisterHotKey(Handle, HOTKEY_OPEN_BRACKET);
      UnregisterHotKey(Handle, HOTKEY_QUIT);
      base.OnHandleDestroyed(e);
    }

    protected override void WndProc(ref Message m) {
      if (m.Msg == WM_HOTKEY) {
        int id = m.WParam.ToInt32();
        if (id == HOTKEY_OPEN || id == HOTKEY_OPEN_BRACKET) {
          if (IsPremiereForeground()) {
            Task.Run(() => NotifyIronFX());
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
