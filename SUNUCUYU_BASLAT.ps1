# Restoran AIOS - dev sunucusunu tek tikla baslatir.
# Masaustundeki "Restoran AIOS Sunucu" kisayolu bu dosyayi calistirir.
#
# Neden .bat yerine .ps1: eski SUNUCUYU_BASLAT.bat icinde ag IP'si SABIT yaziyordu
# (192.168.1.103). Modem her yeniden baslatildiginda IP degisiyor, telefondaki link
# olu kaliyordu. Burada IP her acilista yeniden bulunuyor.

$proje = 'C:\gokhanerdemprojeler\restoran-aios'
$port  = 3001
$slug  = 'test-restorani'   # gunluk deneme isletmesi; canli veri 'merkez' slug'inda

$Host.UI.RawUI.WindowTitle = 'Restoran AIOS Sunucu'
Set-Location -LiteralPath $proje

# Ag IP'si: varsayilan ag gecidi olan, acik durumdaki ilk adaptor.
# (Wi-Fi kapaliysa ya da kablo cikmissa null kalir - asagida uyari veriliyor.)
$ip = $null
try {
  $cfg = Get-NetIPConfiguration |
    Where-Object { $null -ne $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
    Select-Object -First 1
  if ($cfg) { $ip = $cfg.IPv4Address.IPAddress }
} catch { }

function Write-Linkler {
  Write-Host ''
  Write-Host '  PC       : ' -ForegroundColor DarkGray -NoNewline
  Write-Host "http://localhost:$port/?r=$slug" -ForegroundColor Cyan
  if ($ip) {
    Write-Host '  Telefon  : ' -ForegroundColor DarkGray -NoNewline
    Write-Host "http://${ip}:$port/?r=$slug" -ForegroundColor Cyan
  } else {
    Write-Host '  Telefon  : ag IP bulunamadi - Wi-Fi bagli mi?' -ForegroundColor Yellow
  }
  Write-Host ''
}

# Sunucu zaten aciksa IKINCISINI baslatma: Next.js o zaman baska bir porta kaciyor,
# telefondaki link tutmuyor ve iki surec ayni .next klasorune yaziyor.
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  Write-Host ''
  Write-Host "  Sunucu ZATEN calisiyor (port $port) - yenisi baslatilmadi." -ForegroundColor Green
  Write-Linkler
  Write-Host '  Yeniden baslatmak istersen once eski sunucu penceresini kapat.' -ForegroundColor DarkGray
  Write-Host ''
  return
}

Write-Host ''
Write-Host '  Restoran AIOS sunucusu baslatiliyor...' -ForegroundColor Green
Write-Host '  BU PENCEREYI KAPATMA - sunucu bu pencerede calisiyor.' -ForegroundColor Yellow
Write-Linkler

# -H 0.0.0.0 : sadece bu PC degil, ayni Wi-Fi'daki telefon da baglanabilsin diye.
npm run dev -- -p $port -H 0.0.0.0

Write-Host ''
Write-Host '  Sunucu durdu.' -ForegroundColor Yellow
Write-Host ''
