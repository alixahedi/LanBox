Option Explicit

Dim shell, fso, scriptDir, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "cmd /c """ & scriptDir & "\lanbox-background.bat"""

' Run hidden (0) and do not block (False)
shell.Run cmd, 0, False
Option Explicit

Dim shell, fso, scriptDir, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "cmd /c """ & scriptDir & "\lanbox-background.bat"""

' Run hidden (0) and do not block (False)
shell.Run cmd, 0, False
