; CodeCraft CLI - NSIS Custom Installation Script
; Handles PATH management, shortcuts, and system integration

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"

; Custom variables
Var INSTALL_PATH
Var ADD_TO_PATH
Var CREATE_SHORTCUTS
Var EXISTING_INSTALLATION

; Custom pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE
Page custom PathOptionsPage PathOptionsPageLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
Page custom CompletionPage
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; Language
!insertmacro MUI_LANGUAGE "English"

; Installation sections
Section "Core Files" SecCore
  SectionIn RO  ; Required section
  
  ; Set output path
  SetOutPath "$INSTDIR"
  
  ; Install files
  File /r "${APP_DIR}\*.*"
  
  ; Create uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  ; Write registry information
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCraft CLI" "DisplayName" "CodeCraft CLI"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCraft CLI" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCraft CLI" "Publisher" "CodeCraft Team"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCraft CLI" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCraft CLI" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCraft CLI" "HelpLink" "https://codecraft.dev/docs"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCraft CLI" "URLInfoAbout" "https://codecraft.dev"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCraft CLI" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCraft CLI" "NoRepair" 1
  
  ; Get installation size
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCraft CLI" "EstimatedSize" "$0"
  
SectionEnd

Section "Add to PATH" SecPath
  ; Add installation directory to PATH
  ${If} $ADD_TO_PATH == "1"
    ; Get current PATH
    ReadRegStr $R0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "PATH"
    
    ; Check if already in PATH
    ${StrStr} $R1 "$R0" "$INSTDIR"
    ${If} $R1 == ""
      ; Add to PATH
      StrCpy $R0 "$R0;$INSTDIR"
      WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "PATH" $R0
      
      ; Broadcast PATH change
      SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
      
      DetailPrint "Added $INSTDIR to system PATH"
    ${Else}
      DetailPrint "Directory already in PATH"
    ${EndIf}
  ${EndIf}
SectionEnd

Section "Desktop Shortcut" SecDesktop
  ${If} $CREATE_SHORTCUTS == "1"
    CreateShortcut "$DESKTOP\CodeCraft CLI.lnk" "$INSTDIR\codecraft.exe" "" "$INSTDIR\codecraft.exe" 0
    DetailPrint "Created desktop shortcut"
  ${EndIf}
SectionEnd

Section "Start Menu Shortcuts" SecStartMenu
  ${If} $CREATE_SHORTCUTS == "1"
    CreateDirectory "$SMPROGRAMS\CodeCraft CLI"
    CreateShortcut "$SMPROGRAMS\CodeCraft CLI\CodeCraft CLI.lnk" "$INSTDIR\codecraft.exe" "" "$INSTDIR\codecraft.exe" 0
    CreateShortcut "$SMPROGRAMS\CodeCraft CLI\Documentation.lnk" "https://codecraft.dev/docs" "" "" 0
    CreateShortcut "$SMPROGRAMS\CodeCraft CLI\Uninstall.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0
    DetailPrint "Created start menu shortcuts"
  ${EndIf}
SectionEnd

; Uninstallation sections
Section "Uninstall"
  ; Remove files and directories
  RMDir /r "$INSTDIR"
  
  ; Remove shortcuts
  Delete "$DESKTOP\CodeCraft CLI.lnk"
  RMDir /r "$SMPROGRAMS\CodeCraft CLI"
  
  ; Remove from PATH
  ReadRegStr $R0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "PATH"
  ${StrStr} $R1 "$R0" ";$INSTDIR"
  ${If} $R1 != ""
    ${StrRep} $R0 $R0 ";$INSTDIR" ""
    WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "PATH" $R0
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${Else}
    ${StrStr} $R1 "$R0" "$INSTDIR;"
    ${If} $R1 != ""
      ${StrRep} $R0 $R0 "$INSTDIR;" ""
      WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "PATH" $R0
      SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
    ${EndIf}
  ${EndIf}
  
  ; Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCraft CLI"
  DeleteRegKey HKLM "Software\CodeCraft CLI"
  
  ; Remove user data (optional)
  MessageBox MB_YESNO "Do you want to remove user configuration and cache files?" IDNO skip_userdata
    RMDir /r "$APPDATA\CodeCraft"
    RMDir /r "$LOCALAPPDATA\CodeCraft"
  skip_userdata:
  
SectionEnd

; Custom page functions
Function PathOptionsPage
  ; Create custom page for PATH and shortcut options
  !insertmacro MUI_HEADER_TEXT "Installation Options" "Choose additional installation options"
  
  nsDialogs::Create 1018
  Pop $0
  
  ${NSD_CreateGroupBox} 10u 10u 280u 60u "System Integration"
  Pop $1
  
  ${NSD_CreateCheckBox} 20u 25u 200u 12u "Add CodeCraft to system PATH"
  Pop $2
  ${NSD_SetState} $2 ${BST_CHECKED}
  
  ${NSD_CreateCheckBox} 20u 40u 200u 12u "Create desktop and start menu shortcuts"
  Pop $3
  ${NSD_SetState} $3 ${BST_CHECKED}
  
  ${NSD_CreateGroupBox} 10u 80u 280u 40u "Existing Installation"
  Pop $4
  
  ; Check for existing installation
  IfFileExists "$INSTDIR\codecraft.exe" 0 no_existing
    ${NSD_CreateLabel} 20u 95u 260u 12u "An existing installation was detected and will be upgraded."
    Pop $5
    StrCpy $EXISTING_INSTALLATION "1"
    Goto existing_done
  no_existing:
    ${NSD_CreateLabel} 20u 95u 260u 12u "No existing installation detected."
    Pop $5
    StrCpy $EXISTING_INSTALLATION "0"
  existing_done:
  
  nsDialogs::Show
FunctionEnd

Function PathOptionsPageLeave
  ; Get checkbox states
  ${NSD_GetState} $2 $ADD_TO_PATH
  ${NSD_GetState} $3 $CREATE_SHORTCUTS
FunctionEnd

Function CompletionPage
  ; Custom completion page with next steps
  !insertmacro MUI_HEADER_TEXT "Installation Complete" "CodeCraft CLI has been successfully installed"
  
  nsDialogs::Create 1018
  Pop $0
  
  ${NSD_CreateLabel} 10u 10u 280u 24u "CodeCraft CLI version ${VERSION} has been installed successfully!"
  Pop $1
  
  ${NSD_CreateGroupBox} 10u 40u 280u 80u "Next Steps"
  Pop $2
  
  ${NSD_CreateLabel} 20u 55u 260u 12u "• Open a new command prompt or PowerShell window"
  Pop $3
  
  ${NSD_CreateLabel} 20u 70u 260u 12u "• Run 'codecraft --version' to verify installation"
  Pop $4
  
  ${NSD_CreateLabel} 20u 85u 260u 12u "• Run 'codecraft --help' to see available commands"
  Pop $5
  
  ${NSD_CreateLabel} 20u 100u 260u 12u "• Visit https://codecraft.dev/docs for documentation"
  Pop $6
  
  ${If} $ADD_TO_PATH == "1"
    ${NSD_CreateLabel} 10u 130u 280u 12u "✓ CodeCraft has been added to your system PATH"
    Pop $7
  ${Else}
    ${NSD_CreateLabel} 10u 130u 280u 24u "⚠ To use CodeCraft from anywhere, you may need to restart your command prompt or add the installation directory to your PATH manually."
    Pop $7
  ${EndIf}
  
  nsDialogs::Show
FunctionEnd

; Installation types
InstType "Full Installation"
InstType "Minimal Installation"

; Section descriptions
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecCore} "Core CodeCraft CLI files (required)"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecPath} "Add CodeCraft to system PATH for global access"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Create desktop shortcut"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecStartMenu} "Create start menu shortcuts"
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; Initialize function
Function .onInit
  ; Check for administrative privileges
  UserInfo::GetAccountType
  Pop $0
  ${If} $0 != "admin"
    MessageBox MB_ICONSTOP "Administrator privileges are required to install CodeCraft CLI."
    SetErrorLevel 740 ; ERROR_ELEVATION_REQUIRED
    Quit
  ${EndIf}
  
  ; Set default installation directory
  StrCpy $INSTDIR "$PROGRAMFILES64\CodeCraft CLI"
  
  ; Check Windows version
  ${IfNot} ${AtLeastWin7}
    MessageBox MB_ICONSTOP "CodeCraft CLI requires Windows 7 or later."
    Quit
  ${EndIf}
  
  ; Initialize variables
  StrCpy $ADD_TO_PATH "1"
  StrCpy $CREATE_SHORTCUTS "1"
  StrCpy $EXISTING_INSTALLATION "0"
FunctionEnd

; Pre-installation function
Function .onInstSuccess
  ; Display success message
  MessageBox MB_OK "CodeCraft CLI has been successfully installed!$\n$\nYou can now use 'codecraft' commands from any command prompt."
FunctionEnd