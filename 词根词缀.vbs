' Word-Root Analyzer launcher (ASCII only: avoids VBS encoding pitfalls)
' Double-click this file:
'   1. if the app is already running, just open the browser (single instance)
'   2. otherwise start server.py hidden, wait for the port, start TTS hidden, open the browser
Option Explicit

Dim sh, fs, base, url, port
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
base = fs.GetParentFolderName(WScript.ScriptFullName)
port = 8756
url = "http://127.0.0.1:" & port & "/"

Function PortAlive(u)
  On Error Resume Next
  Dim x, alive
  Set x = CreateObject("MSXML2.XMLHTTP")
  x.Open "GET", u, False
  x.Send
  alive = False
  If Err.Number = 0 Then
    If x.Status >= 200 And x.Status < 500 Then alive = True
  End If
  Err.Clear
  On Error GoTo 0
  PortAlive = alive
End Function

' --- single instance: already running -> just open the browser ---
If PortAlive(url) Then
  sh.Run url, 1, False
  WScript.Quit 0
End If

' --- start the main server hidden ---
sh.CurrentDirectory = base
sh.Run "python """ & base & "\server.py""", 0, False

' --- wait for the port (max 40s) ---
Dim i
For i = 1 To 80
  WScript.Sleep 500
  If PortAlive(url) Then Exit For
Next

' --- start TTS hidden, but only if 8757 is not already serving ---
Dim ttsUrl
ttsUrl = "http://127.0.0.1:8757/health"
If fs.FileExists(base & "\tts_start.bat") Then
  If Not PortAlive(ttsUrl) Then
    sh.Run "cmd /c """ & base & "\tts_start.bat""", 0, False
  End If
End If

' --- open the UI ---
sh.Run url, 1, False
