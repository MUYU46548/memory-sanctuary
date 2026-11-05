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

[Setup]
AppId={{B70F5349-5C8D-4122-AA2D-57E0959CE6DB}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppFullName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppComments=末日叙事资源管理 · 绿色安装、可完整卸载
VersionInfoVersion={#MyAppVersion}
VersionInfoProductName={#MyAppName}
VersionInfoDescription={#MyAppFullName} 安装程序
DefaultDirName={localappdata}\Programs\MemorySanctuary
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableWelcomePage=no
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
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "立即启动 {#MyAppName}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; 安装目录内的运行期残留：Neutralino 每次运行都会在程序目录写 neutralinojs.log，
; Inno 只删自己装进去的文件，不删这个 → 不处理会留下空目录 + 日志
Type: files; Name: "{app}\*.log"
Type: filesandordirs; Name: "{app}\EBWebView"
Type: dirifempty; Name: "{app}"

[Code]
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
