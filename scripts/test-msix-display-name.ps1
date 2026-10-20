[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ManifestPath,
    [Parameter(Mandatory = $true)]
    [string]$ResourceDumpPath,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedDisplayName
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

[xml]$manifest = Get-Content -LiteralPath $ManifestPath -Raw
$packageName = $manifest.SelectSingleNode("/*[local-name()='Package']/*[local-name()='Properties']/*[local-name()='DisplayName']")
$visualNames = @($manifest.SelectNodes("//*[local-name()='VisualElements']/@DisplayName"))
if ($null -eq $packageName -or $packageName.InnerText -cne 'ms-resource:AppDisplayName' -or
    $visualNames.Count -ne 1 -or $visualNames[0].Value -cne 'ms-resource:AppDisplayName') {
    throw 'Package and application display names must use the same verified AppDisplayName resource.'
}

# Validate the compiled PRI dump, rather than just the input RESW files.
[xml]$dump = Get-Content -LiteralPath $ResourceDumpPath -Raw
$nameResources = @($dump.SelectNodes("//*[local-name()='NamedResource']") | Where-Object {
    ($_.GetAttribute('name') -split '/')[-1] -ceq 'AppDisplayName'
})
$values = @($nameResources | ForEach-Object {
    $_.SelectNodes(".//*[local-name()='Candidate']/*[local-name()='Value']")
})
if ($values.Count -eq 0) {
    throw 'No compiled AppDisplayName values were found in the detailed PRI dump.'
}
foreach ($value in $values) {
    if ($value.InnerText -cne $ExpectedDisplayName) {
        throw "Unreserved compiled package display name '$($value.InnerText)'; expected exactly '$ExpectedDisplayName'."
    }
}
Write-Output "Verified $($values.Count) compiled AppDisplayName candidates: $ExpectedDisplayName."
