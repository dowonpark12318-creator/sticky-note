[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Prepare', 'Capture', 'Restore')]
    [string]$Action,
    [Parameter(Mandatory = $true)]
    [string]$StatePath,
    [string]$OutputPath,
    [string]$AllowedProcessIds = '',
    [string]$AllowedWindowHandles = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

if ($env:OS -ne 'Windows_NT') {
    throw 'Store screenshots require an interactive Windows desktop.'
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace CornerNoteStoreCapture {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DevMode {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
        public ushort dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
        public uint dmFields;
        public int dmPositionX, dmPositionY;
        public uint dmDisplayOrientation, dmDisplayFixedOutput;
        public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
        public ushort dmLogPixels;
        public uint dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
        public uint dmICMMethod, dmICMIntent, dmMediaType, dmDitherType;
        public uint dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
    }

    public sealed class DisplayMode {
        public uint Width { get; set; }
        public uint Height { get; set; }
        public uint BitsPerPixel { get; set; }
        public uint Frequency { get; set; }
        public string NativeMode { get; set; }
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct CursorPoint { public int X, Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct WindowRect { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    public struct WindowPlacement {
        public uint Length, Flags, ShowCommand;
        public CursorPoint MinimumPosition, MaximumPosition;
        public WindowRect NormalPosition;
    }

    public sealed class SavedWindow {
        public string Handle { get; set; }
        public uint ProcessId { get; set; }
        public string Placement { get; set; }
    }

    public static class NativeDesktop {
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool EnumDisplaySettings(string deviceName, int modeNumber, ref DevMode mode);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int ChangeDisplaySettingsEx(string deviceName, ref DevMode mode,
            IntPtr window, uint flags, IntPtr parameter);
        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int index);
        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetCursorPos(out CursorPoint point);
        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetCursorPos(int x, int y);
        private delegate bool EnumWindowsCallback(IntPtr window, IntPtr parameter);
        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr parameter);
        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsWindow(IntPtr window);
        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsWindowVisible(IntPtr window);
        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsIconic(IntPtr window);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowTextLength(IntPtr window);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetClassName(IntPtr window, StringBuilder value, int count);
        [DllImport("user32.dll")]
        private static extern IntPtr GetDesktopWindow();
        [DllImport("user32.dll")]
        private static extern IntPtr GetShellWindow();
        [DllImport("user32.dll")]
        private static extern IntPtr GetWindow(IntPtr window, uint command);
        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
        private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetWindowPlacement(IntPtr window, ref WindowPlacement placement);
        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetWindowPlacement(IntPtr window, ref WindowPlacement placement);
        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ShowWindowAsync(IntPtr window, int command);

        public static void UsePhysicalPixels() {
            // A thread context also works when powershell.exe already set a
            // process DPI mode. No system/user DPI preference is changed.
            IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
            if (previous == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(),
                "Could not use physical Windows desktop pixels for Store screenshots.");
        }

        private static DevMode NewMode() {
            DevMode mode = new DevMode();
            mode.dmSize = (ushort)Marshal.SizeOf(typeof(DevMode));
            return mode;
        }

        private static string Serialize(DevMode mode) {
            int size = Marshal.SizeOf(typeof(DevMode));
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try {
                Marshal.StructureToPtr(mode, buffer, false);
                byte[] bytes = new byte[size];
                Marshal.Copy(buffer, bytes, 0, size);
                return Convert.ToBase64String(bytes);
            } finally { Marshal.FreeHGlobal(buffer); }
        }

        private static DevMode Deserialize(string serialized) {
            byte[] bytes = Convert.FromBase64String(serialized);
            int size = Marshal.SizeOf(typeof(DevMode));
            if (bytes.Length != size) throw new InvalidOperationException("Invalid saved Windows display mode.");
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try {
                Marshal.Copy(bytes, 0, buffer, size);
                return (DevMode)Marshal.PtrToStructure(buffer, typeof(DevMode));
            } finally { Marshal.FreeHGlobal(buffer); }
        }

        private static DisplayMode Describe(DevMode mode) {
            // Only the fixed DEVMODE bytes are saved. No driver-private buffer
            // is supplied or changed by this capture helper.
            mode.dmDriverExtra = 0;
            return new DisplayMode { Width = mode.dmPelsWidth, Height = mode.dmPelsHeight,
                BitsPerPixel = mode.dmBitsPerPel, Frequency = mode.dmDisplayFrequency,
                NativeMode = Serialize(mode) };
        }

        public static DisplayMode CurrentMode() {
            DevMode mode = NewMode();
            if (!EnumDisplaySettings(null, -1, ref mode)) throw new Win32Exception(Marshal.GetLastWin32Error(),
                "Could not inspect the current primary desktop mode.");
            return Describe(mode);
        }

        public static DisplayMode[] AvailableModes() {
            List<DisplayMode> modes = new List<DisplayMode>();
            for (int index = 0; ; index++) {
                DevMode mode = NewMode();
                if (!EnumDisplaySettings(null, index, ref mode)) break;
                modes.Add(Describe(mode));
            }
            return modes.ToArray();
        }

        public static void ApplyAdvertisedMode(string serialized) {
            DevMode mode = Deserialize(serialized);
            // Only mode data returned by EnumDisplaySettings reaches this
            // method. CDS_TEST first checks it, and flags=0 does not write the
            // user's registry/display configuration.
            mode.dmFields = 0x00040000 | 0x00080000 | 0x00100000;
            if (mode.dmDisplayFrequency > 1) mode.dmFields |= 0x00400000;
            int test = ChangeDisplaySettingsEx(null, ref mode, IntPtr.Zero, 2, IntPtr.Zero);
            if (test != 0) throw new InvalidOperationException("Windows rejected the advertised capture display mode (test result " + test + ").");
            int result = ChangeDisplaySettingsEx(null, ref mode, IntPtr.Zero, 0, IntPtr.Zero);
            if (result != 0) throw new InvalidOperationException("Windows could not apply the capture display mode (result " + result + ").");
        }

        public static int PhysicalWidth() { return GetSystemMetrics(0); }
        public static int PhysicalHeight() { return GetSystemMetrics(1); }
        public static CursorPoint Cursor() {
            CursorPoint point;
            if (!GetCursorPos(out point)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not inspect the desktop cursor.");
            return point;
        }
        public static void MoveCursor(int x, int y) {
            if (!SetCursorPos(x, y)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not move the desktop cursor for capture.");
        }

        private static bool IsApplicationWindow(IntPtr window) {
            if (!IsWindowVisible(window) || IsIconic(window) || window == GetDesktopWindow() || window == GetShellWindow()) return false;
            // Hide application surfaces, never the desktop/taskbar, owned
            // menus, notification tool windows, or shell infrastructure.
            StringBuilder className = new StringBuilder(256);
            GetClassName(window, className, className.Capacity);
            string name = className.ToString();
            if (name == "Progman" || name == "WorkerW" || name == "Shell_TrayWnd" ||
                name == "Shell_SecondaryTrayWnd" || name == "NotifyIconOverflowWindow" ||
                name == "XamlExplorerHostIslandWindow") return false;
            // Owned dialogs can lack a minimize button, and must not be
            // mistaken for the owned menus/tool windows excluded above.
            bool dialog = name == "#32770";
            if (!dialog && (GetWindow(window, 4) != IntPtr.Zero || (GetWindowLongPtr(window, -20).ToInt64() & 0x80) != 0)) return false;
            return dialog || GetWindowTextLength(window) > 0;
        }

        private static string SavePlacement(WindowPlacement placement) {
            int size = Marshal.SizeOf(typeof(WindowPlacement));
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try {
                Marshal.StructureToPtr(placement, buffer, false);
                byte[] bytes = new byte[size];
                Marshal.Copy(buffer, bytes, 0, size);
                return Convert.ToBase64String(bytes);
            } finally { Marshal.FreeHGlobal(buffer); }
        }

        public static SavedWindow[] ForeignApplicationWindows(uint[] allowedProcessIds) {
            HashSet<uint> allowed = new HashSet<uint>(allowedProcessIds ?? new uint[0]);
            List<SavedWindow> windows = new List<SavedWindow>();
            EnumWindows(delegate(IntPtr window, IntPtr parameter) {
                if (!IsApplicationWindow(window)) return true;
                uint processId;
                GetWindowThreadProcessId(window, out processId);
                if (allowed.Contains(processId)) return true;
                WindowPlacement placement = new WindowPlacement();
                placement.Length = (uint)Marshal.SizeOf(typeof(WindowPlacement));
                if (!GetWindowPlacement(window, ref placement)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not save an unrelated application's window placement.");
                windows.Add(new SavedWindow { Handle = window.ToInt64().ToString(), ProcessId = processId, Placement = SavePlacement(placement) });
                return true;
            }, IntPtr.Zero);
            return windows.ToArray();
        }

        public static string WindowDiagnostics(string handle) {
            IntPtr window = new IntPtr(Int64.Parse(handle));
            bool exists = IsWindow(window);
            uint processId = 0;
            StringBuilder className = new StringBuilder(256);
            if (exists) {
                GetWindowThreadProcessId(window, out processId);
                GetClassName(window, className, className.Capacity);
            }
            // Never inspect or include a title, note text, or host console log.
            return "HWND=" + handle + " PID=" + processId + " class=" + className +
                " exists=" + exists + " visible=" + (exists && IsWindowVisible(window)) +
                " minimized=" + (exists && IsIconic(window));
        }

        public static uint[] ProcessIdsForWindows(string[] handles) {
            HashSet<uint> ids = new HashSet<uint>();
            foreach (string handle in handles) {
                IntPtr window = new IntPtr(Int64.Parse(handle));
                uint processId;
                if (!IsWindow(window) || GetWindowThreadProcessId(window, out processId) == 0) {
                    throw new InvalidOperationException("The expected Corner Note native window is invalid: " + WindowDiagnostics(handle));
                }
                ids.Add(processId);
            }
            uint[] result = new uint[ids.Count];
            ids.CopyTo(result);
            return result;
        }

        public static int VisibleExpectedWindowCount(string[] handles) {
            int count = 0;
            foreach (string handle in handles) {
                IntPtr window = new IntPtr(Int64.Parse(handle));
                // Frameless Electron windows need not have a native caption.
                if (IsWindow(window) && IsWindowVisible(window) && !IsIconic(window)) count++;
            }
            return count;
        }

        private static IntPtr SameWindow(string handle, uint expectedProcessId) {
            IntPtr window = new IntPtr(Int64.Parse(handle));
            if (!IsWindow(window)) return IntPtr.Zero;
            uint processId;
            GetWindowThreadProcessId(window, out processId);
            return processId == expectedProcessId ? window : IntPtr.Zero;
        }

        public static void MinimizeApplication(string handle, uint expectedProcessId) {
            IntPtr window = SameWindow(handle, expectedProcessId);
            if (window != IntPtr.Zero && IsWindowVisible(window)) ShowWindowAsync(window, 0);
        }

        public static void RestoreApplication(string handle, uint expectedProcessId, string serialized) {
            IntPtr window = SameWindow(handle, expectedProcessId);
            if (window == IntPtr.Zero) return; // A closed window is not recreated.
            byte[] bytes = Convert.FromBase64String(serialized);
            int size = Marshal.SizeOf(typeof(WindowPlacement));
            if (bytes.Length != size) throw new InvalidOperationException("Invalid saved application window placement.");
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try {
                Marshal.Copy(bytes, 0, buffer, size);
                WindowPlacement placement = (WindowPlacement)Marshal.PtrToStructure(buffer, typeof(WindowPlacement));
                if (!SetWindowPlacement(window, ref placement)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not restore an unrelated application's original window placement.");
            } finally { Marshal.FreeHGlobal(buffer); }
        }
    }
}
'@

[CornerNoteStoreCapture.NativeDesktop]::UsePhysicalPixels()
$resolvedState = [IO.Path]::GetFullPath($StatePath)
$allowedIds = [uint32[]]@()
if ($AllowedProcessIds) {
    if ($AllowedProcessIds -notmatch '^\d+(,\d+)*$') { throw 'Allowed capture process IDs must be comma-separated Windows process IDs.' }
    $allowedIds = [uint32[]]@($AllowedProcessIds.Split(',') | ForEach-Object { [uint32]$_ })
}
$allowedHandles = [string[]]@()
if ($AllowedWindowHandles) {
    if ($AllowedWindowHandles -notmatch '^\d+(,\d+)*$') { throw 'Allowed capture window handles must be comma-separated native HWND values.' }
    $allowedHandles = [string[]]@($AllowedWindowHandles.Split(','))
}

function Save-CaptureState($State) {
    $State | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedState -Encoding utf8
}

function Restore-ApplicationWindows($State) {
    $failures = [Collections.Generic.List[string]]::new()
    if ($State.PSObject.Properties.Name -contains 'minimizedWindows' -or $State -is [Collections.IDictionary]) {
        foreach ($window in @($State.minimizedWindows)) {
            try { [CornerNoteStoreCapture.NativeDesktop]::RestoreApplication($window.Handle, [uint32]$window.ProcessId, $window.Placement) }
            catch { $failures.Add($_.Exception.Message) }
        }
    }
    if ($failures.Count -gt 0) { throw ($failures -join [Environment]::NewLine) }
}

function Minimize-ForeignApplications($State, [uint32[]]$AllowedIds) {
    $foreign = @([CornerNoteStoreCapture.NativeDesktop]::ForeignApplicationWindows($AllowedIds))
    $saved = @($State.minimizedWindows)
    foreach ($window in $foreign) {
        if (@($saved | Where-Object { $_.Handle -eq $window.Handle -and $_.ProcessId -eq $window.ProcessId }).Count -eq 0) {
            $saved += $window
            $State.minimizedWindows = @($saved)
            # Persist the original placement before issuing SW_HIDE, including dialogs.
            Save-CaptureState $State
        }
        [CornerNoteStoreCapture.NativeDesktop]::MinimizeApplication($window.Handle, [uint32]$window.ProcessId)
    }
    if ($foreign.Count -gt 0) { Start-Sleep -Milliseconds 250 }
    $remaining = @([CornerNoteStoreCapture.NativeDesktop]::ForeignApplicationWindows($AllowedIds))
    if ($remaining.Count -gt 0) {
        $diagnostics = (@($remaining | ForEach-Object { [CornerNoteStoreCapture.NativeDesktop]::WindowDiagnostics($_.Handle) }) -join '; ')
        throw "An unrelated application remains visible after hiding. Refusing to capture other applications: $diagnostics"
    }
    return $saved.Count
}

function Get-DesktopInfo {
    $mode = [CornerNoteStoreCapture.NativeDesktop]::CurrentMode()
    $bounds = [Windows.Forms.Screen]::PrimaryScreen.Bounds
    $width = [CornerNoteStoreCapture.NativeDesktop]::PhysicalWidth()
    $height = [CornerNoteStoreCapture.NativeDesktop]::PhysicalHeight()
    if ($width -ne $mode.Width -or $height -ne $mode.Height -or
        $bounds.Width -ne $width -or $bounds.Height -ne $height -or $bounds.X -ne 0 -or $bounds.Y -ne 0) {
        throw "Windows physical desktop dimensions do not agree (mode $($mode.Width)x$($mode.Height), metrics ${width}x${height}, screen $($bounds.Width)x$($bounds.Height))."
    }
    return [ordered]@{
        x = 0; y = 0; width = $width; height = $height
        method = 'Windows primary desktop; System.Drawing.CopyFromScreen; physical pixels'
    }
}

function Assert-StoreDimensions($Desktop) {
    if ($Desktop.width -lt 1366 -or $Desktop.height -lt 768 -or
        $Desktop.width -gt 3840 -or $Desktop.height -gt 2160) {
        throw "The actual desktop is $($Desktop.width)x$($Desktop.height); a Store screenshot requires at least 1366x768 and this capture supports up to 3840x2160. No image will be resized or fabricated."
    }
}

if ($Action -eq 'Prepare') {
    if (Test-Path -LiteralPath $resolvedState) { throw 'The display state file already exists. Restore the previous capture session first.' }
    $original = [CornerNoteStoreCapture.NativeDesktop]::CurrentMode()
    $cursor = [CornerNoteStoreCapture.NativeDesktop]::Cursor()
    $state = [ordered]@{
        version = 1; original = $original; cursor = @{ x = $cursor.X; y = $cursor.Y }
        selected = $null; changed = $false; minimizedWindows = @(); preparedUtc = [DateTime]::UtcNow.ToString('o')
    }
    $stateDirectory = [IO.Path]::GetDirectoryName($resolvedState)
    [IO.Directory]::CreateDirectory($stateDirectory) | Out-Null
    $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resolvedState -Encoding utf8
    $modes = @([CornerNoteStoreCapture.NativeDesktop]::AvailableModes())
    $usable = @($modes | Where-Object {
        $_.Width -ge 1366 -and $_.Height -ge 768 -and $_.Width -le 3840 -and $_.Height -le 2160 -and $_.BitsPerPixel -ge 24
    })
    $selected = $null
    foreach ($size in @(@(1920, 1080), @(1600, 900), @(1366, 768))) {
        $candidate = @($usable | Where-Object { $_.Width -eq $size[0] -and $_.Height -eq $size[1] } |
            Sort-Object -Property @{ Expression = { $_.BitsPerPixel }; Descending = $true }, @{ Expression = { $_.Frequency }; Descending = $true } |
            Select-Object -First 1)
        if ($candidate.Count -gt 0) { $selected = $candidate[0]; break }
    }
    if ($null -eq $selected -and $original.Width -ge 1366 -and $original.Height -ge 768 -and
        $original.Width -le 3840 -and $original.Height -le 2160) { $selected = $original }
    if ($null -eq $selected -and $usable.Count -gt 0) {
        $selected = $usable | Sort-Object -Property @{ Expression = { [Math]::Abs(([double]$_.Width / $_.Height) - (16.0 / 9.0)) } },
            @{ Expression = { $_.Width * $_.Height }; Descending = $true } | Select-Object -First 1
    }
    if ($null -eq $selected) {
        $available = (@($modes | ForEach-Object { "$($_.Width)x$($_.Height)" } | Sort-Object -Unique) -join ', ')
        throw "Windows offers no supported desktop mode large enough for Store screenshots. Available modes: $available. An interactive Windows runner with a >=1366x768 display is required."
    }
    $state.selected = $selected
    $state.changed = $original.Width -ne $selected.Width -or $original.Height -ne $selected.Height -or
        $original.BitsPerPixel -ne $selected.BitsPerPixel -or $original.Frequency -ne $selected.Frequency
    $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resolvedState -Encoding utf8
    try {
        $minimizedCount = Minimize-ForeignApplications $state ([uint32[]]@())
        if ($state.changed) {
            [CornerNoteStoreCapture.NativeDesktop]::ApplyAdvertisedMode($selected.NativeMode)
            Start-Sleep -Milliseconds 400
        }
        $desktop = Get-DesktopInfo
        Assert-StoreDimensions $desktop
        $desktop['changed'] = $state.changed
        $desktop['availableModeCount'] = $modes.Count
        $desktop['minimizedForeignWindowCount'] = $minimizedCount
        $desktop | ConvertTo-Json -Compress
    } catch {
        try {
            if ($state.changed) { [CornerNoteStoreCapture.NativeDesktop]::ApplyAdvertisedMode($original.NativeMode) }
        } finally { Restore-ApplicationWindows $state }
        throw
    }
    exit 0
}

if ($Action -eq 'Restore') {
    if (-not (Test-Path -LiteralPath $resolvedState)) {
        @{ restored = $false; reason = 'No saved capture display state.' } | ConvertTo-Json -Compress
        exit 0
    }
    $state = Get-Content -LiteralPath $resolvedState -Raw | ConvertFrom-Json
    if ($state.version -ne 1) { throw 'Unsupported saved capture display state.' }
    try {
        [CornerNoteStoreCapture.NativeDesktop]::ApplyAdvertisedMode($state.original.NativeMode)
        Start-Sleep -Milliseconds 250
        $mode = [CornerNoteStoreCapture.NativeDesktop]::CurrentMode()
        if ($mode.Width -ne $state.original.Width -or $mode.Height -ne $state.original.Height) {
            throw 'Windows did not restore the original desktop resolution.'
        }
    } finally {
        try { Restore-ApplicationWindows $state }
        finally { [CornerNoteStoreCapture.NativeDesktop]::MoveCursor([int]$state.cursor.x, [int]$state.cursor.y) }
    }
    Remove-Item -LiteralPath $resolvedState
    @{ restored = $true; width = $mode.Width; height = $mode.Height; restoredForeignWindowCount = @($state.minimizedWindows).Count } | ConvertTo-Json -Compress
    exit 0
}

if (-not $OutputPath) { throw 'Capture requires -OutputPath for the actual desktop PNG.' }
if (-not (Test-Path -LiteralPath $resolvedState)) { throw 'Prepare the capture display before taking a screenshot.' }
$state = Get-Content -LiteralPath $resolvedState -Raw | ConvertFrom-Json
if ($allowedHandles.Count -eq 0) { throw 'Capture requires the exact Corner Note native window handles.' }
$expectedDiagnostics = (@($allowedHandles | ForEach-Object { [CornerNoteStoreCapture.NativeDesktop]::WindowDiagnostics($_) }) -join '; ')
if ([CornerNoteStoreCapture.NativeDesktop]::VisibleExpectedWindowCount($allowedHandles) -ne $allowedHandles.Count) {
    throw "An expected Corner Note native window is not visible before capture (reported main PID $AllowedProcessIds): $expectedDiagnostics"
}
# The Playwright launcher can have a different PID from Electron's native
# browser process. Resolve ownership from trusted BrowserWindow HWNDs instead.
$allowedIds = [uint32[]][CornerNoteStoreCapture.NativeDesktop]::ProcessIdsForWindows($allowedHandles)
$minimizedCount = Minimize-ForeignApplications $state $allowedIds
if ([CornerNoteStoreCapture.NativeDesktop]::VisibleExpectedWindowCount($allowedHandles) -ne $allowedHandles.Count) {
    $diagnostics = (@($allowedHandles | ForEach-Object { [CornerNoteStoreCapture.NativeDesktop]::WindowDiagnostics($_) }) -join '; ')
    throw "An expected Corner Note native window is no longer visible after desktop preparation: $diagnostics"
}
$desktop = Get-DesktopInfo
Assert-StoreDimensions $desktop
if ($null -eq $state.selected -or $desktop.width -ne $state.selected.Width -or $desktop.height -ne $state.selected.Height) {
    throw 'The Windows display mode changed during the screenshot session.'
}
[CornerNoteStoreCapture.NativeDesktop]::MoveCursor(2, 2)
Start-Sleep -Milliseconds 120
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
$bitmap = [Drawing.Bitmap]::new([int]$desktop.width, [int]$desktop.height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = $null
try {
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen([int]$desktop.x, [int]$desktop.y, 0, 0, $bitmap.Size, [Drawing.CopyPixelOperation]::SourceCopy)
    $bitmap.Save($resolvedOutput, [Drawing.Imaging.ImageFormat]::Png)
} finally {
    if ($null -ne $graphics) { $graphics.Dispose() }
    $bitmap.Dispose()
}
$file = Get-Item -LiteralPath $resolvedOutput
if ($file.Length -gt 50MB) { throw 'The actual PNG exceeds the Microsoft Store 50 MB screenshot limit.' }
$desktop['path'] = $resolvedOutput
$desktop['bytes'] = $file.Length
# Use .NET directly: this helper can be launched from PowerShell 7 with a
# PSModulePath that does not expose Windows PowerShell's Get-FileHash function.
$hashStream = [IO.File]::OpenRead($resolvedOutput)
$hashAlgorithm = [Security.Cryptography.SHA256]::Create()
try {
    $desktop['sha256'] = ([BitConverter]::ToString($hashAlgorithm.ComputeHash($hashStream))).Replace('-', '').ToLowerInvariant()
} finally {
    $hashAlgorithm.Dispose()
    $hashStream.Dispose()
}
$desktop['capturedUtc'] = [DateTime]::UtcNow.ToString('o')
$desktop['cleanDesktop'] = $true
$desktop['foreignWindowCountAfter'] = 0
$desktop['minimizedForeignWindowCount'] = $minimizedCount
$desktop | ConvertTo-Json -Compress
