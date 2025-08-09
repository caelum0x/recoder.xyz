; Recoder Desktop NSIS Installer Script
; Custom installer behaviors

!macro customHeader
  ShowInstDetails show
  ShowUninstDetails show
!macroend

!macro customInit
  ; Custom initialization
!macroend

!macro customInstall
  ; Create desktop shortcut
  CreateShortCut "$DESKTOP\Recoder Desktop.lnk" "$INSTDIR\Recoder Desktop.exe" "" "$INSTDIR\resources\app\assets\icon.ico" 0
  
  ; Create start menu shortcuts
  CreateDirectory "$SMPROGRAMS\Recoder Desktop"
  CreateShortCut "$SMPROGRAMS\Recoder Desktop\Recoder Desktop.lnk" "$INSTDIR\Recoder Desktop.exe" "" "$INSTDIR\resources\app\assets\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\Recoder Desktop\Uninstall Recoder Desktop.lnk" "$INSTDIR\Uninstall Recoder Desktop.exe" "" "" 0
  
  ; Register file associations for common code files
  WriteRegStr HKCR ".js" "RecoderDesktop" "JavaScript File"
  WriteRegStr HKCR ".ts" "RecoderDesktop" "TypeScript File"
  WriteRegStr HKCR ".py" "RecoderDesktop" "Python File"
  WriteRegStr HKCR ".json" "RecoderDesktop" "JSON File"
  
  ; Add to system PATH (optional)
  ; EnvVarUpdate $0 "PATH" "A" "HKLM" "$INSTDIR"
  
  ; Register URL protocol for recoder:// links
  WriteRegStr HKCR "recoder" "" "URL:Recoder Protocol"
  WriteRegStr HKCR "recoder" "URL Protocol" ""
  WriteRegStr HKCR "recoder\DefaultIcon" "" "$INSTDIR\Recoder Desktop.exe,0"
  WriteRegStr HKCR "recoder\shell\open\command" "" '"$INSTDIR\Recoder Desktop.exe" "%1"'
!macroend

!macro customUnInstall
  ; Remove desktop shortcut
  Delete "$DESKTOP\Recoder Desktop.lnk"
  
  ; Remove start menu shortcuts
  RMDir /r "$SMPROGRAMS\Recoder Desktop"
  
  ; Remove file associations
  DeleteRegKey HKCR ".js"
  DeleteRegKey HKCR ".ts"
  DeleteRegKey HKCR ".py"
  DeleteRegKey HKCR ".json"
  
  ; Remove URL protocol
  DeleteRegKey HKCR "recoder"
  
  ; Remove from system PATH (if added)
  ; EnvVarUpdate $0 "PATH" "R" "HKLM" "$INSTDIR"
!macroend

; Custom installer pages
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Recoder Desktop Setup"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of Recoder Desktop.$\r$\n$\r$\nRecoder Desktop provides seamless access to local AI models (Ollama, LM Studio) and cloud AI providers for enhanced development productivity.$\r$\n$\r$\nClick Next to continue."
!macroend

; Custom finish page
!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "Recoder Desktop Installation Complete"
  !define MUI_FINISHPAGE_TEXT "Recoder Desktop has been successfully installed on your computer.$\r$\n$\r$\nTo get started:$\r$\n• Install Ollama or LM Studio for local AI$\r$\n• Launch Recoder Desktop from the Start Menu$\r$\n• Visit GitHub repositories to see AI tools in action$\r$\n$\r$\nThank you for choosing Recoder Desktop!"
  !define MUI_FINISHPAGE_RUN "$INSTDIR\Recoder Desktop.exe"
  !define MUI_FINISHPAGE_RUN_TEXT "Launch Recoder Desktop now"
  !define MUI_FINISHPAGE_LINK "Visit recoder.xyz for documentation and support"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://recoder.xyz"
!macroend