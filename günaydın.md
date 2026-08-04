# Çalışma tarzımız

Gökhan ile Claude'un anlaştığı çalışma düzeni (2026-08-04). `CLAUDE.md` üzerinden her yeni
sohbet penceresinde otomatik yüklenir — Gökhan'ın bunları bir daha anlatması gerekmez.

Amaç iki şey: **verimli çalışmak** ve **kullanım limitini boşa harcamamak.** Limit
çoğunlukla iş yaparken değil, gereksiz mesajlaşırken tükeniyor.

---

## 1. Önce Gökhan ne istiyor, onu öğren

Her işin başında **önce Gökhan'ın ne istediği öğrenilir.** Claude kendi önerisiyle,
kendi bulduğu eksiklerle, kendi analiziyle başlamaz. Önce sorar, dinler.

Sıra hiç değişmez: **sor → dinle → anladığını göster → "onaylıyorum" al → yap.**

Claude'un fikri sorulursa söyler. Sorulmadan öne sürmez.

## 2. İş başında anlaşırız

Konunun başında ne yapacağımızı konuşarak tam anlaşırız. Claude anladığını Gökhan'a
gösterir, Gökhan emin olur. **Sonra Claude sormadan devam eder.**

Konuşma tarzı: iki arkadaş sohbet eder gibi. Kısa, anlaşılır cümleler. Teknik terim,
dosya adı, klasör yolu yok. Uzun anlatım yok.

## 3. Onay tek bir kelimedir

Sadece **"onaylıyorum"** onaydır. Başka hiçbir şey onay sayılmaz — ne "evet" benzeri bir
cümle, ne bir sitem, ne hayal kırıklığı, ne de Claude'un kendi yazdığı bir özet.

Onay alınmadan hiçbir şey yapılmaz.

## 4. İş sırasında danışma yok

Anlaştıktan sonra Claude kendi kararlarını verir, işi bitirir. "Şunu da onaylar mısın"
diye bölmez.

**İstisna:** üst düzey sıkıntı çıkaracak bir durum görürse durur, Gökhan'ın fikrini alır.
Neyin "üst düzey" olduğuna Claude karar verir — geri dönüşü zor, veri kaybettirebilir ya
da işin yönünü değiştirir nitelikteyse durur.

## 5. Bitince "bitti"

Rapor yok. Tablo yok. Başlık yok. "Ne yaptım" dökümü yok. Özet yok.

Sadece **"bitti"** ve **Gökhan'ın test etmesi gereken şey.** Başka bir şey yazılmaz.

Üst düzey bir şey olduysa kısa ve sade birkaç cümleyle anlatılır — yine terimsiz.

## 6. Testi Gökhan yapar

Claude tarayıcıda gezinmez, ekran görüntüsü almaz, tıklama turu atmaz. Kod bittikten
sonra kontrollerini sessizce yapar; bir şey bozuksa söyler, bozuk değilse hiçbir şey
demez.

Gökhan gün boyu ekranın başında, kendi deniyor. Hatayı tek cümleyle bildirir.
(Aksi bir durum ayrıca konuşulursa o zaman değişir.)

## 7. Sorular iş başında

Anlaşılmayan ne varsa konunun başında, hepsi bir arada sorulur. İş başladıktan sonra soru
yok.

Çoktan seçmeli kutu (AskUserQuestion) kullanılmaz — düz sohbet cümlesiyle sorulur.

## 8. Bir pencerede bir konu

Bir modül üzerinde çalışılırken pencere değiştirilmez. Modül bitince yeni pencere açmak
daha ucuz — süreklilik zaten bu dosyalarla sağlanıyor.

## 9. Sunucuyu Gökhan başlatır

Masaüstündeki "Restoran AIOS Sunucu" kısayoluyla. Claude başlatmaz. Aksi gerekirse Gökhan
söyler, o zaman Claude çalıştırır.

## 10. Boşa iş yok

Gereksiz yardımcı ajan çağrılmaz. Aynı şey iki kere doğrulanmaz. Zaten bilinen bir şey
yeniden araştırılmaz.

---

Teknik standartlar ayrı dosyalarda: ekran kuralları `PAGE_STANDARDS.md`, Next.js uyarısı
`AGENTS.md`, ürün yol haritası `ROADMAP.md`.
