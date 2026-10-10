$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$output = Join-Path $root '.build/windows-cli'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path $compiler)) { throw 'Windows .NET Framework compiler not found.' }
& $compiler /nologo /target:exe /platform:x64 /optimize+ /codepage:65001 "/out:$output/reqcal.exe" /reference:System.Web.Extensions.dll "$root/desktop/windows/cli/Reqcal.cs"
if ($LASTEXITCODE -ne 0) { throw "reqcal compilation failed: $LASTEXITCODE" }
Write-Output "Built $output/reqcal.exe"
