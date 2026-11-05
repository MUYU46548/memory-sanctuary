# MIT License

Copyright (c) 2026 Memory Sanctuary / 暮雨

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 第三方依赖与许可

### 字体：霞鹜文楷 (LXGW WenKai)

Copyright (c) 2021, FLAKE (f'laker), with Reserved Font Name "LXGW WenKai".

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL

#### SIL Open Font License Version 1.1 — 26 February 2007

**PREAMBLE**
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
font names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

**DEFINITIONS**
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting — in part or in whole — any of the components of the
Original Version, by changing formats or by porting the Font Software to
a new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

**PERMISSION & CONDITIONS**
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use study, copy, merge, embed, modify,
redistribute, and sell unmodified and modified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) without explicit written permission from the Copyright Holder.
This restriction only applies to the primary font name as presented to
the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to endorse or promote products derived from
the Font Software without prior written permission from the Copyright
Holder.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created using
the Font Software.

**TERMINATION**
This license becomes null and void if any of the above conditions are
not met.

**DISCLAIMER**
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE FONT SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE FONT SOFTWARE.

---

## 音乐

游戏中的背景音乐由本地 AI 音乐项目「松涛真韵」生成，为原创生成内容，未使用任何第三方版权曲库素材。

音频文件为原创生成内容，可自由使用。

---

## 桌面发行组件（仅安装包内含，网页版不含）

安装包（`ms-<版本>-setup.exe`）除本作代码与素材外，还打包下列第三方组件，各自适用其原始许可：

| 组件 | 用途 | 许可 |
|------|------|------|
| Neutralinojs runtime / client（`MemorySanctuary-win_x64.exe`、`neutralino.js`） | 桌面窗口与资源加载 | MIT |
| Microsoft Edge WebView2 Runtime | 页面渲染内核（系统自带或由安装引导安装） | Microsoft 软件许可条款（可再分发运行时） |
| Inno Setup 6 | 生成 Windows 安装程序 | Inno Setup License（允许自由分发由其生成的安装包） |
| ChineseSimplified.isl | Inno Setup 简体中文语言包 | MIT（kira-96/Inno-Setup-Chinese-Simplified-Translation） |

本作代码本身仍为上文 MIT 许可；上述组件的许可只约束组件自身，不改变本作许可。

## 隐私与联网

- 游戏**不收集、不上传**任何个人信息、遥测或存档内容。
- 存档、设置、字体缓存全部保存在本机：
  - 桌面版：`%APPDATA%\MemorySanctuary-win_x64.exe`（存档 + 设置 + WebView2 缓存）
  - 网页版：浏览器 `localStorage` 与 Cache API
- 启动时以及手动「检查更新」时，会访问 GitHub 公共接口（`api.github.com` / `github.com`）查询最新版本号；
  请求只带常规 HTTP 头，不含个人数据。断网或请求失败时游戏照常运行，只是不提示更新。
- 卸载时是否删除存档由玩家选择，默认保留。

---

## 游戏内容

绒花计划IP系列作品。

游戏名称“记忆圣所”、角色名称、故事情节、游戏机制均为原创内容。

© 2026 暮雨
