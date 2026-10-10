param(
  [Parameter(Mandatory=$true)][ValidateSet('Install','Uninstall')][string]$Action,
  [Parameter(Mandatory=$true)][string]$Directory
)
$ErrorActionPreference = 'Stop'
$directoryPath = [IO.Path]::GetFullPath($Directory).TrimEnd('\')
$key = 'HKCU:\Software\RequirementCalendar\CLI'
$current = [Environment]::GetEnvironmentVariable('Path','User')
$entries = @($current -split ';' | Where-Object { $_ -ne '' })
$owned = (Get-ItemProperty -Path $key -Name PathEntry -ErrorAction SilentlyContinue).PathEntry
if ($Action -eq 'Install') {
  $present = @($entries | Where-Object { $_.TrimEnd('\') -ieq $directoryPath }).Count -gt 0
  if (!$present) {
    $updated = if ([string]::IsNullOrEmpty($current)) { $directoryPath } else { $current.TrimEnd(';') + ';' + $directoryPath }
    [Environment]::SetEnvironmentVariable('Path',$updated,'User')
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name PathEntry -Value $directoryPath -PropertyType String -Force | Out-Null
  }
} elseif ($owned -ieq $directoryPath) {
  $updated = ($entries | Where-Object { $_.TrimEnd('\') -ine $directoryPath }) -join ';'
  [Environment]::SetEnvironmentVariable('Path',$updated,'User')
  Remove-Item -Path $key -Force
}
# Tell Explorer that new terminals should inherit the updated user PATH.
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ReqcalEnvironment {
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wParam, string lParam, uint flags, uint timeout, out IntPtr result);
}
'@
$result = [IntPtr]::Zero
[ReqcalEnvironment]::SendMessageTimeout([IntPtr]0xffff,0x001a,[IntPtr]::Zero,'Environment',2,2000,[ref]$result) | Out-Null
