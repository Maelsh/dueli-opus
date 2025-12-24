# دليل النشر الكامل - Deployment Guide

## 📋 المتطلبات

- [x] سيرفر مع SSH access
- [x] Node.js 18+ installed
- [x] PM2 installed globally
- [x] Apache with mod_proxy, mod_ssl
- [x] coturn package (optional)

---

## 🚀 خطوات النشر

### 1. على جهازك المحلي

```bash
# 1. انتقل للمشروع
cd D:\projects\opus-dueli\webapp\streaming-server

# 2.  ثبت المكتبات
npm install

# 3. اختبر محلياً
npm run dev
# افتح: http://localhost:3000/health

# 4. بناء للإنتاج
npm run build
```

---

### 2. رفع على السيرفر (SSH)

```bash
# اتصل بالسيرفر
ssh maelshpr@maelsh.pro

# أنشئ المجلد
mkdir -p ~/streaming-server
cd ~/streaming-server

# ارفع الملفات
# (استخدم SFTP أو scp)
```

**أو** - استخدم Git:
```bash
cd ~/streaming-server
git init
git remote add origin https://github.com/YOUR-USERNAME/dueli-streaming-server.git
git pull origin main
```

---

### 3. إعداد البيئة

```bash
# على السيرفر
cd ~/streaming-server

# انسخ ملف البيئة
cp .env.example .env
nano .env
```

**عدّل `.env`**:
```env
PORT=3000
NODE_ENV=production
STREAMING_API_KEY=YOUR-SECRET-KEY-HERE-MIN-32-CHARS
PLATFORM_URL=https://project-8e7c178d.pages.dev
TURN_SECRET=your-turn-secret
```

**احفظ** (Ctrl+X → Y → Enter)

---

### 4. تثبيت Dependencies

```bash
cd ~/streaming-server
npm install --production
```

---

### 5. تشغيل بـ PM2

```bash
# تثبيت PM2
npm install -g pm2

# تشغيل
pm2 start ecosystem.config.js

# حفظ لإعادة التشغيل التلقائية
pm2 save
pm2 startup

# التحقق
pm2 status
pm2 logs streaming-server
```

---

### 6. إعداد Apache

```bash
# انسخ الملف
sudo cp config/apache-streaming.conf /etc/apache2/sites-available/streaming.conf

# عدّل ليطابق سيرفرك
sudo nano /etc/apache2/sites-available/streaming.conf
```

**غيّر**:
- `ServerName stream.maelsh.pro`
- مسارات SSL certificates

```bash
# فعّل الـ modules
sudo a2enmod proxy proxy_http proxy_wstunnel ssl rewrite

# فعّل الـ site
sudo a2ensite streaming

# اختبر التكوين
sudo apache2ctl configtest

# أعد تشغيل Apache
sudo systemctl reload apache2
```

---

### 7. إعداد coturn (اختياري)

```bash
# تثبيت
sudo apt install coturn
# أو
sudo yum install coturn

# انسخ التكوين
sudo cp config/turnserver.conf /etc/turnserver.conf

# عدّل
sudo nano /etc/turnserver.conf
```

**غيّر**:
```
external-ip=YOUR_SERVER_PUBLIC_IP
static-auth-secret=YOUR-TURN-SECRET
```

```bash
# فعّل وشغّل
sudo systemctl enable coturn
sudo systemctl start coturn

# التحقق
sudo systemctl status coturn
```

---

## 🧪 الاختبار

### اختبار Hono Server

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","uptime":...}

# من الخارج
curl https://stream.maelsh.pro/health
```

### اختبار WebSocket

```bash
# تثبيت wscat
npm install -g wscat

# اختبار
wscat -c wss://stream.maelsh.pro/signaling?room=test&role=host
```

### اختبار coturn

```bash
turnutils_stunclient turn.maelsh.pro 3478
```

---

## 🔄 النشر التلقائي (GitHub Actions)

### 1. إعداد GitHub Secrets

في GitHub Repo → Settings → Secrets:

```
CPANEL_FTP_HOST = maelsh.pro
CPANEL_FTP_USER = your-ftp-user
CPANEL_FTP_PASSWORD = your-ftp-password
CPANEL_FTP_PORT = 21
CPANEL_SERVER_DIR = /home/maelshpr/streaming-server
CPANEL_SSH_USER = maelshpr
CPANEL_SSH_PASSWORD = your-ssh-password
```

### 2. Push للنشر

```bash
git add .
git commit -m "Update streaming server"
git push origin main
# ← GitHub Actions ينشر تلقائياً!
```

---

## 📊 المراقبة

```bash
# PM2 status
pm2 status
pm2 monit

# Logs
pm2 logs streaming-server --lines 100

# Apache logs
tail -f /var/log/apache2/streaming-error.log

# coturn logs
tail -f /var/log/turnserver.log
```

---

## 🛠️ Troubleshooting

### المشكلة: Port already in use
```bash
# اكتشف ما يستخدم المنفذ
lsof -i :3000
# أو
netstat -tulpn | grep 3000

# أوقفه
pm2 stop streaming-server
```

### المشكلة: Permission denied
```bash
# تحقق من الصلاحيات
ls -la ~/streaming-server
chmod -R 755 ~/streaming-server
```

### المشكلة: WebSocket not connecting
```bash
# تحقق من Apache modules
sudo apache2ctl -M | grep proxy
# يجب أن ترى: proxy_module, proxy_wstunnel_module

# تحقق من logs
tail -f /var/log/apache2/streaming-error.log
```

---

## ✅ Checklist

- [ ] Node.js Server يعمل (port 3000)
- [ ] PM2 يعمل و Auto-restart enabled
- [ ] Apache proxy يعمل (port 443)
- [ ] SSL certificates صالحة
- [ ] coturn يعمل (port 3478)
- [ ] WebSocket يتصل
- [ ] GitHub Actions configured
- [ ] `.env` محدث بالـ secrets الصحيحة
