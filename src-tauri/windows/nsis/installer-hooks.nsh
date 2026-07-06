!include LogicLib.nsh
!include FileFunc.nsh

!macro NSIS_HOOK_PREINSTALL
  ${IfNot} "$INSTDIR" == ""
    ${GetFileName} "$INSTDIR" $0
    ${IfNot} "$0" == "LightMarkit"
      StrCpy $INSTDIR "$INSTDIR\LightMarkit"
    ${EndIf}
  ${EndIf}
!macroend
