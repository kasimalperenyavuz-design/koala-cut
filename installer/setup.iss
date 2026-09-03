; Inno Setup Script for koala-cut
; Zero-dependency standalone Windows installer

#define MyAppName "koala-cut"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "koala-cut Studio"
#define MyAppURL "http://127.0.0.1:8000"
#define MyAppExeName "koala-cut.exe"

[Setup]
AppId={{D3E84821-4E67-4B29-9154-A94738CD1801}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\dist
OutputBaseFilename=koala-cut-setup
SetupIconFile=..\assets\app.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog commandline
UninstallDisplayIcon={app}\{#MyAppExeName}
DisableProgramGroupPage=yes
VersionInfoVersion=1.0.0.0
VersionInfoCompany=koala-cut Studio
VersionInfoDescription=koala-cut Video Studio Kurulum Sihirbazı
VersionInfoTextVersion=1.0.0
VersionInfoCopyright=Copyright (C) 2026 koala-cut Studio
VersionInfoProductName=koala-cut
VersionInfoProductVersion=1.0.0.0

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\ffmpeg.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\ffprobe.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\assets\app.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
