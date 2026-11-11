; 记忆圣所 · Inno Setup 安装包脚本
; 用法（仓库根目录）：bash desktop-build/build-installer.sh
; 产物：desktop-build/installer-dist/ms-<版本>-setup.exe
; 设计要点：
;   · 按用户安装（PrivilegesRequired=lowest，装到 %LOCALAPPDATA%\Programs\MemorySanctuary），不需要管理员
;   · 主程序文件名保持 MemorySanctuary-win_x64.exe —— Neutralino 用 exe 名决定用户数据目录
;     (%APPDATA%\MemorySanctuary-win_x64.exe)，改名会让老玩家的存档失联，切勿改
;   · 卸载时询问是否连带删除存档+WebView2 缓存（该目录实测可达 700MB），静默卸载默认保留
; 版本号由 build-installer.sh 从 js/main.js 的 GAME_VERSION 注入，勿在此写死

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif

#define MyAppName "记忆圣所"
#define MyAppFullName "记忆圣所 · Memory Sanctuary"
#define MyAppPublisher "暮雨"
#define MyAppExeName "MemorySanctuary-win_x64.exe"
#define MyAppDataDirName "MemorySanctuary-win_x64.exe"

; 启动参数：让 WebView2 允许自动播放（否则首次启动必须点一下才出声，十几个版本的老问题）。
; 只通过快捷方式/安装后启动传参，作用于本程序进程，不写系统环境变量、不影响其他软件。
; --port=45999：固定 Neutralino 内部服务器端口（v0.2.13）。页面 origin 稳定 = localStorage 稳定，
;   否则每次启动随机端口 → 每次都是空存储 → 玩家表现为「存档重启就丢」。
;   与 neutralino.config.json 的 "port": 45999 保持一致（config 是兜底，这里覆盖直接双击 exe 的情况）。
#define MyAppLaunchArgs "--edge-webview-switches=--autoplay-policy=no-user-gesture-required --port=45999"

[Setup]
AppId={{B70F5349-5C8D-4122-AA2D-57E0959CE6DB}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppFullName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppComments=末日叙事资源管理 · 绿色安装、可完整卸载
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoProductName={#MyAppName}
VersionInfoDescription={#MyAppFullName} 安装程序
VersionInfoCopyright=© 2026 {#MyAppPublisher}
DefaultDirName={code:GetDefaultInstallDir}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableWelcomePage=no
; 固定「按当前用户安装」为默认（不需要管理员权限，安装记录写 HKCU）。
; 保留「为所有用户安装」的选项：v0.2.12 在部分机器上是以管理员身份装的（记录进了 HKLM），
; 升级时选同一个模式才会覆盖同一条卸载记录，否则「应用和功能」里会同时出现两条。
; 目录记忆不再依赖 Inno 的旧记录 —— 见下方 GetDefaultInstallDir 的主动探测（v0.2.13）。
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=installer-dist
OutputBaseFilename=ms-{#MyAppVersion}-setup
SetupIconFile=..\assets\icons\favicon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppFullName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
AllowNoIcons=yes
AppMutex=MemorySanctuarySetupMutex

[Languages]
Name: "cn"; MessagesFile: "ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加任务："; Flags: checkedonce

[Files]
Source: "dist\MemorySanctuary\MemorySanctuary-win_x64.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\MemorySanctuary\resources.neu"; DestDir: "{app}"; Flags: ignoreversion
Source: "README-player.txt"; DestDir: "{app}"; DestName: "README.txt"; Flags: ignoreversion isreadme

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Parameters: "{#MyAppLaunchArgs}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Parameters: "{#MyAppLaunchArgs}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Parameters: "{#MyAppLaunchArgs}"; Description: "立即启动 {#MyAppName}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; 安装目录内的运行期残留：Neutralino 每次运行都会在程序目录写 neutralinojs.log，
; Inno 只删自己装进去的文件，不删这个 → 不处理会留下空目录 + 日志
Type: files; Name: "{app}\*.log"
Type: filesandordirs; Name: "{app}\EBWebView"
Type: dirifempty; Name: "{app}"

[Code]
// ============================================================
// 安装目录自动识别（v0.2.13）
// 背景：Inno 的「记住上次安装目录」只查当前注册表 hive 的卸载项。
//       v0.2.12 之前有玩家用 zip 手动版，或曾以管理员身份安装（记录进了另一个 hive），
//       于是升级时目录页回落到默认路径 → 装成两份、旧档看似「没覆盖」。
// 做法：按「注册表 → 常见目录 → 各盘符常见目录」顺序探测已存在的 exe，命中即作为默认目录。
//       玩家仍可手动改，/DIR= 命令行参数优先级最高（Inno 自身处理）。
// ============================================================

#define MyAppRegKey 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{B70F5349-5C8D-4122-AA2D-57E0959CE6DB}_is1'

var
  DetectedInstallDir: String;

function DirHasOurExe(Dir: String): Boolean;
begin
  Result := (Dir <> '') and FileExists(AddBackslash(Dir) + '{#MyAppExeName}');
end;

function DetectPreviousInstallDir(): String;
var
  V: String;
  I: Integer;
  Base: String;
  DefaultDir: String;
begin
  Result := '';

  // 1) 注册表：当前 hive + 另一 hive 的卸载项 InstallLocation
  if RegQueryStringValue(HKCU, '{#MyAppRegKey}', 'InstallLocation', V) then
    if DirHasOurExe(V) then begin Result := V; exit; end;
  if RegQueryStringValue(HKLM, '{#MyAppRegKey}', 'InstallLocation', V) then
    if DirHasOurExe(V) then begin Result := V; exit; end;
  if RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\{#MyAppRegKey}', 'InstallLocation', V) then
    if DirHasOurExe(V) then begin Result := V; exit; end;

  // 2) 标准安装位置
  DefaultDir := ExpandConstant('{localappdata}\Programs\MemorySanctuary');
  if DirHasOurExe(DefaultDir) then begin Result := DefaultDir; exit; end;
  if DirHasOurExe(ExpandConstant('{pf}\MemorySanctuary')) then
    begin Result := ExpandConstant('{pf}\MemorySanctuary'); exit; end;
  if DirHasOurExe(ExpandConstant('{pf32}\MemorySanctuary')) then
    begin Result := ExpandConstant('{pf32}\MemorySanctuary'); exit; end;

  // 3) 各盘符常见位置（玩家常自己挑目录，例如 E:\Games\MemorySanctuary）
  for I := Ord('C') to Ord('Z') do
  begin
    Base := Chr(I) + ':\';
    if not DirExists(Base) then
      continue;
    if DirHasOurExe(Base + 'Games\MemorySanctuary') then
      begin Result := Base + 'Games\MemorySanctuary'; exit; end;
    if DirHasOurExe(Base + 'MemorySanctuary') then
      begin Result := Base + 'MemorySanctuary'; exit; end;
    if DirHasOurExe(Base + 'Program Files\MemorySanctuary') then
      begin Result := Base + 'Program Files\MemorySanctuary'; exit; end;
  end;
end;

function GetDefaultInstallDir(Param: String): String;
begin
  if DetectedInstallDir = '' then
    DetectedInstallDir := DetectPreviousInstallDir();
  if DetectedInstallDir <> '' then
    Result := DetectedInstallDir
  else
    Result := ExpandConstant('{localappdata}\Programs\MemorySanctuary');
end;

// 卸载后询问是否删除存档与缓存目录（%APPDATA%\MemorySanctuary-win_x64.exe）
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{userappdata}\{#MyAppDataDirName}');
    if DirExists(DataDir) then
    begin
      // 静默卸载（/VERYSILENT）不弹窗，默认保留存档，避免脚本化卸载误删玩家进度
      if UninstallSilent then
        exit;
      if MsgBox('是否同时删除游戏存档与缓存数据？' + #13#10 + #13#10 +
                '位置：' + DataDir + #13#10 +
                '内容：存档 + 浏览器缓存（实测可达 700 MB，缓存占绝大部分）' + #13#10 + #13#10 +
                '选择「是」＝ 彻底清理；选择「否」＝ 保留存档，重装后可以接着玩。',
                mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
        DelTree(DataDir, True, True, True);
    end;
  end;
end;
