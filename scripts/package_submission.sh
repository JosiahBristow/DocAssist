#!/usr/bin/env bash
# 打包提交材料：./scripts/package_submission.sh 负责人姓名
# 用 python3 zipfile 打包（本机没有 zip 命令）
set -e
NAME="${1:-王启志}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="AI应用大赛+文献助手+${NAME}.zip"
cd "$ROOT"

echo "→ 检查材料是否齐全"
for f in "docs/文献助手-作品说明书.docx" "docs/文献助手-评审汇报.pptx"; do
  [ -f "$f" ] || { echo "缺少: $f"; exit 1; }
done
[ -f "docs/体验版二维码.png" ] || echo "⚠ 还没放体验版二维码截图（docs/体验版二维码.png），建议补上"
APK="app-android/release/文献助手-1.0.0.apk"
[ -f "$APK" ] || echo "⚠ 还没放 Android 安装包（$APK）"

python3 - "$ZIP" <<'PY'
import os, sys, zipfile

zip_name = sys.argv[1]
if os.path.exists(zip_name):
    os.remove(zip_name)

files = [
    "docs/文献助手-作品说明书.docx",
    "docs/文献助手-评审汇报.pptx",
    "docs/演示脚本.md",
    "docs/试用记录表.csv",
    "docs/rules.json",
    "docs/部署与提交清单.md",
    "docs/安装说明-Android.md",
    "app-android/release/文献助手-1.0.0.apk",
    "README.md",
    "project.config.json",
    "package.json",
    ".env.example",
    "app-android/package.json",
    "app-android/build.js",
    "app-android/capacitor.config.json",
    "app-android/make_icons.py",
]
dirs = ["miniprogram", "cloudfunctions", "shared", "local-preview", "test", "scripts",
        "app-android/src", "app-android/www"]
skip_dirs = {"node_modules", "__pycache__", ".git", "build", "release", ".gradle", "tmp"}
skip_files = {".env", ".DS_Store"}
skip_ext = {".log", ".pyc"}


def add(zf, path):
    if os.path.isdir(path):
        for base, subdirs, names in os.walk(path):
            subdirs[:] = [d for d in subdirs if d not in skip_dirs]
            for n in names:
                if n in skip_files or os.path.splitext(n)[1] in skip_ext:
                    continue
                add(zf, os.path.join(base, n))
    elif os.path.exists(path):
        zf.write(path, path)


with zipfile.ZipFile(zip_name, "w", zipfile.ZIP_DEFLATED) as zf:
    for f in files:
        if os.path.exists(f):
            add(zf, f)
        else:
            print("  skip missing:", f)
    for d in dirs:
        if os.path.isdir(d):
            add(zf, d)

size = os.path.getsize(zip_name) / 1024 / 1024
print("  打包完成: %s  %.1f MB" % (zip_name, size))
PY

echo "→ 邮件主题与压缩包名保持一致：${ZIP%.zip}"
echo "→ 发送至 yhai4nudt@163.com（截止 10/30 23:59）"
