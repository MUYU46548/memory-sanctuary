#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
记忆圣所 · 稳定发版打包脚本（v0.2.8 重建）

用法:
    python scripts/pack_release.py [--out DIR] [--smoke-run] [--skip-verify]

流程（不依赖 neu CLI，纯标准库）:
    1. 读 version.json → 目标版本
    2. 版本一致性校验：js/main.js GAME_VERSION、index.html 缓存号、desktop-build/neutralino.config.json
       （config.json 版本不一致时自动同步）
    3. 同步游戏文件 → desktop-build/resources（neutralino.js 客户端库保留）
    4. 组装发布目录（目录模式：exe + resources/ + neutralino.config.json，无需 resources.neu）
    5. 打两个包：
       - 玩家包  ms-v{VERSION}-win.zip
       - 网页静态包 memory-sanctuary-v{VERSION}.zip（供本地调试）
    6. 内置验证：zip 完整性 / 解压后 JS 语法 / JSON 解析 / index.html 本地引用存在性 /
       关键 DOM ID / 版本一致性（--skip-verify 跳过）
    7. --smoke-run：启动解压后的 exe，数秒后确认进程存活再关闭（真机冒烟）
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESKTOP = os.path.join(ROOT, 'desktop-build')
GAME_DIRS = ['index.html', 'css', 'js', 'data', 'fonts', 'assets']
EXE_SRC = os.path.join(DESKTOP, 'dist', 'MemorySanctuary', 'MemorySanctuary-win_x64.exe')
EXE_FALLBACK = os.path.join(DESKTOP, 'bin', 'neutralino-win_x64.exe')
NEUTRALINO_JS = os.path.join(DESKTOP, 'resources', 'neutralino.js')
CONFIG_PATH = os.path.join(DESKTOP, 'neutralino.config.json')

# Windows 控制台输出 UTF-8（避免中文/emoji 乱码）
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

KEY_DOM_IDS = [
    'confirm-overlay', 'confirm-title', 'confirm-message', 'confirm-ok', 'confirm-cancel',
    'modal-overlay', 'modal-title', 'modal-content',
    'save-overlay', 'save-slots',
    'title-screen', 'game-container', 'sanctuary-canvas',
    'vn-overlay', 'tutorial-overlay',
    'skip-btn', 'batch-archive-btn', 'explore-btn', 'emergency-btn',
    'project-btn', 'tech-panel', 'atlas-btn', 'log-panel', 'week-progress',
]


def fail(msg):
    print('[FAIL] ' + msg)
    sys.exit(1)


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def run(cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace')


def step(msg):
    print('\n==> ' + msg)


def sync_resources():
    """同步游戏文件到 desktop-build/resources（保留 neutralino.js）"""
    step('同步游戏文件 → desktop-build/resources/')
    res = os.path.join(DESKTOP, 'resources')
    if not os.path.isdir(res):
        os.makedirs(res)
    # 清空游戏相关目录（保留 neutralino.js）
    for name in GAME_DIRS:
        target = os.path.join(res, name)
        if os.path.isdir(target):
            shutil.rmtree(target)
        elif os.path.isfile(target):
            os.remove(target)
        src = os.path.join(ROOT, name)
        if os.path.isdir(src):
            shutil.copytree(src, target)
        else:
            shutil.copy2(src, target)
    # neutralino.js 客户端库缺失时提示（首次需从 neutralino.js 发行版下载）
    if not os.path.isfile(NEUTRALINO_JS):
        fail('desktop-build/resources/neutralino.js 缺失。请先从 '
             'https://github.com/neutralinojs/neutralino.js/releases 下载 v6.9.0 放入该路径。')
    print('    resources/ 就绪（含 neutralino.js）')


def build_packages(version, out_dir, stage):
    """组装发布目录并打两个包。返回 (玩家zip, 网页zip)"""
    step('组装发布目录 & 打包')
    # 玩家包 staging：exe + resources/ + config
    win_stage = os.path.join(stage, 'win')
    res_stage = os.path.join(win_stage, 'resources')
    os.makedirs(win_stage)
    exe_src = EXE_SRC if os.path.isfile(EXE_SRC) else EXE_FALLBACK
    if not os.path.isfile(exe_src):
        fail(f'找不到 Neutralino 运行时：{EXE_SRC} / {EXE_FALLBACK}')
    shutil.copy2(exe_src, os.path.join(win_stage, 'MemorySanctuary-win_x64.exe'))
    shutil.copytree(os.path.join(DESKTOP, 'resources'), res_stage)
    shutil.copy2(CONFIG_PATH, os.path.join(win_stage, 'neutralino.config.json'))

    os.makedirs(out_dir, exist_ok=True)
    win_zip = os.path.join(out_dir, f'ms-v{version}-win.zip')
    web_zip = os.path.join(out_dir, f'memory-sanctuary-v{version}.zip')

    # 玩家包
    with zipfile.ZipFile(win_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(win_stage):
            for f in files:
                full = os.path.join(root, f)
                arc = os.path.relpath(full, win_stage)
                zf.write(full, arc)
    # 网页静态包（纯游戏文件，供 http 服务器调试）
    with zipfile.ZipFile(web_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        for name in GAME_DIRS:
            src = os.path.join(ROOT, name)
            if os.path.isdir(src):
                for root, dirs, files in os.walk(src):
                    for f in files:
                        full = os.path.join(root, f)
                        arc = os.path.relpath(full, ROOT)
                        zf.write(full, arc)
            else:
                zf.write(src, name)
    return win_zip, web_zip


def verify_packages(win_zip, web_zip, version):
    """验证产物：zip 完整性 / JS 语法 / JSON / 引用存在性 / DOM ID / 版本一致性"""
    step('验证产物')
    for zp in (win_zip, web_zip):
        with zipfile.ZipFile(zp) as zf:
            bad = zf.testzip()
            if bad:
                fail(f'{os.path.basename(zp)} 完整性校验失败: {bad}')
        print(f'    ✓ {os.path.basename(zp)} ({os.path.getsize(zp)/1024/1024:.1f} MB)')

    # 解压玩家包做内容级验证
    tmp = tempfile.mkdtemp(prefix='ms-release-verify-')
    with zipfile.ZipFile(win_zip) as zf:
        zf.extractall(tmp)
    res = os.path.join(tmp, 'resources')

    # 1) JS 语法
    js_files = [os.path.join(res, 'js', f) for f in os.listdir(os.path.join(res, 'js')) if f.endswith('.js')]
    node = shutil.which('node')
    if not node:
        print('    ! node 不在 PATH，跳过 JS 语法检查')
    else:
        for jf in js_files:
            r = run([node, '--check', jf])
            if r.returncode != 0:
                fail(f'JS 语法错误: {os.path.basename(jf)}\n{r.stderr[:500]}')
        print(f'    ✓ JS 语法（{len(js_files)} 个文件）')

    # 2) JSON 解析
    json_files = []
    for d in ('data',):
        dpath = os.path.join(res, d)
        if os.path.isdir(dpath):
            json_files += [os.path.join(dpath, f) for f in os.listdir(dpath) if f.endswith('.json')]
    for jf in json_files:
        try:
            load_json(jf)
        except Exception as e:
            fail(f'JSON 解析失败: {os.path.basename(jf)}: {e}')
    print(f'    ✓ JSON 解析（{len(json_files)} 个文件）')

    # 3) index.html 本地引用存在性（css/js/fonts/assets 静态引用）
    html = open(os.path.join(res, 'index.html'), encoding='utf-8-sig').read()
    refs = re.findall(r'(?:src|href)="((?!(?:https?:|//|data:))[^"#]+?)"', html)
    missing = [r for r in refs if not os.path.exists(os.path.join(res, r.split('?')[0]))]
    if missing:
        fail(f'index.html 存在缺失引用: {missing[:5]}')
    print(f'    ✓ 本地引用 {len(refs)} 处全部存在')

    # 4) 关键 DOM ID
    html_ids = set(re.findall(r'id="([^"]+)"', html))
    missing_ids = [i for i in KEY_DOM_IDS if i not in html_ids]
    if missing_ids:
        fail(f'关键 DOM ID 缺失: {missing_ids}')
    print(f'    ✓ 关键 DOM ID（{len(KEY_DOM_IDS)} 个）')

    # 5) 版本一致性（解压包内）
    cfg = load_json(os.path.join(tmp, 'neutralino.config.json'))
    if cfg.get('version') != version:
        fail(f'包内 neutralino.config.json version={cfg.get("version")} != {version}')
    main_js = open(os.path.join(res, 'js', 'main.js'), encoding='utf-8').read()
    m = re.search(r"GAME_VERSION\s*=\s*'([^']+)'", main_js)
    if not m or m.group(1) != version:
        fail(f'包内 GAME_VERSION={m.group(1) if m else "?"} != {version}')
    print(f'    ✓ 版本一致性（{version}）')

    # 6) 数据一致性：archives.vault 引用合法
    vaults = load_json(os.path.join(res, 'data', 'vaults.json'))['vaults']
    vault_ids = {v['id'] for v in vaults}
    arch = load_json(os.path.join(res, 'data', 'archives.json'))['archives']
    bad_vault = [a['id'] for a in arch if a.get('vault') not in vault_ids][:5]
    if bad_vault:
        fail(f'archives.json 存在非法 vault 引用: {bad_vault}')
    print(f'    ✓ 数据一致性（archives {len(arch)} 条 → vaults {len(vaults)} 间）')

    shutil.rmtree(tmp, ignore_errors=True)
    return tmp if os.path.isdir(tmp) else None


def smoke_run(win_zip):
    """真机冒烟：启动解压后的 exe，确认进程存活后关闭"""
    step('真机冒烟测试')
    tmp = tempfile.mkdtemp(prefix='ms-release-smoke-')
    with zipfile.ZipFile(win_zip) as zf:
        zf.extractall(tmp)
    exe = os.path.join(tmp, 'MemorySanctuary-win_x64.exe')
    if not os.path.isfile(exe):
        fail('冒烟测试找不到 exe')
    try:
        proc = subprocess.Popen([exe], cwd=tmp)
        time.sleep(8)
        if proc.poll() is not None:
            fail(f'exe 启动后立即退出，退出码 {proc.returncode} —— 打包产物无法运行！')
        # 确认窗口已创建（MainWindowTitle 来自 neutralino.config.json 的 title）
        r = run(['powershell', '-NoProfile', '-Command',
                 f'(Get-Process -Id {proc.pid} -ErrorAction SilentlyContinue).MainWindowTitle'])
        title = (r.stdout or '').strip()
        if not title:
            fail('exe 进程存活但未创建窗口（MainWindowTitle 为空）—— 疑似白屏或加载失败！')
        print(f'    ✓ 应用进程存活（PID {proc.pid}），窗口已创建: "{title}"')
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        print('    ✓ 已关闭')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description='记忆圣所发版打包')
    ap.add_argument('--out', default=os.path.join(ROOT, 'release'), help='产物目录（默认 <repo>/release）')
    ap.add_argument('--smoke-run', action='store_true', help='打包后真机启动 exe 冒烟')
    ap.add_argument('--skip-verify', action='store_true', help='跳过内置验证')
    args = ap.parse_args()

    # 1. 版本
    vinfo = load_json(os.path.join(ROOT, 'version.json'))
    version = vinfo['version']
    print(f'=== 记忆圣所 发版打包 v{version}（{vinfo.get("releaseDate", "")}）===')
    if not re.match(r'^\d+\.\d+\.\d+$', version):
        fail(f'version.json 版本号非法: {version}')

    # 2. 版本一致性
    step('版本一致性校验')
    main_js = open(os.path.join(ROOT, 'js', 'main.js'), encoding='utf-8').read()
    m = re.search(r"GAME_VERSION\s*=\s*'([^']+)'", main_js)
    if not m or m.group(1) != version:
        fail(f'js/main.js GAME_VERSION={m.group(1) if m else "?"} != {version}（需先同步再打包）')
    print(f'    ✓ js/main.js GAME_VERSION = {version}')
    idx = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    hits = len(re.findall(r'\?v=' + re.escape(version), idx))
    print(f'    ✓ index.html 缓存号 v={version}（{hits} 处）')
    cfg = load_json(CONFIG_PATH)
    if cfg.get('version') != version:
        cfg['version'] = version
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        print(f'    → neutralino.config.json 版本已同步为 {version}')
    else:
        print(f'    ✓ neutralino.config.json = {version}')

    # 3. 同步 resources
    sync_resources()

    # 4. 打包
    stage = tempfile.mkdtemp(prefix='ms-release-stage-')
    try:
        win_zip, web_zip = build_packages(version, args.out, stage)
    finally:
        shutil.rmtree(stage, ignore_errors=True)

    # 5. 验证
    if not args.skip_verify:
        verify_packages(win_zip, web_zip, version)

    # 6. 冒烟
    if args.smoke_run:
        smoke_run(win_zip)

    step('完成')
    print(f'    玩家包: {win_zip}  ({os.path.getsize(win_zip)/1024/1024:.1f} MB)')
    print(f'    网页包: {web_zip}  ({os.path.getsize(web_zip)/1024/1024:.1f} MB)')
    print('    发版提醒：GitHub Release 附件 = 玩家包（面向玩家）；网页包供本地调试用，可选。')


if __name__ == '__main__':
    main()
