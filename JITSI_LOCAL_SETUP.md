# 🎥 دليل إعداد Jitsi المحلي - Dueli Platform

**تاريخ الإنشاء**: 2025-11-29 13:58:30  
**آخر تحديث**: 2025-11-29 13:58:30

---

## 🎯 نظرة عامة

هذا  الدليل يشرح كيفية:
1. ✅ تثبيت Jitsi Meet على جهازك المحلي (Windows)
2. ✅ تحويل جهازك لـ "VPS افتراضي" باستخدام Cloudflare Tunnel
3. ✅ ربط Jitsi بـ YouTube للتسجيل التلقائي
4. ✅ تكامل كل ذلك مع منصة Dueli

**التكلفة الإجمالية**: $0 (مجاني 100%) ✅

---

## 📋 المتطلبات الأساسية

### Hardware
- **CPU**: 2 cores على الأقل (4 cores مفضل)
- **RAM**: 8GB على الأقل (Jitsi + Jibri يحتاجان ~4GB)
- **Hard Disk**: 50GB مساحة حرة (للتسجيلات المؤقتة)
- **Internet**: سرعة upload لا تقل عن 5Mbps

### Software
- Windows 10/11 (64-bit)
- WSL2 (Windows Subsystem for Linux)
- Ubuntu 22.04 LTS (داخل WSL2)
- حساب Cloudflare (مجاني)
- حساب YouTube/Google Cloud (مجاني)

---

## 🚀 المرحلة 1: إعداد WSL2 و Ubuntu

### الخطوة 1.1: تفعيل WSL2

```powershell
# فتح PowerShell كـ Administrator

# تفعيل WSL
wsl --install

# إعادة تشغيل الكمبيوتر
Restart-Computer
```

### الخطوة 1.2: تثبيت Ubuntu 22.04

```powershell
# بعد إعادة التشغيل
wsl --install -d Ubuntu-22.04

# سيطلب منك إنشاء username و password
# احفظهما جيداً!
```

### الخطوة 1.3: تحديث Ubuntu

```bash
# داخل Ubuntu terminal
sudo apt update
sudo apt upgrade -y
```

### الخطوة 1.4: تثبيت الأدوات الأساسية

```bash
sudo apt install -y curl wget git nano net-tools
```

---

## 🎬 المرحلة 2: تثبيت Jitsi Meet

### الخطوة 2.1: إضافة Jitsi Repository

```bash
# تحميل سكريبت التثبيت الرسمي
curl https://download.jitsi.org/jitsi-key.gpg.key | sudo sh -c 'gpg --dearmor > /usr/share/keyrings/jitsi-keyring.gpg'

echo 'deb [signed-by=/usr/share/keyrings/jitsi-keyring.gpg] https://download.jitsi.org stable/' | sudo tee /etc/apt/sources.list.d/jitsi-stable.list > /dev/null

sudo apt update
```

### الخطوة 2.2: تثبيت Jitsi Meet

```bash
# اسم الـ domain سنستخدم localhost مؤقتاً
# سنغيره لاحقاً لـ Cloudflare domain

sudo apt install -y jitsi-meet

# عند السؤال عن hostname:
# أدخل: localhost

# عند السؤال عن SSL certificate:
# اختر: "Generate a new self-signed certificate"
```

### الخطوة 2.3: التحقق من التثبيت

```bash
# التحقق من أن Jitsi يعمل
sudo systemctl status jicofo
sudo systemctl status jitsi-videobridge2
sudo systemctl status prosody

# يجب أن تكون جميعها "active (running)"
```

### الخطوة 2.4: اختبار Jitsi محلياً

1. افتح متصفح Windows على: `http://localhost`
2. يجب أن ترى واجهة Jitsi
3. أدخل اسم غرفة وجرّب البث

---

## ☁️ المرحلة 3: إعداد Cloudflare Tunnel

### الخطوة 3.1: إنشاء حساب Cloudflare

1. زيارة: https://dash.cloudflare.com/sign-up
2. إنشاء حساب مجاني
3. تأكيد البريد الإلكتروني

### الخطوة 3.2: إضافة Domain (اختياري)

**الخيار أ: استخدام domain خاص بك**
```
1. اذهب لـ Cloudflare Dashboard
2. Add Site → أدخل domain الخاص بك
3. اتبع التعليمات لتغيير Nameservers
```

**الخيار ب: استخدام Cloudflare free subdomain**
```
Cloudflare ستوفر لك subdomain مجاني مثل:
dueli.trycloudflare.com
```

### الخطوة 3.3: تثبيت cloudflared في WSL2

```bash
# تحميل cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb

# تثبيت
sudo dpkg -i cloudflared-linux-amd64.deb

# التحقق
cloudflared --version
```

### الخطوة 3.4: تسجيل الدخول

```bash
# هذا سيفتح متصفح للمصادقة
cloudflared tunnel login

# بعد المصادقة، ستحفظ credentials في:
# ~/.cloudflared/cert.pem
```

### الخطوة 3.5: إنشاء Tunnel

```bash
# إنشاء tunnel باسم "dueli-jitsi"
cloudflared tunnel create dueli-jitsi

# سيعطيك tunnel ID، احفظه!
# مثال: a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6
```

### الخطوة 3.6: إعداد الـ Tunnel Config

```bash
# إنشاء ملف config
nano ~/.cloudflared/config.yml
```

**محتوى الملف**:
```yaml
tunnel: dueli-jitsi
credentials-file: /home/YOUR_USERNAME/.cloudflared/TUNNEL_ID.json

ingress:
  # Jitsi web interface
  - hostname: meet.dueli.com
    service: http://localhost:80
  
  # Jitsi Videobridge (WebRTC)
  - hostname: jvb.dueli.com
    service: tcp://localhost:10000
  
  # Catch-all rule (required)
  - service: http_status:404
```

**استبدل**:
- `YOUR_USERNAME` باسم المستخدم في WSL2
- `TUNNEL_ID` بالـ ID الذي حصلت عليه
- `meet.dueli.com` بـ domain الخاص بك

### الخطوة 3.7: ربط DNS

```bash
# ربط subdomain بالـ tunnel
cloudflared tunnel route dns dueli-jitsi meet.dueli.com
cloudflared tunnel route dns dueli-jitsi jvb.dueli.com
```

### الخطوة 3.8: تشغيل الـ Tunnel

```bash
# تشغيل يدوي (للاختبار)
cloudflared tunnel run dueli-jitsi

# يجب أن ترى رسالة:
# "Connection registered connIndex=0"
```

### الخطوة 3.9: اختبار الـ Tunnel

1. افتح متصفح على: `https://meet.dueli.com`
2. يجب أن ترى Jitsi من جهازك المحلي!
3. اختبار من جهاز آخر أو موبايل

### الخطوة 3.10: تشغيل تلقائي عند بدء النظام

```bash
# إنشاء systemd service
sudo nano /etc/systemd/system/cloudflared-tunnel.service
```

**محتوى الملف**:
```ini
[Unit]
Description=Cloudflare Tunnel for Jitsi
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
ExecStart=/usr/local/bin/cloudflared tunnel run dueli-jitsi
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# تفعيل الـ service
sudo systemctl enable cloudflared-tunnel
sudo systemctl start cloudflared-tunnel

# التحقق
sudo systemctl status cloudflared-tunnel
```

---

## 📺 المرحلة 4: ربط YouTube للتسجيل

### الخطوة 4.1: إنشاء قناة YouTube للمنصة

1. زيارة: https://www.youtube.com
2. إنشاء قناة جديدة: "Dueli Platform"
3. تخصيص القناة (صورة، وصف، إلخ)

### الخطوة 4.2: إنشاء Google Cloud Project

1. زيارة: https://console.cloud.google.com
2. Create Project → "Dueli Recordings"
3. تفعيل YouTube Data API v3:
   - APIs & Services → Library
   - بحث عن "YouTube Data API v3"
   - Enable

### الخطوة 4.3: إنشاء OAuth Credentials

```
1. APIs & Services → Credentials
2. Create Credentials → OAuth client ID
3. Application type: Web application
4. Name: "Dueli Jitsi Integration"
5. Authorized redirect URIs:
   - https://project-8e7c178d.pages.dev/api/auth/youtube/callback
   - http://localhost:3000/api/auth/youtube/callback (للتطوير)
6. Create
7. حفظ Client ID و Client Secret
```

### الخطوة 4.4: تثبيت Jibri (للتسجيل)

```bash
# تثبيت Jibri
sudo apt install -y jibri

# تثبيت Chrome (مطلوب لـ Jibri)
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
sudo apt update
sudo apt install -y google-chrome-stable

# تثبيت ChromeDriver
CHROME_DRIVER_VERSION=`curl -sS chromedriver.storage.googleapis.com/LATEST_RELEASE`
wget -N https://chromedriver.storage.googleapis.com/$CHROME_DRIVER_VERSION/chromedriver_linux64.zip -P ~/
unzip ~/chromedriver_linux64.zip -d ~/
sudo mv -f ~/chromedriver /usr/local/bin/chromedriver
sudo chmod +x /usr/local/bin/chromedriver
```

### الخطوة 4.5: تكوين Jibri

```bash
# تعديل config
sudo nano /etc/jitsi/jibri/jibri.conf
```

**التعديلات المطلوبة**:
```hocon
jibri {
  recording {
    recordings-directory = "/srv/recordings"
    finalize-script = "/usr/local/bin/upload-to-youtube.sh"
  }
  
  api {
    http {
      external-api-port = 2222
      internal-api-port = 3333
    }
  }
  
  chrome {
    flags = [
      "--use-fake-ui-for-media-stream",
      "--start-maximized",
      "--kiosk",
      "--enabled",
      "--disable-infobars",
      "--autoplay-policy=no-user-gesture-required"
    ]
  }
}
```

### الخطوة 4.6: سكريبت رفع YouTube

```bash
# إنشاء السكريبت
sudo nano /usr/local/bin/upload-to-youtube.sh
```

**محتوى السكريبت**:
```bash
#!/bin/bash

RECORDING_FILE=$1
COMPETITION_ID=$(echo $RECORDING_FILE | grep -oP '(?<=dueli-comp-)\d+')

# رفع لـ YouTube باستخدام API
# سنكمل هذا الجزء في الكود

# إشعار Backend بانتهاء الرفع
curl -X POST https://project-8e7c178d.pages.dev/api/competitions/$COMPETITION_ID/recording-complete \
  -H "Content-Type: application/json" \
  -d "{\"youtube_url\": \"$YOUTUBE_URL\"}"

# حذف الملف المحلي بعد الرفع
rm -f $RECORDING_FILE
```

```bash
# جعل السكريبت قابل للتنفيذ
sudo chmod +x /usr/local/bin/upload-to-youtube.sh

# إنشاء مجلد التسجيلات
sudo mkdir -p /srv/recordings
sudo chown jibri:jibri /srv/recordings
```

---

## 🔧 المرحلة 5: تكوين Jitsi للتسجيل

### الخطوة 5.1: تفعيل التسجيل في Jitsi

```bash
# تعديل config.js
sudo nano /etc/jitsi/meet/localhost-config.js
```

**إضافة**:
```javascript
// Recording
fileRecordingsEnabled: true,
fileRecordingsServiceEnabled: true,
fileRecordingsServiceSharingEnabled: true,

// Jibri integration
hiddenDomain: 'recorder.localhost',
```

### الخطوة 5.2: تكوين Prosody

```bash
sudo nano /etc/prosody/conf.avail/localhost.cfg.lua
```

**إضافة قبل السطر الأخير**:
```lua
-- Jibri recorder
Component "recorder.localhost" "muc"
    modules_enabled = {
        "muc_meeting_id";
        "muc_domain_mapper";
    }
    muc_room_locking = false
    muc_room_default_public_jids = true
```

### الخطوة 5.3: إعادة تشغيل الخدمات

```bash
sudo systemctl restart prosody
sudo systemctl restart jicofo
sudo systemctl restart jitsi-videobridge2
sudo systemctl restart jibri
```

---

## 🎯 المرحلة 6: الاختبار الكامل

### السيناريو: منافسة كاملة

```bash
# 1. تشغيل الـ Tunnel (إذا لم يكن يعمل)
sudo systemctl start cloudflared-tunnel

# 2. فتح Jitsi من الإنترنت
# زيارة: https://meet.dueli.com

# 3. إنشاء غرفة جديدة
# اسم الغرفة: dueli-comp-test-123

# 4. الانضمام من جهازين مختلفين
# (أو استخدم موبايلك)

# 5. بدء التسجيل
# اضغط على زر Record في Jitsi

# 6. التحدث والتفاعل
# (اختبار الصوت والفيديو)

# 7. إيقاف التسجيل
# اضغط Stop Recording

# 8. التحقق من التسجيل
ls -lh /srv/recordings/

# 9. التحقق من الرفع على YouTube
# (سيتم تلقائياً إذا عمل السكريبت)
```

---

## 🔍 استكشاف الأخطاء (Troubleshooting)

### المشكلة 1: Jitsi لا يعمل

```bash
# التحقق من الخدمات
sudo systemctl status jicofo
sudo systemctl status jitsi-videobridge2
sudo systemctl status prosody

# قراءة الـ logs
sudo journalctl -u jicofo -f
sudo journalctl -u jitsi-videobridge2 -f
```

### المشكلة 2: Cloudflare Tunnel لا يتصل

```bash
# التحقق من الـ tunnel
cloudflared tunnel info dueli-jitsi

# إعادة تشغيل
sudo systemctl restart cloudflared-tunnel

# قراءة الـ logs
sudo journalctl -u cloudflared-tunnel -f
```

### المشكلة 3: Jibri لا يسجل

```bash
# التحقق من Jibri
sudo systemctl status jibri

# الـ logs
sudo journalctl -u jibri -f

# التأكد من الصلاحيات
ls -ld /srv/recordings/
sudo chown -R jibri:jibri /srv/recordings/
```

### المشكلة 4: Chrome/ChromeDriver مشكلة

```bash
# التحقق من الإصدارات
google-chrome --version
chromedriver --version

# يجب أن تكون متطابقة!

# إعادة تثبيت ChromeDriver إذا لزم
```

---

## 📊 المراقبة والصيانة

### مراقبة الموارد

```bash
# استهلاك CPU/RAM
htop

# استهلاك الديسك
df -h

# حجم التسجيلات
du -sh /srv/recordings/
```

### تنظيف التسجيلات القديمة

```bash
# حذف التسجيلات الأقدم من 7 أيام
find /srv/recordings/ -name "*.mp4" -mtime +7 -delete

# يمكن جدولتها مع cron
crontab -e

# إضافة:
0 2 * * * find /srv/recordings/ -name "*.mp4" -mtime +7 -delete
```

### Backup للتكوينات

```bash
# backup دوري للـ configs
mkdir -p ~/jitsi-backup
sudo cp /etc/jitsi/meet/localhost-config.js ~/jitsi-backup/
sudo cp /etc/prosody/conf.avail/localhost.cfg.lua ~/jitsi-backup/
sudo cp /etc/jitsi/jibri/jibri.conf ~/jitsi-backup/
sudo cp ~/.cloudflared/config.yml ~/jitsi-backup/
```

---

## 🚀 الخطوات التالية

بعد إتمام هذا الإعداد:
1. ✅ اختبار شامل لجميع الوظائف
2. ✅ الانتقال لتكامل Jitsi مع Dueli Platform (Backend/Frontend)
3. ✅ اتباع `ROADMAP.md` - المرحلة 2

---

## ⚠️ ملاحظات مهمة

### عن التشغيل المحلي

- **جهازك يجب أن يكون مفتوح دائماً** أثناء المنافسات
- **إنترنت مستقر مطلوب** (Upload 5Mbps+)
- **إدارة الطاقة**: عطّل sleep/hibernate في Windows

### عن التكلفة

- ✅ **كل شيء مجاني** حالياً
- ⚠️ إذا زاد حجم التسجيلات على YouTube، قد تحتاج ترقية
- ⚠️ إذا زاد عدد المنافسات (>5 متزامنة)، جهازك قد لا يكفي

### الانتقال للـ VPS لاحقاً

عندما تريد التوسع:
1. استأجر VPS (Hetzner €4.5)
2. انقل كل التكوينات للـ VPS
3. أطفئ Jitsi المحلي
4. حدّث Cloudflare Tunnel ليشير للـ VPS

---

**آخر تحديث**: 2025-11-29 13:58:30  
**الحالة**: ✅ جاهز للتطبيق
