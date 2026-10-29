# 文献助手（DocAssist）

面向校园真实场景的 AI 文献工具：**论文速读 · 参考文献格式校对 · 学术翻译**。
微信小程序（原生）+ 微信云开发，2026 年 AI 应用创新大赛参赛作品。

## 目录结构

```
docassist/
├── miniprogram/            小程序前端（原生）
│   ├── pages/index         首页（三个入口 + 使用统计）
│   ├── pages/read          论文速读（上传 PDF → 结构化摘要）
│   ├── pages/cite          参考文献格式校对（GB/T 7714-2015 规则引擎）
│   ├── pages/translate     学术翻译（术语先对齐，再逐段翻译）
│   └── utils/gb7714.js     规则引擎副本（由 scripts/sync.js 生成）
├── cloudfunctions/docai/   云函数：PDF 解析 + 大模型调用
├── shared/                 共享核心代码（单一事实来源）
│   ├── gb7714.js           参考文献规则引擎（纯规则，可离线运行）
│   ├── refconvert.js       外文体例识别与转国标（ACL/IEEE → GB/T 7714）
│   └── docai-core.js       大模型调用、PDF 解析、参考文献段抽取
├── app-android/            Android 客户端（Capacitor 壳，可打包成 APK）
│   ├── src/                页面逻辑 + pdf.js 封装 + 浏览器端模型调用
│   ├── www/                前端资源（index.html + esbuild 产物 app.js）
│   └── android/            Capacitor 生成的 Android 工程
├── local-preview/          本地 Web 复刻版（无小程序账号也能演示/自测）
├── test/                   规则引擎回归测试
└── docs/                   作品说明书、汇报 PPT、演示脚本
```

## 三步跑起来

### 1. 本地自测（不需要小程序账号）

```bash
cd ~/Documents/docassist
npm install
npm run preview             # 浏览器打开 http://127.0.0.1:5178
```

打开后点首页「API 设置」，粘贴你自己的 DeepSeek Key → 测试连接 → 保存（只存浏览器 localStorage）。
不填也能用：格式校对为真实计算，速读/翻译返回示例数据。
（可选）想用 .env 给服务端兜底：`cp .env.example .env` 后填 `DEEPSEEK_API_KEY`。

### 2. 小程序端

1. 微信开发者工具 → 新建项目 → 目录选 `~/Documents/docassist`（AppID 填自己的；
   没有可先用「测试号」跑通页面，发布体验版必须有自己的 AppID）。
2. 打开「云开发」→ 新建环境（基础版免费）。
3. 右键 `cloudfunctions/docai` → **上传并部署：云端安装依赖**。
4. 云开发控制台 → 云函数 → `docai` → 配置：
   - 超时时间：**60 秒**（默认 3 秒会超时）
   - 环境变量：**不需要配**（作品为 BYOK，密钥由用户在小程序「API 设置」里自填）
     - 只有在团队自测、想给评委留共享额度时才配 `DEEPSEEK_API_KEY`（会用团队额度，慎用）
5. 云开发 → 数据库 → 新建集合 `papers`（可选，仅用于历史记录；不建也能跑）。
6. 点击「预览」→ 手机扫码即用；「上传」→ 版本管理 → 设为体验版，生成体验二维码给评审。

### 3. Android 客户端（APK）

同一份 `shared/` 代码，换个壳就能装到手机上：格式校对离线可用，PDF 解析在本地做，AI 由用户自带的 Key 直连。

```bash
cd ~/Documents/docassist/app-android
npm install                # @capacitor/* + pdfjs-dist + esbuild
node build.js              # shared/ + src/ → www/app.js（含 pdf.js worker）
npx cap sync android       # 同步 web 资源到 Android 工程

# 需要 JDK 17+ 与 Android SDK（platforms;android-34、build-tools;34.0.0）
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

装到手机：

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
# 或直接把 apk 拷进手机点击安装（需允许"未知来源"）
```

> Android 端与小程序端的差别：没有云函数、没有数据库。PDF 用 pdf.js 在本机解析（按坐标重建行结构，
> 否则整页挤成一行，"参考文献"标题就定位不到），模型调用走原生 HTTP（CapacitorHttp），不受跨域限制。

### 4. 提交材料

```bash
npm run sync                # 改过 shared/ 后必须执行
```

## 关键设计

- **BYOK（用户自带密钥）**：AI 功能用用户自己的 DeepSeek Key，只存本机；云函数仅在内存中转发，
  不落库、不写日志、异常信息自动抹除密钥。格式校对完全不经过模型，也就不需要任何密钥。
- **规则引擎不依赖大模型**：GB/T 7714 校验有 18 条规则，纯本地计算，秒出结果、断网可用、结果可复现；
  大模型只负责"读不懂"的部分（摘要、翻译），失败不影响格式校对。
- **术语先对齐再翻译**：先抽 12–20 个术语建表，翻译时作为强约束注入，解决同一术语前后译法漂移。
- **PDF → 参考文献联动**：解析时自动定位"参考文献"段落并按编号切分，一键进入格式校对——
  这是学生写课程论文最痛的一步。
- **双端同源**：`shared/` 是唯一实现，小程序（WXML）与 Android（HTML）各自做界面，
  规则引擎、外文体例转换、提示词两端完全一致，结果可交叉验证。
- **外文体例转国标（`shared/refconvert.js`）**：识别 ACL/EMNLP 与 IEEE 体例（年份在末尾、作者用 and 连接、
  题名与出处被 PDF 黏连），解析字段后按 GB/T 7714 重写——外文作者改为「姓 名缩写」（`Jimmy Lei Ba` → `Ba J L`），
  >3 人加 `et al.`，arXiv 预印本转 `[EB/OL]` 并补访问日期与 abs 链接。
  回归：*Attention is all you need* 全文 38 条参考文献 38/38 转换成功，0 条误判为国标错误。
- **扫描版识别**：文本层过少的 PDF 直接返回 `SCANNED_PDF`，不拿空文本硬喂模型。

## 已知限制

- AI 功能需用户自备 API Key（设置页内置 30 秒获取引导）；格式校对不受影响。
- 不支持扫描版 PDF（无 OCR）。
- 单文件 ≤ 20MB；超长论文按 6 段 map-reduce 摘要，可能损失细节。
- 规则引擎覆盖 GB/T 7714 常见条目类型；部分期刊内部细则（如作者姓名缩写方式）不判定。
