# Protocol activation for notifications; per-user install and owned-key cleanup.
!macro customInstall
  WriteRegStr HKCU "Software\Classes\requirement-calendar" "" "URL:Requirement Calendar"
  WriteRegStr HKCU "Software\Classes\requirement-calendar" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\requirement-calendar\DefaultIcon" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\requirement-calendar\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\cli\path.ps1" -Action Install -Directory "$INSTDIR"'
  Pop $0
  StrCmp $0 "0" +2
  DetailPrint "reqcal PATH setup failed; reqcal.exe remains available in the installation directory."
!macroend

!macro customUnInstall
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\cli\path.ps1" -Action Uninstall -Directory "$INSTDIR"'
  Pop $0
  ReadRegStr $0 HKCU "Software\Classes\requirement-calendar\shell\open\command" ""
  StrCmp $0 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"' 0 +2
  DeleteRegKey HKCU "Software\Classes\requirement-calendar"
!macroend
