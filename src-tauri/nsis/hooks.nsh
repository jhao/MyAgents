; MyAgents NSIS Installer Hooks
; - PREINSTALL: Kill orphaned MyAgents sidecar processes before file replacement
;   Prevents file-lock failures when updating bun-x86_64-pc-windows-msvc.exe

!macro NSIS_HOOK_PREINSTALL
  ; Kill MyAgents bun sidecar processes (identified by --myagents-sidecar marker)
  ; Does NOT affect Claude Code or other bun processes
  DetailPrint "Cleaning up MyAgents background processes..."
  nsExec::ExecToLog 'powershell -NoProfile -Command "$ErrorActionPreference=\"SilentlyContinue\"; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \"*--myagents-sidecar*\" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"'

  ; Kill SDK child processes spawned by MyAgents
  nsExec::ExecToLog 'powershell -NoProfile -Command "$ErrorActionPreference=\"SilentlyContinue\"; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \"*claude-agent-sdk*\" -and $_.CommandLine -like \"*.myagents*\" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"'

  ; Kill MCP child processes from our installation (~/.myagents/mcp/)
  nsExec::ExecToLog 'powershell -NoProfile -Command "$ErrorActionPreference=\"SilentlyContinue\"; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \"*.myagents\mcp\*\" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"'

  ; Brief wait for processes to fully terminate and release file locks
  Sleep 1500
!macroend
