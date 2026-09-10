# CLI Notes — أدوات سطر الأوامر المتوفرة

## GitHub CLI (`gh`)

| البند | التفاصيل |
|---|---|
| المسار | `C:\Program Files\GitHub CLI\gh.exe` |
| الإصدار | v2.100.0 |
| المصادقة | ✅ مُصادق كـ `Maelsh` |
| PATH | ✅ مُضاف للـUser PATH بشكل دائم |

### الاستخدام
في PowerShell، إذا لم يعمل `gh` مباشرة (جلسة قديمة)، استخدم:
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH', 'User')
```

أو استخدم المسار الكامل:
```powershell
& 'C:\Program Files\GitHub CLI\gh.exe' <command>
```

### إنشاء PR
```powershell
gh pr create --base main --head <branch> --title "<title>" --body-file .github/pr-body-<id>.md
```

### التحقق من المصادقة
```powershell
gh auth status
```

إذا ظهرت رسالة "not logged in"، شغّل:
```powershell
gh auth login
```
