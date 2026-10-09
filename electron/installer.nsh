# Protocol activation for notifications; per-user install and owned-key cleanup.
!macro customInstall
  WriteRegStr HKCU "Software\Classes\requirement-calendar" "" "URL:Requirement Calendar"
  WriteRegStr HKCU "Software\Classes\requirement-calendar" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\requirement-calendar\DefaultIcon" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\requirement-calendar\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Classes\requirement-calendar\shell\open\command" ""
  StrCmp $0 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"' 0 +2
  DeleteRegKey HKCU "Software\Classes\requirement-calendar"
!macroend
