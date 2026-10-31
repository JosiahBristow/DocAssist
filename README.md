# 文献助手（DocAssist）· Android

面向校园真实场景的 AI 文献工具：**论文阅读 · 原文标注 · 参考文献格式校对 · 学术翻译**。

Android 客户端基于 Capacitor + WebView，PDF 在本机解析，格式校对完全离线，AI 功能使用用户自己的 API Key（BYOK），不依赖任何自建服务器。

## 功能

### 论文阅读

- 打开 PDF 后立即渲染原文，速读结果在后台生成
- 六个 Tab：**原文 / 要点 / 结构 / 术语 / 相似 / 译文**
- 按钮缩放、双指捏合（1×–3×，桌面 Ctrl+滚轮）
- 划词翻译：选中段落直接调用模型，单次请求，不抽术语、不分段
- 选中小浮条：高亮 / 翻译 / 问 AI，不再用全宽面板挡住正文

### 标注

- **高亮**：选中文字点「高亮」，可加备注；点高亮处可修改备注或「删除高亮」
- **画笔**：浮动侧栏「笔」进入批注模式，单指书写、双指平移页面
  - 4 档粗细、6 种预置色 + HSV 自定义调色
  - 颜色以 sRGB 十六进制存储，预置色对白纸的 WCAG 对比度均 ≥ 4.5:1
  - 自定义色低于 4.5:1 时禁止应用，并提供「自动加深」
  - 支持撤销与橡皮
- 标注按文件指纹（文件名 + 大小 + 内容哈希）保存在本机 localStorage，重开自动恢复
- **导出**：
  - 标注版 PDF：高亮与墨迹用 pdf-lib 写回原文件，Android 通过系统分享面板保存
  - Markdown 笔记：复制或下载当前全部标注

### 相似论文

- 从速读结果的标题与关键词出发，生成知网 / 万方 / 维普 / 百度学术 / Google 学术的预填检索链接
- 同时按标题从 OpenAlex / Crossref 拉取公开元数据，可在应用内展开标题、作者、年份、被引与摘要
- 结果按标题缓存 24 小时

### AI 助手

- 右下角浮动侧栏随时打开对话面板
- 原文划词后可点「问 AI」，选中文字作为上下文随问题发送
- 可引用当前页（把页面截图作为图片）或从相册附图
- 对话保留最近 8 轮上下文，可一键清空

### 参考文献格式校对

- 内置 GB/T 7714-2015 规则引擎，18 条规则纯本地计算，秒出结果、断网可用
- 支持外文体例（ACL / EMNLP / IEEE）自动转国标：外文作者改为「姓 名缩写」，>3 人加 `et al.`，arXiv 预印本转 `[EB/OL]`
- 从 PDF 自动定位「参考文献」段落并按编号切分，一键进入校对

### 其他

- 最近打开：PDF 与元数据存本机 IndexedDB，最多 6 篇 / 120MB
- 纸色 / 夜间主题、中英文界面，均可持久化
- 浮动侧栏：问（AI 助手）/ 笔（批注）/ 译（全文翻译）/ 夜·日（主题）/ EN·中（语言）

## 项目结构

```
DocAssist/
├── app-android/                Android 客户端
│   ├── src/                    页面逻辑、原文预览、AI 助手、PDF 解析
│   ├── www/                    前端资源（index.html + esbuild 产物 app.js）
│   ├── android/                Capacitor 生成的 Android 工程
│   ├── release/                已构建的 APK
│   ├── build.js                esbuild 打包脚本
│   └── package.json
├── shared/                     核心代码（单一事实来源）
│   ├── gb7714.js               参考文献规则引擎
│   ├── refconvert.js           外文体例识别与转国标
│   ├── refsection.js           参考文献段抽取与文本清洗
│   ├── preview-core.js         原文预览内核（渲染/选区/高亮/画笔/标注存储）
│   ├── pdf-export.js           标注版 PDF 生成（pdf-lib）
│   ├── search-links.js         相似论文：检索链接 + OpenAlex/Crossref 归一化
│   ├── library.js              本地论文库（IndexedDB）
│   ├── color.js                画笔颜色（sRGB ↔ HSV/HSL + WCAG 对比度）
│   ├── llm-common.js           提示词与大模型调用公共逻辑
│   └── ui-i18n.js              中英文界面文案
├── test/                       规则引擎、标注、导出等回归测试
├── docs/
│   └── 安装说明-Android.md     安装与首次使用说明
├── README.md
└── LICENSE
```

## 构建 APK

环境要求：

- Node.js 18+
- JDK 17 或 21
- Android SDK：platforms;android-34、build-tools;34.0.0

```bash
cd app-android
npm install
node build.js                # shared/ + src/ → www/app.js（含 pdf.js worker）
npx cap sync android         # 同步 Web 资源到 Android 工程

cd android
./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

安装到手机：

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

也可以直接把 APK 拷进手机点击安装（需允许「未知来源」）。

## 测试

```bash
npm install
npm test
```

覆盖：GB/T 7714 规则、外文体例转换、标注存储、搜索链接归一化、AI 消息组装、本地论文库容量策略、画笔颜色、标注版 PDF 导出。

## 关键设计

- **BYOK（用户自带密钥）**：AI 功能使用用户自己的 DeepSeek（或任意 OpenAI 兼容服务）Key，只存本机；应用不经过自建服务器，不落库、不写日志
- **规则引擎不依赖大模型**：GB/T 7714 校验纯本地计算，断网可用、结果可复现；大模型只负责摘要与翻译
- **PDF 本机解析**：pdf.js 按坐标重建行结构，否则整页会挤成一行，「参考文献」标题就无法定位
- **标注本机保存**：高亮与墨迹按文件指纹存 localStorage，论文本体存 IndexedDB，不上传服务器
- **标注版 PDF**：pdf-lib 把高亮矩形与画笔线段按页面坐标写回原 PDF，生成独立文件
- **单一事实来源**：规则、提示词、预览内核、颜色工具都放在 `shared/`，Android 打包时统一引用

## 已知限制

- 扫描版 PDF 不支持（无 OCR）
- 单文件 ≤ 25MB；超长论文按 6 段 map-reduce 摘要，可能损失细节
- AI 功能需用户自备 API Key；格式校对不受影响
- 相似论文依赖 OpenAlex / Crossref 公开元数据，中文文献覆盖有限；知网 / 万方等平台链接需自行登录，应用只生成检索链接
- AI 助手的图片提问需要支持视觉的模型；DeepSeek 文本模型会拒绝图片请求
- 规则引擎覆盖 GB/T 7714 常见条目类型，部分期刊内部细则不判定

## 许可证

见 [LICENSE](LICENSE)。
