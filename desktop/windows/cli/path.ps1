param(
  [Parameter(Mandatory=$true)][ValidateSet('Install','Uninstall')][string]$Action,
  [Parameter(Mandatory=$true)][string]$Directory
)
$ErrorActionPreference = 'Stop'
$directoryPath = [IO.Path]::GetFullPath($Directory).TrimEnd('\')
$key = 'HKCU:\Software\RequirementCalendar\CLI'
$environmentKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
$current = [string]$environmentKey.GetValue('Path','',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
$pathKind = if ($environmentKey.GetValueNames() -icontains 'Path') { $environmentKey.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
$entries = @($current -split ';' | Where-Object { $_ -ne '' })
$owned = (Get-ItemProperty -Path $key -Name PathEntry -ErrorAction SilentlyContinue).PathEntry
if ($Action -eq 'Install') {
  $present = @($entries | Where-Object { $_.TrimEnd('\') -ieq $directoryPath }).Count -gt 0
  if (!$present) {
    $updated = if ([string]::IsNullOrEmpty($current)) { $directoryPath } else { $current.TrimEnd(';') + ';' + $directoryPath }
    $environmentKey.SetValue('Path',$updated,$pathKind)
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name PathEntry -Value $directoryPath -PropertyType String -Force | Out-Null
  }
} elseif ($owned -ieq $directoryPath) {
  $updated = ($entries | Where-Object { $_.TrimEnd('\') -ine $directoryPath }) -join ';'
  $environmentKey.SetValue('Path',$updated,$pathKind)
  Remove-Item -Path $key -Force
}
$environmentKey.Close()
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
