# إعداد Vercel لاستضافة ملفات التحديثات

هذا الدليل يشرح كيفية إعداد Vercel لاستضافة ملفات التحديثات التلقائية للتطبيق.

## المتطلبات المسبقة

- حساب على [Vercel](https://vercel.com) (مجاني)
- حساب على [GitHub](https://github.com) (مجاني)
- المشروع موجود على GitHub

## الخطوة 1: إنشاء مجلد للتحديثات

أنشئ مجلد جديد في جذر المشروع:

```bash
mkdir updates
```

## الخطوة 2: إنشاء ملف vercel.json

أنشئ ملف `vercel.json` في جذر المشروع لإعداد Vercel:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "updates/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/updates/(.*)",
      "dest": "/updates/$1",
      "headers": {
        "Cache-Control": "public, max-age=3600, must-revalidate"
      }
    }
  ]
}
```

## الخطوة 3: إنشاء GitHub Action للنشر التلقائي

أنشئ مجلد `.github/workflows` إذا لم يكن موجوداً:

```bash
mkdir -p .github/workflows
```

ثم أنشئ ملف `.github/workflows/deploy-updates.yml`:

```yaml
name: Deploy Updates to Vercel

on:
  push:
    branches:
      - main
    paths:
      - 'package.json'
      - 'electron/**'
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: windows-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build app
        run: npm run build

      - name: Build installer
        run: npm run package:win

      - name: Create updates directory
        run: mkdir -p updates

      - name: Copy files to updates directory
        run: |
          Copy-Item "release\*.exe" -Destination "updates\"
          Copy-Item "release\*.yml" -Destination "updates\"

      - name: Install Vercel CLI
        run: npm install --global vercel@latest

      - name: Pull Vercel Environment Information
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Build Project Artifacts
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Deploy to Vercel
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

## الخطوة 4: إعداد Secrets في GitHub

1. اذهب إلى مستودع GitHub الخاص بك
2. انقر على **Settings** > **Secrets and variables** > **Actions**
3. أضف الأسرار التالية:

### الحصول على Vercel Token

1. سجل الدخول إلى [Vercel](https://vercel.com)
2. اذهب إلى **Settings** > **Tokens**
3. انقر على **Create Token**
4. أدخل اسماً (مثلاً: "GitHub Actions")
5. اختر نطاق التوكين: "Full Account"
6. انقر على **Create**
7. انسخ التوكين

### الحصول على Vercel Org ID و Project ID

**الخيار 1: عبر CLI (الأسرع)**

1. ثبت Vercel CLI:
```bash
npm install -g vercel
```

2. سجل الدخول:
```bash
vercel login
```

3. اربط المشروع:
```bash
vercel link
```

4. احصل على المعرفات:
```bash
vercel project ls
```

**الخيار 2: عبر واجهة Vercel**

1. أنشئ مشروع جديد على Vercel
2. استورد المشروع من GitHub
3. اذهب إلى إعدادات المشروع
4. انسخ `Project ID` من URL أو من الإعدادات
5. اذهب إلى إعدادات الحساب للحصول على `Organization ID`

### إضافة الأسرار في GitHub

أضف الأسرار التالية في GitHub:

- `VERCEL_TOKEN`: التوكين الذي حصلت عليه
- `VERCEL_ORG_ID`: معرف المنظمة
- `VERCEL_PROJECT_ID`: معرف المشروع

## الخطوة 5: تحديث رابط الخادم في المشروع

### في package.json

استبدل رابط الخادم المؤقت برابط Vercel الخاص بك:

```json
{
  "build": {
    "publish": {
      "provider": "generic",
      "url": "https://your-project.vercel.app/updates"
    }
  }
}
```

### في electron/main.cjs

استبدل الرابط بنفس الرابط:

```javascript
autoUpdater.setFeedURL({
  provider: "generic",
  url: "https://your-project.vercel.app/updates",
});
```

استبدل `your-project` باسم مشروعك الفعلي على Vercel.

## الخطوة 6: أول نشر يدوي

قبل النشر التلقائي، دعنا نجرب النشر يدوياً:

### تثبيت Vercel CLI

```bash
npm install -g vercel
```

### ربط المشروع بـ Vercel

```bash
vercel link
```

### نشر يدوي

```bash
# بناء التطبيق
npm run build
npm run package:win

# نسخ الملفات إلى مجلد updates
mkdir updates
cp release/*.exe updates/
cp release/*.yml updates/

# نشر إلى Vercel
vercel --prod
```

## الخطوة 7: اختبار النشر التلقائي

1. قم بتحديث رقم الإصدار في `package.json`:
```json
{
  "version": "0.2.0"
}
```

2. ارسل التغييرات إلى GitHub:
```bash
git add .
git commit -m "Bump version to 0.2.0"
git push origin main
```

3. راقب GitHub Actions للتأكد من نجاح النشر

4. انتظر حتى يكتمل النشر (عادة 2-5 دقائق)

## الخطوة 8: اختبار التحديثات

1. بناء التطبيق وتثبيته على جهازك:
```bash
npm run build
npm run package:win
```

2. تثبيت ملف `.exe` الناتج

3. افتح التطبيق واذهب إلى Settings > App updates

4. اضغط على "Check for updates"

5. يجب أن يظهر التحديث المتاح

## استكشاف الأخطاء

### المشكلة: ملفات التحديثات لا توجد

**الحل**: تأكد من أن GitHub Action ينسخ الملفات بشكل صحيح إلى مجلد `updates/`.

### المشكلة: الرابط 404

**الحل**: تحقق من أن رابط Vercel صحيح وأن الملفات موجودة على الخادم.

### المشكلة: التوكين منتهي الصلاحية

**الحل**: قم بإنشاء توكين جديد في Vercel وحدثه في GitHub Secrets.

### المشكلة: التحديث لا يظهر

**الحل**: 
- تحقق من أن رقم الإصدار في `package.json` أعلى من الإصدار المثبت
- تحقق من أن ملف `latest.yml` يحتوي على رقم الإصدار الصحيح
- تحقق من سجلات التطبيق (Console) لمعرفة الخطأ

## الميزات الإضافية

### إضافة إشعارات Slack

يمكنك إضافة إشعار Slack عند نجاح النشر:

```yaml
- name: Notify Slack
  if: success()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: 'Update deployed successfully!'
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### إضافة إصدارات متعددة

يمكنك الاحتفاظ بالنسخ القديمة في مجلدات منفصلة:

```
updates/
├── v0.1.0/
│   ├── setup.exe
│   └── v0.1.0.yml
├── v0.2.0/
│   ├── setup.exe
│   └── v0.2.0.yml
└── latest.yml
```

## الدعم

إذا واجهت أي مشاكل:
- [توثيق Vercel](https://vercel.com/docs)
- [توثيق GitHub Actions](https://docs.github.com/en/actions)
- [توثيق electron-updater](https://www.electron.build/auto-update)
