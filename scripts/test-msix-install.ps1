[CmdletBinding()]
param(
    [string]$PackagePath = 'dist/CornerNote-Development-x64.msix',
    [ValidateSet('en-US', 'ko-KR')]
    [string[]]$Languages = @('en-US', 'ko-KR')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') {
    throw 'The MSIX installation smoke test must run on Windows.'
}

$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'This CI test needs an elevated Windows runner to trust its temporary signing certificate.'
}

function Find-SignTool {
    $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
    if (Test-Path -LiteralPath $sdkRoot) {
        $sdkDirectories = Get-ChildItem -LiteralPath $sdkRoot -Directory |
            Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
            Sort-Object { [version]$_.Name } -Descending
        foreach ($directory in $sdkDirectories) {
            $candidate = Join-Path $directory.FullName 'x64/signtool.exe'
            if (Test-Path -LiteralPath $candidate) { return $candidate }
        }
    }
    throw 'Windows SDK x64 signtool.exe was not found. Install the Windows SDK before running this test.'
}

function Quote-WindowsArgument([string]$Value) {
    # Windows argv quoting: double backslashes preceding a quote or the closing quote.
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"' + $escaped + '"'
}

$resolvedPackage = (Resolve-Path -LiteralPath $PackagePath).Path
$originalHash = (Get-FileHash -LiteralPath $resolvedPackage -Algorithm SHA256).Hash
$archive = [IO.Compression.ZipFile]::OpenRead($resolvedPackage)
try {
    $manifestEntry = $archive.GetEntry('AppxManifest.xml')
    if ($null -eq $manifestEntry) { throw 'The package has no AppxManifest.xml.' }
    $reader = [IO.StreamReader]::new($manifestEntry.Open())
    try { [xml]$manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally {
    $archive.Dispose()
}
$identity = $manifest.GetElementsByTagName('Identity')[0]
$packageName = $identity.GetAttribute('Name')
$publisher = $identity.GetAttribute('Publisher')
$applicationNodes = @($manifest.GetElementsByTagName('Application'))
if ($packageName -ne 'CornerNote.Development' -or $publisher -ne 'CN=CornerNoteDevelopment') {
    throw 'This test only installs the explicitly named CornerNote.Development package; it never replaces a Store package.'
}
if ($applicationNodes.Count -ne 1 -or $applicationNodes[0].GetAttribute('Id') -ne 'App' -or
    $applicationNodes[0].GetAttribute('Executable') -ne 'app\CornerNote.exe') {
    throw 'Unexpected MSIX application identity or executable.'
}
if (@(Get-AppxPackage -Name $packageName).Count -gt 0) {
    throw 'A development package is already installed. Use a clean CI runner for this installation test.'
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace CornerNotePackageSmoke {
    [Flags]
    public enum ActivateOptions { None = 0, NoErrorUI = 2, NoSplashScreen = 4 }

    [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IApplicationActivationManager {
        [PreserveSig]
        int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments, ActivateOptions options,
            out uint processId);
        [PreserveSig]
        int ActivateForFile([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            IntPtr itemArray, [MarshalAs(UnmanagedType.LPWStr)] string verb, out uint processId);
        [PreserveSig]
        int ActivateForProtocol([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            IntPtr itemArray, out uint processId);
    }

    [ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
    public class ApplicationActivationManager { }

    public static class Launcher {
        public static uint Activate(string appUserModelId, string arguments) {
            var manager = (IApplicationActivationManager)new ApplicationActivationManager();
            try {
                uint processId;
                int result = manager.ActivateApplication(appUserModelId, arguments,
                    ActivateOptions.NoErrorUI | ActivateOptions.NoSplashScreen, out processId);
                Marshal.ThrowExceptionForHR(result);
                return processId;
            } finally { Marshal.FinalReleaseComObject(manager); }
        }
    }
}
'@

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('corner-note-msix-smoke-' + [guid]::NewGuid().ToString('N'))
$certificate = $null
$trustedCertificate = $null
$registeredPackage = $null
$testProcess = $null
$testFailure = $null
$cleanupFailures = [Collections.Generic.List[string]]::new()
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

try {
    $signedPackage = Join-Path $temporaryRoot 'CornerNote-Development-signed-for-ci.msix'
    Copy-Item -LiteralPath $resolvedPackage -Destination $signedPackage
    # The private key stays in the runner's certificate store; no PFX is exported.
    $certificate = New-SelfSignedCertificate -Type Custom -Subject $publisher `
        -FriendlyName 'Corner Note temporary CI package test' `
        -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 `
        -KeyUsage DigitalSignature -KeyExportPolicy NonExportable `
        -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(1) `
        -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
    $publicCertificatePath = Join-Path $temporaryRoot 'ci-only-public-certificate.cer'
    Export-Certificate -Cert $certificate -FilePath $publicCertificatePath | Out-Null
    $trustedCertificate = Import-Certificate -FilePath $publicCertificatePath -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople'
    $signTool = Find-SignTool
    & $signTool sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $signedPackage
    if ($LASTEXITCODE -ne 0) { throw "Signing the temporary package copy failed with exit code $LASTEXITCODE." }

    Add-AppxPackage -Path $signedPackage -ForceApplicationShutdown -ErrorAction Stop
    $registeredPackage = Get-AppxPackage -Name $packageName
    if ($null -eq $registeredPackage -or $registeredPackage.Publisher -ne $publisher -or
        -not (Test-Path -LiteralPath (Join-Path $registeredPackage.InstallLocation 'app/CornerNote.exe'))) {
        throw 'The installed MSIX package identity or executable did not match the package manifest.'
    }
    $appUserModelId = $registeredPackage.PackageFamilyName + '!App'

    foreach ($language in $Languages) {
        $testDirectory = Join-Path $temporaryRoot ('profile-' + $language)
        New-Item -ItemType Directory -Path $testDirectory | Out-Null
        $reportPath = Join-Path $testDirectory 'smoke-report.json'
        $launchArguments = @('--smoke-test', "--smoke-report=$reportPath", "--user-data-dir=$testDirectory", "--test-system-language=$language")
        $argumentString = ($launchArguments | ForEach-Object { Quote-WindowsArgument $_ }) -join ' '
        $activatedId = [CornerNotePackageSmoke.Launcher]::Activate($appUserModelId, $argumentString)
        if ($activatedId -eq 0) { throw "MSIX activation returned no process for $language." }
        $testProcess = Get-Process -Id $activatedId -ErrorAction SilentlyContinue
        $deadline = [DateTime]::UtcNow.AddSeconds(45)
        while (-not (Test-Path -LiteralPath $reportPath)) {
            if ($null -ne $testProcess -and $testProcess.HasExited) {
                throw "The installed app exited before writing its $language smoke report (exit $($testProcess.ExitCode))."
            }
            if ([DateTime]::UtcNow -ge $deadline) { throw "The installed app did not write its $language smoke report within 45 seconds." }
            Start-Sleep -Milliseconds 100
        }
        if ($null -ne $testProcess) {
            if (-not $testProcess.WaitForExit(30000)) { throw "The installed app did not shut down cleanly after its $language smoke test." }
            if ($testProcess.ExitCode -ne 0) { throw "The installed app smoke test exited with code $($testProcess.ExitCode)." }
            $testProcess.Dispose()
            $testProcess = $null
        }
        $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
        if ($report.smokeTest -ne 'passed' -or $report.packagedIdentity -ne $true -or
            $report.systemLanguage -ne $language -or $report.uiLocale -ne $language) {
            throw "The installed app smoke report did not prove its packaged identity and $language UI: $($report | ConvertTo-Json -Compress)."
        }
        $statePath = Join-Path $testDirectory 'note-state.json'
        if (-not (Test-Path -LiteralPath $statePath)) { throw 'The installed app did not persist its isolated test note.' }
        $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        if (@($saved.notes).Count -ne 1) { throw 'The installed app did not persist exactly one test note.' }
        Write-Output "MSIX installed activation passed: $language, real package identity, note save, fold/unfold, clean exit."
    }
    if ((Get-FileHash -LiteralPath $resolvedPackage -Algorithm SHA256).Hash -ne $originalHash) {
        throw 'The original unsigned package changed during the installation test.'
    }
} catch {
    $testFailure = $_
} finally {
    if ($null -ne $testProcess) {
        try {
            if (-not $testProcess.HasExited) { $testProcess.Kill(); $testProcess.WaitForExit(10000) | Out-Null }
            $testProcess.Dispose()
        } catch { $cleanupFailures.Add("Could not stop the test process: $($_.Exception.Message)") }
    }
    try {
        $remainingPackage = Get-AppxPackage -Name $packageName
        if ($null -ne $remainingPackage) { Remove-AppxPackage -Package $remainingPackage.PackageFullName -ErrorAction Stop }
    } catch { $cleanupFailures.Add("Could not remove the temporary package: $($_.Exception.Message)") }
    if ($null -ne $trustedCertificate) {
        try { Remove-Item -LiteralPath ('Cert:\LocalMachine\TrustedPeople\' + $trustedCertificate.Thumbprint) -Force }
        catch { $cleanupFailures.Add("Could not remove temporary certificate trust: $($_.Exception.Message)") }
    }
    if ($null -ne $certificate) {
        try { Remove-Item -LiteralPath ('Cert:\CurrentUser\My\' + $certificate.Thumbprint) -DeleteKey -Force }
        catch { $cleanupFailures.Add("Could not remove the temporary signing key: $($_.Exception.Message)") }
    }
    try { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
    catch { $cleanupFailures.Add("Could not remove the isolated smoke-test directory: $($_.Exception.Message)") }
}

if ($null -ne $testFailure) {
    foreach ($cleanupFailure in $cleanupFailures) { Write-Warning $cleanupFailure }
    throw $testFailure
}
if ($cleanupFailures.Count -gt 0) { throw ($cleanupFailures -join [Environment]::NewLine) }
Write-Output 'MSIX installation smoke tests passed; the installed test package, temporary trust and private key were removed.'
