; Default the install folder to D: when that drive exists. C: on the workstations this ships to
; fills up; the app already prefers D: for demo companies for the same reason. The person can still
; change the folder in the wizard, and /D= on the command line still wins over this.
!macro customInit
  ${IfNot} ${Silent}
  ${OrIf} $INSTDIR == ""
    IfFileExists "D:\*.*" 0 +2
      StrCpy $INSTDIR "D:\ApexLedger\App"
  ${EndIf}
!macroend
