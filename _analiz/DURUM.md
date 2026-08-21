# Claude Code çalışma düzeni — durum analizi ve yeniden yapılandırma planı

## Context — bu iş neden yapılıyor

Kurallar bugün üç ayrı yerde duruyor (proje md dosyaları, iki ayrı otomatik hafıza klasörü,
bir de hiç var olmayan global CLAUDE.md), birbirini tekrar ediyor, bir kısmı eskimiş, ve
**hiçbiri zorlayıcı değil** — hepsi "Claude umarım uyar" seviyesinde. Transkript kaydı bunun
sonucunu gösteriyor: aynı davranış (onay almadan başlama, kapsamı sessizce büyütme) en az
beş ayrı oturumda düzeltilmiş. Amaç: kuralları tek kaynağa indirmek, atlanması kabul
edilemeyenleri talimattan koda (hook) taşımak, geri kalanı tetiklenince yüklenen skill'e
çekmek.

---

## 0. Önce netleşmesi gereken iki gerçek

**A) Bu oturum boş bir klasörde çalışıyor.**
Çalışma dizini `C:\Users\Gökhan Alp Erdem\OneDrive\Belgeler\restoran-aios` — klasör **tamamen boş**,
git deposu da değil. Asıl proje `C:\gokhanerdemprojeler\restoran-aios`. Yani bu oturumda
proje `CLAUDE.md`'si, `günaydın.md`, `AGENTS.md`, `AJANLAR.md` — **hiçbiri yüklenmedi.**
Kurallar "çalışmıyor" hissinin bir kısmı doğrudan bu.

**B) İki ayrı otomatik hafıza klasörü var, ikisi de dolu, içerikleri farklı.**

| Klasör | İçerik | Bu oturumda yüklenen |
|---|---|---|
| `~/.claude/projects/C--Users-...-OneDrive-...-restoran-aios/memory/` | 20 satırlık MEMORY.md, RZV/No63/FUTTA/Vercel kayıtları, en güncel | ✅ evet |
| `~/.claude/projects/C--gokhanerdemprojeler-restoran-aios/memory/` | 13 satırlık MEMORY.md + **`calisma-tarzi-gokhan.md` (11 KB, en değerli davranış kaydı)** | ❌ hayır |

İkincisindeki `calisma-tarzi-gokhan.md`, "onay almadan başlama" ihlallerinin tarih tarih
dökümünü tutuyor (2026-07-13, 07-14, 07-25 ×2). Asıl proje klasöründen çalışıldığında **bu
yüklenir, diğerleri yüklenmez.** İki depo birleştirilmeden hangi kuralın geçerli olduğu
oturumdan oturuma değişiyor.

---

## 3.1 Envanter

### Kullanıcı seviyesi — `~/.claude/`

| Dosya | Satır | Ne işe yarıyor | Her oturumda otomatik yükleniyor mu |
|---|---|---|---|
| `CLAUDE.md` | — | **YOK** | — |
| `claude.md.txt` | 0 | Boş, adı yanlış (`.txt`). Claude Code bu adı hiç okumaz | Hayır |
| `settings.json` | 17 | `Bash(*)`, `Read/Edit/Write`, Supabase MCP tam izin; workflows açık; tema light | Evet (ayar) |
| `settings - Kopya.json` | 16 | settings.json'ın eski kopyası, `agentPushNotifEnabled` eksik. Claude Code okumaz | Hayır |
| `keybindings.json` | ~10 | Klavye kısayolları | Evet (ayar) |
| `policy-limits.json` | 12 | Kuruluş politikası, sistem üretti | Evet (ayar) |
| `commands/` | — | **YOK** | — |
| `agents/` | — | **YOK** | — |
| `skills/` | — | **YOK** | — |
| `hooks/` | — | **YOK** | — |
| `plugins/` | — | Sadece resmî marketplace önbelleği; **kurulu eklenti yok** | Hayır |
| `projects/*/memory/` | 20 + 13 | İki ayrı otomatik hafıza (bkz. §0-B) | MEMORY.md'nin ilk 200 satırı |

### Proje seviyesi — `C:\gokhanerdemprojeler\restoran-aios`

| Dosya | Satır | Ne işe yarıyor | Her oturumda otomatik yükleniyor mu |
|---|---|---|---|
| `CLAUDE.md` | 4 | Sadece üç `@import`: günaydın, AGENTS, AJANLAR | Evet |
| `günaydın.md` | 91 | Çalışma tarzı — 10 madde (onay, "bitti", soru disiplini…) | Evet (import) |
| `AGENTS.md` | 6 | Next.js sürüm uyarısı (otomatik üretilmiş blok) | Evet (import) |
| `AJANLAR.md` | 45 | Paralel ajan düzeni kuralları + dokunulmaz dosya listesi | Evet (import) |
| `PAGE_STANDARDS.md` | 73 | Ekran kuralları — "her yeni ekranda otomatik uygulanır" | ❌ **HAYIR** |
| `BUSINESS_LOGIC.md` | 67 | İş kuralları | ❌ Hayır |
| `.claude/launch.json` | 11 | Dev sunucu tanımı — **port 3000** | Evet (araç) |
| `.claude/worktrees/salon/` | — | Terk edilmiş worktree kopyası (kendi node_modules'ı ile) | Hayır |
| `ROADMAP.md` | 594 | Ürün yol haritası | Hayır |
| `VISION.md` / `YOL-HARITASI-KARARLAR.md` | 93 / 101 | Vizyon, alınmış kararlar | Hayır |
| `TEST-RAPORU.md` | 343 | Test geçmişi | Hayır |
| `ARASTIRMA.md` / `ARASTIRMA-2-GECE-KULUBU.md` | 797 / 734 | Pazar araştırması | Hayır |
| `README.md` | 37 | Proje tanıtımı | Hayır |
| `CLAUDE.local.md` | — | **YOK** | — |
| `.mcp.json` / `.claudeignore` / `.claude/settings.json` / `.claude/rules/` | — | **YOK** | — |
| `AGENTS.md` (kök) dışında `PROJE_KURALLARI.md`, `KARARLAR.md`, `BEKLEYENLER.md` | — | **YOK** | — |

**Her oturumda yüklenen toplam: ~146 satır kural** (4 + 91 + 6 + 45). Bu sayı fena değil —
asıl sorun satır sayısı değil, **yanlış 146 satır** olması: `AJANLAR.md`'nin 45 satırı
kullanılmayan bir düzeni anlatıyor, `PAGE_STANDARDS.md`'nin 73 satırı ise hiç yüklenmiyor.

---

## 3.2 Kural tablosu

### `günaydın.md`

| Kural | Etiket | Gerekçe |
|---|---|---|
| 1. Önce Gökhan ne istiyor öğren; Claude kendi önerisiyle başlamaz | GLOBAL | Projeden bağımsız, kişisel çalışma tarzı |
| 2. İş başında anlaş, anladığını göster, sonra sormadan devam | GLOBAL | Aynı |
| 3. Onay tek kelime: "onaylıyorum" | **İZİN (ask)** + GLOBAL | Atlanması kabul edilemez; en çok ihlal edilen kural (§3.4). Geri dönülemez işler `permissions.ask` ile sorar; kapsam yargısı GLOBAL kalır |
| 4. İş sırasında danışma yok, istisna: üst düzey sıkıntı | GLOBAL | Kontrol edilebilir: sonuca bakıp bölünüp bölünmediği görülür |
| 5. Bitince sadece "bitti" + test edilecek şey | GLOBAL | Çıktıdan doğrudan kontrol edilebilir |
| 6. Testi Gökhan yapar; Claude tarayıcıda gezinmez | GLOBAL | Araç kullanımından kontrol edilebilir |
| 7. Sorular iş başında, hepsi bir arada; AskUserQuestion yok | GLOBAL | Kontrol edilebilir |
| 8. Bir pencerede bir konu | GLOBAL | Gökhan'ın kendi davranışı — kural olarak kalsın, kısa |
| 9. Sunucuyu Gökhan başlatır | **SİL — tersine döndü** | 2026-08-21 kararı: Claude sohbete girildiğinde sunucuyu sessizce başlatır. Üç yerden de silinir |
| 10. Boşa iş yok: gereksiz alt ajan, tekrar doğrulama yok | GLOBAL | Kontrol edilebilir |
| Başlıktaki "2026-08-04 anlaşması / CLAUDE.md üzerinden yüklenir" açıklaması | **SİL** | Meta-açıklama, davranış üretmiyor |

### `AJANLAR.md`

| Kural | Etiket | Gerekçe |
|---|---|---|
| "Paralel düzen denendi, tek pencereye dönüldü" durum tablosu | **SİL** | Eskimiş: salon worktree'si boşta, düzen kullanılmıyor |
| 1. Bir sayfa = bir ajan | SKILL | Sadece paralel ajan açılırsa geçerli — tetiklenene kadar yüklenmesin |
| 2. Sadece kendi dosyalarına dokun | SKILL | Aynı |
| 3. Ortak dosya/DB değişikliğinde dur | **İZİN (ask)** | `Edit(**/supabase/migrations/**)` vb. sorar — ajan olsun olmasın |
| 4. Onay almadan yazma | **SİL (tekrar)** | `günaydın.md` §3 ile birebir aynı |
| 5. Sunucuyu sen başlatma | **SİL (tekrar)** | `günaydın.md` §9 ile aynı |
| 6. Başlamadan günaydın.md + PAGE_STANDARDS.md oku | **SİL** | Kontrol edilemez ("okudum" denir, doğrulanamaz). Yerine: rules/ ile otomatik yükle |
| 7. Bitince sadece "bitti" | **SİL (tekrar)** | `günaydın.md` §5 ile aynı |
| Dokunulmaz dosya listesi (`app/components/`, `lib/`, `globals.css`, `masaOlcu/masaPlan`, `supabase/migrations/`) | PROJE | Somut yol listesi, projeye ait, paylaşılabilir |
| "Brif yazarken onay cümlesi açıkça geçmeli" notu | SKILL | Sadece ajan brifi yazılırken lazım |

### `PAGE_STANDARDS.md`

| Kural | Etiket | Gerekçe |
|---|---|---|
| 1. Tek ekran, scroll yok + `flex:1 / overflowY / minHeight:0` üçlüsü | **RULE** (`paths: app/**/*.tsx`) | Sadece ekran dosyası açılınca lazım; hep yüklü durmasın |
| 1b. Her "ekle" formunda Enter ile kaydet | **RULE** | Aynı — üç ekranda tekrarlanmış hata, somut |
| 2. Tek Kaydet | **RULE** | Somut |
| 3. Satır tabanlı liste | **RULE** | Somut |
| 4. Akordeon/gruplu yapı | **RULE** | Somut |
| 5. Çift tıkla düzenleme (`EditableText.tsx`) | **RULE** | Somut, dosya adı veriyor |
| 6. Büyük/küçük harf (`lib/text.ts`) | **RULE** | Somut, fonksiyon adı veriyor |
| 7. Görsel kimlik, CSS değişkenleri, hardcoded hex yok | **RULE** | Somut |
| 8. RPC vs client insert, soft delete | PROJE | Mimari karar, her oturumda bilinmeli |
| 9. Mobil + masaüstü, müşteri sayfaları server component | **RULE** | Somut |
| 10. Yeni/değişen sayfa HTTP 200 + derleme kontrolünden geçer | **HOOK (Stop)** | "Yaptım" denip atlanabilen tek kural — koda taşınmalı |
| 11. Referans sayfa: rezervasyon listesi | **RULE** | Tasarım kararlarının çapası |
| "İstatistikler ekranı bu kuralı denedi ve geri döndü" anlatısı | SKILL/arşiv | Geçmiş kaydı, kural değil — 5 satır bağlam yiyor |

### Otomatik hafıza

| Kural | Etiket | Gerekçe |
|---|---|---|
| `calisma-tarzi-gokhan.md` (11 KB, ihlal geçmişi) | GLOBAL'e özet + SKILL'e tam metin | Özü GLOBAL'e 5 satır; tarihli olay dökümü tetiklenince okunsun |
| İki MEMORY.md'nin ortak satırları (vizyon, pazar, e-adisyon, FUTTA…) | Tek MEMORY.md | Bkz. §3.3 |
| `iki-kopya-uyarisi.md` | LOCAL | Makineye özel yol sorunu |

### Ayarlar

| Kural | Etiket | Gerekçe |
|---|---|---|
| `settings.json`: `Bash(*)` + `Write` + `Edit` tam izin | **Değiştir** | "Onay almadan yapma" kuralının tam tersini makineye söylüyor |
| `settings - Kopya.json` | **SİL** | Claude Code okumaz, kafa karıştırır |
| `claude.md.txt` (0 bayt) | **SİL** | Boş ve yanlış adlı |
| `.claude/launch.json` port 3000 | **Düzelt → 3001** | Hafıza ve masaüstü kısayolu 3001 diyor |
| `.claude/worktrees/salon/` | **SİL (onayla)** | Terk edilmiş kopya; ayrı `node_modules` taşıyor |

---

## 3.3 Çakışmalar

**Tekrar eden kurallar**

| Kural | Kaç yerde | Nerede |
|---|---|---|
| Onay almadan yazma | 4 | `günaydın.md` §3, `AJANLAR.md` §4, `calisma-tarzi-gokhan.md`, iki MEMORY.md satırı |
| Sunucuyu Gökhan başlatır | 3 | `günaydın.md` §9, `AJANLAR.md` §5, `sunucuyu-gokhan-baslatir.md` |
| Bitince sadece "bitti" | 2 | `günaydın.md` §5, `AJANLAR.md` §7 |
| AskUserQuestion kullanma | 2 | `günaydın.md` §7, `calisma-tarzi-gokhan.md` |
| Tasarım referansı = rezervasyon sayfası | 2 | `PAGE_STANDARDS.md` §11, `tasarim-dili-referans.md` |
| Rezervasyon ürün hedefi / vizyon | 2 | İki MEMORY.md'de ayrı ayrı |

**Çelişenler**

| Çelişki | Hangisi kazanmalı | Neden |
|---|---|---|
| `günaydın.md` §6 "Claude tarayıcıda gezinmez, ekran görüntüsü almaz" ↔ `PAGE_STANDARDS.md` §10 "her sayfa HTTP 200 kontrolünden geçer" | İkisi de — ama ayrı yazılmalı | Çelişki değil, sınır belirsizliği: **curl/derleme kontrolü Claude'un işi, tarayıcı turu Gökhan'ın.** Tek cümlede birleştirilmeli |
| `.claude/launch.json` port **3000** ↔ hafıza + kısayol port **3001** | 3001 | Gökhan'ın masaüstü kısayolu 3001; "olmadı" dendiğinde ilk bakılan yer port (`hangi-kopyaya-bakiyor.md`) |
| Proje yolu: hafıza "`C:\gokhanerdemprojeler`, OneDrive gündem dışı" ↔ oturum OneDrive'da açılıyor | gokhanerdemprojeler | Boş OneDrive klasöründe kural yüklenmiyor (§0-A) |
| `günaydın.md` §7 "AskUserQuestion kullanılmaz" ↔ plan kipinin kendi akışı AskUserQuestion'a yönlendiriyor | Gökhan'ın kuralı | Üç kez reddedilmiş, dördüncüde açıkça yasaklanmış |
| `PAGE_STANDARDS.md` §8 "bu projede basit CRUD client insert" ↔ "Angora'da her şey RPC" | Proje kuralı | Zaten dosyada bilerek not edilmiş; iki projeyi ayrı tutan bu satır kalmalı |

**Eskimişler**

| Kural | Neye göre eskimiş |
|---|---|
| `AJANLAR.md` paralel ajan düzeni (45 satırın ~30'u) | Dosyanın kendisi "tek pencereye dönüldü" diyor (2026-08-10) |
| `AJANLAR.md` kopya tablosu (salon / 3002) | Worktree boşta, işi asıl projeye alınmış |
| `günaydın.md` başlığındaki "2026-08-04 anlaşması" çerçevesi | Tarih artık bağlam üretmiyor |
| `settings - Kopya.json` | `agentPushNotifEnabled` eklendikten sonra kalmış |

---

## 3.4 Davranış analizi

**Kaynak:** son 10 transkript (`~/.claude/projects/C--Users-...-restoran-aios/`), düzeltme
kalıbı taraması → 44 eşleşme. Bunların bir kısmı sıkıştırma sonrası tekrarlanan aynı oturum
(`21d66b9d` = `e720d088`, `7d1e634e` = `372d74af`), yani **~6 farklı oturum**. Ayrıca
`calisma-tarzi-gokhan.md` tarihli ihlal dökümü kullanıldı.

| # | Tekrarlanan düzeltme | Kaç oturum | Örnek | Nereye ait |
|---|---|---|---|---|
| 1 | **Onay almadan / kapsamı büyüterek işe başlama** | ≥5 (07-13, 07-14, 07-25 ×2, 08-19) | "onaylamadım konuşuyoruz" · "kafana göre bişey yapma, benimle konuş ben karar veririm sen uygularsın" · "bişey kur demedim sana ne kuruyosun" | **İZİN (ask)** — talimat 4 dosyada var ve yine ihlal ediliyor; talimat katmanı bu kuralda tükendi. Ölçülebilen kısmı (push, migration, kurulum, silme, ortak dosya) izin kuralına, kapsam yargısı GLOBAL'e |
| 2 | **Düzeltilmiş bir şeyin tekrar bozulması (regresyon)** | 3 | "yine bozdun" · "bu hataları düzeltmiştik ama farklı yön verince algoritma yine şaşırdı" · "taşmalar oluyor, bunlara engel olmuştuk ama proje ayırınca tekrar karşılaştık" | **HOOK (Stop)** — dönüş bitmeden `tsc --noEmit` + (sunucu açıksa) sayfa kontrolü |
| 3 | **İsteği yanlış anlayıp yazmaya başlama** | 3 | "hizmet eklemede yanlış anlamışsın" · "bak tekrar anlatayım yanlış bişey yapma" · "akışta bi yanlışlık var, beraber kurgulayalım" | **GLOBAL** — "yazmadan önce anladığını tek paragrafla göster" (günaydın §2 zaten var, kısaltılıp öne alınmalı) |
| 4 | **AskUserQuestion kullanımı** | ≥3 kez reddedilmiş, sonra bir oturumda 6 kez daha kullanılmış | "iki kişi sohbet eder gibi konuşalım" | **İZİN (deny)** — talimat üç kez yazıldı, dördüncüde yine ihlal edildi; tek çare mekanik engel |
| 5 | **İş kuralının yeniden anlatılması** (yedek/walk-in, kapasite +1, masa birleştirme yönü) | 3 | "hayır o kuralı ben koydum, 4 kişilik masaya 5 kişi oturabilir" · "yedekler gün içinde iptal olanların yerinedir, kapıda beklemez" | **SKILL/rules** — `BUSINESS_LOGIC.md` yüklenmiyor; kural her seferinde ağızdan tekrarlanıyor |
| 6 | **Hangi kopyaya/porta bakıldığı karışıklığı** | 2 | "hayır telefon linki pc de açmıyor" | **LOCAL** + launch.json düzeltmesi |

**Gereksiz tur/token yiyen kalıplar**

| Kalıp | Kanıt | Çözüm |
|---|---|---|
| Sıkıştırma sonrası aynı işin baştan anlatılması | Son 10 dosyanın 4'ü "This session is being continued…" ile başlıyor, iki çift birebir aynı içerik | **HOOK** — `SessionStart` + `compact` matcher, açık dosya/iş özetini geri bas |
| Gereksiz alt ajan / plan dosyası | `calisma-tarzi-gokhan.md` 07-25: "gereksiz Explore subagent'i çağırdı, keşif sohbeti sürerken plan dosyası yazdı" | GLOBAL (günaydın §10 kalsın, kısalsın) |
| Ekran kuralının hatırlanmaması → sonradan düzeltme turu | `PAGE_STANDARDS.md` hiç yüklenmiyor; §1b'de "üç ayrı ekranda aynı hata tekrarlandı" yazıyor | **`.claude/rules/` + `paths:`** — `.tsx` açılınca otomatik yüklensin |

---

## 3.5 Onay kapısı ve hook'lar

> **Düzeltme (Gökhan, bu oturum).** İlk taslak onay kapısını iki kez kuruyordu: bir hook
> (`onay-kapisi.ps1`, transkripti tarayıp "onaylıyorum" arayan) **ve** aynı komutlar için
> `permissions.deny`. İkisi de yanlıştı — `deny` "asla" demek, sen onay verdikten sonra da
> keser; transkript taraması ise sıkıştırmada kesilen kayıtta yanlış karar verir.
>
> Doğru mekanizma **`permissions.ask`**. Bir küçük düzeltme: `escalate` bir *hook çıktı*
> değeridir, `settings.json`'a yazılamaz; ayarlardaki karşılığı `ask` kovasıdır. Etkisi
> istenen davranışın aynısı — doğrulandı: *"Explicit ask rules still force a prompt"*
> (auto mode'da bile sorar), üstelik *"a matching ask rule still prompts even when the hook
> returned `allow`"*. Script yok, transkript taraması yok, tekrar yok.

### A) İzin kuralları — `~/.claude/settings.json` (hook değil)

| Kural | Kova | Davranış |
|---|---|---|
| `Bash(git push*)` | **ask** | Her seferinde sorar; "onaylıyorum" dersen geçer |
| `mcp__*__apply_migration` | **ask** | Aynı |
| `Bash(npm i*)`, `Bash(npm install*)` | **ask** | Aynı |
| `Bash(rm*)`, `Bash(mv*)` | **ask** | Aynı |
| `Edit(**/supabase/migrations/**)`, `Edit(**/app/globals.css)` | **ask** | Nadiren dokunulan, geri dönüşü zor iki yer |
| `AskUserQuestion` | **ask** | Mekanik hatırlatma kalır, Plan Mode tıkanmaz. 15. adımda davranışı gözlenecek: plan akışını bozmuyorsa `deny`'a çıkarılır, bozuyorsa `ask`'te kalır |
| — | **deny** | **Deny listesi boş.** Sunucu başlatma komutları serbest bırakıldı (yeni kural sessizce başlatmayı gerektiriyor) |

Notlar: ask/deny kuralları `**/` ile her derinlikte eşleşir, allow kuralları eşleşmez —
yollar bu yüzden `**/` ile yazıldı. Kalıpların gerçekten tuttuğu kurulumdan sonra tek tek
denenecek (özellikle `Bash(npm run dev*)`, argümansız `npm run dev`'i de yakalamalı).

**`lib/` ve `app/components/` ask listesinden çıkarıldı (Gökhan).** Tek pencerede en çok
dokunulan iki dizin; her düzenlemede soran bir kural birkaç turda "geç geç"e döner ve kural
değerini yitirir. Bunlar yerine `.claude/rules/ortak-dosyalar.md` yazılıyor: o dizindeki bir
dosya okunduğunda bağlama giren, "bu dosya bütün ekranların ortak malı, değişiklik hepsini
birden etkiler, sonucu söyle" diyen bir kural. Ask kovasında sadece gerçekten nadir ve geri
dönüşü zor iki yer kalıyor.

### B) Gerçekten kod isteyen iki hook

| Olay | Ne yapacak | Çıkış kodu | Neden izin kuralı yetmez |
|---|---|---|---|
| **Stop** | **1)** `git diff --name-only` — `.ts`/`.tsx` değişmemişse hiçbir şey çalıştırma. **2)** Değişmişse `tsc --noEmit`. **3)** HTTP 200 kontrolü sadece **`app/**/page.tsx` değişmişse** ve 3001 portu cevap veriyorsa; sunucu kapalıysa atla ve "sunucu kapalı, sayfa kontrolü yapılmadı" notu düş | Kod hatası varsa `exit 2`; kod değişmemişse, sayfa değişmemişse veya sunucu kapalıysa `exit 0` | İzin kuralı bir şey *çalıştıramaz* |
| **SessionStart** (matcher: `compact`) | Açık işin ve dokunulan dosyaların 5–10 satırlık özetini stdout'a bas | `exit 0`, düz metin (bu olayda bağlama eklenir) | Sıkıştırma sonrası iş baştan anlatılıyor; doğru olay bu, `PostCompact` değil |

**PostToolUse çıkarıldı (Gökhan).** Stop hook aynı kontrolü zaten yapıyordu; her düzenleme
sonrası `tsc`+eslint saf süre yüküydü. Tek yerde, tur sonunda, bir kez.

**Stop hook kendini kilitlemesin ve boşuna çalışmasın (Gökhan).** Üç kapı var:
`git diff` kapısı — sohbet turu, plan turu, sadece md düzenlemesi gibi turlarda hook hiçbir
şey çalıştırmadan çıkar. Sayfa kapısı — `lib/` veya bir bileşen düzenlendiğinde `tsc` yeter,
HTTP kontrolüne hiç girilmez; sayfa kontrolü yalnızca `app/**/page.tsx` değiştiyse çalışır.
Port kapısı — sunucuyu Gökhan başlatıyor ve başka bir kural
Claude'un başlatmasını yasaklıyor; koşulsuz HTTP kontrolü sunucu kapalıyken her turda
başarısız olur ve dönüşü bitirtmez, yani kilit. `npm run build` (30–90 sn) her turdan
çıkarıldı, sadece `/goal` bitiş koşulunda kaldı. Ek emniyet: Claude Code'un Stop hook'ları
için bir engelleme üst sınırı var — ama buna güvenilmeyecek, koşullar baştan doğru yazılacak.

**Dürüst sınır.** Bu düzen geri dönülemez işleri (push, migration, kurulum, silme, ortak
dosya) güvenle yakalar. Ama **"kapsamı sessizce büyütme"** davranışı mekanik olarak
ölçülemez — o kısım GLOBAL kural olarak kalır. "Kural koyduk, artık olmaz" denmeyecek.

**Plan kipi uyarısı.** `AskUserQuestion` deny olsaydı plan kipinin kendi akışı tıkanırdı.
Bu yüzden `ask`'te başlıyor — soru kutusu açılmadan önce Gökhan'a sorulur, yani kural
mekanik olarak hatırlatılmış olur ama akış kilitlenmez. Kararı 15. adımdaki gözlem verir.

---

## 3.6 İş akışı eşleştirmesi

| İş tipi | Araç | Gerekçe |
|---|---|---|
| Yeni modül/ekran kurgusu (rezervasyon akışı, personel yetkileri gibi) | **Plan Mode** | Konuşarak anlaşma aşaması zaten var; salt okunur kip yazmayı fiilen engeller |
| "Şu ekranı düzelt" gibi net, sınırlı iş | **Auto mode + Stop hook** | Sınıflandırıcı niyeti denetler, Stop hook doğruluğu; ikisi olmadan tek başına auto yetmez |
| Uzun düzeltme turu (bir sayfada 5–6 küçük hata) | **`/goal`** | Bitiş hâli doğrulanabilir: "`npm run build` hatasız + şu 4 sayfa HTTP 200" |
| Vercel/deploy sonucunu bekleme | **`/loop`** | Harici durum yoklama; `/goal` bitirmek için, `/loop` izlemek için |
| Riskli deneme (masa birleştirme algoritması gibi tekrar tekrar bozulan iş) | **worktree** | Asıl kopya bozulmaz; `.worktreeinclude` ile `.env.local` taşınır. Not: mevcut `salon` worktree'si önce temizlenmeli |
| "Yanlış sohbeti geri aldım" durumu | **rewind** (ESC ESC) | Transkriptte bir kez yaşandı; "buraya kadar özetle" seçeneği uzun kurulum aşamasını sıkıştırır |
| Gece/planlı işler (bağımlılık denetimi, test turu) | **routines (`/schedule`)** | Şu an böyle bir iş yok — Faz 2'ye bırakılsın, şimdi kurulmasın |
| Günlük varsayılan izin kipi | **auto** | `Bash(*)` + `Write` tam allow listesinden çıkılıp sınıflandırıcıya devredilmeli |
| Gözetimsiz çalıştırma (ileride) | **dontAsk** | Soracak kimse yokken listede olmayan sessizce reddedilir |

**Auto mode + Stop hook eşleşmesi:** sınıflandırıcı **niyeti** denetler — istenenin ötesine
geçen, üretimi hedefleyen, dışarı veri gönderen hareketleri keser. **Doğruluğu denetlemez:**
bozuk bir masa-birleştirme algoritması tehlikeli olmadığı için sınıflandırıcıdan sorunsuz
geçer. "Yine bozdun" sınıfı hataları yalnızca Stop hook yakalar. İkisi birlikte kurulacak,
tek başına biri kurulmayacak.

Bir ek bulgu: dokümana göre sınıflandırıcı, **sohbette söylenen sınırları** ("şunu yapma",
"ben onaylamadan geçme") blok sinyali sayıyor — ama bu sınırlar sıkıştırmada kaybolabiliyor.
Kalıcı garanti için `permissions.deny` kuralı veya hook gerekiyor. Bu, §3.5'teki hook
önerisini destekliyor.

---

## 3.7 Hedef yapı

```
~/.claude/
├── CLAUDE.md                        ← YENİ · hedef ≤ 40 satır (GLOBAL)
│                                       günaydın.md §1,2,4,5,6,7,8,10 + calisma-tarzi özeti
├── settings.json                    ← DÜZENLE · Bash(*)/Write/Edit allow kaldırılır,
│                                       defaultMode: "auto", §3.5-A ask/deny kuralları,
│                                       hook yolları tırnak içinde tam yol olarak
├── hooks/                           ← 2 dosya (ilk taslakta 6 idi: üçü izin kuralına döndü,
│   │                                   PostToolUse tamamen çıktı)
│   ├── bitmeden-dogrula.ps1         ← YENİ · ~40 satır (Stop; git diff kapısı → tsc →
│   │                                   koşullu HTTP 200)
│   └── sikistirma-sonrasi.ps1       ← YENİ · ~15 satır (SessionStart:compact)
├── skills/
│   ├── claude-code-kurulum/         ← YENİ (§5, hakem skill)
│   │   ├── SKILL.md                 ← ~25 satır
│   │   └── reference/01..09-*.md    ← 9 dosya, tek seferde yazılır
│   └── dogrulama/                   ← **FAZ 2** · ~30 satır (test çalıştır, diff oku,
│                                       testin zayıflatılmadığını kontrol et, kanıtla)
├── claude.md.txt                    ← SİL (boş, yanlış ad)
└── settings - Kopya.json            ← SİL (okunmuyor)

C:\gokhanerdemprojeler\restoran-aios\
├── CLAUDE.md                        ← YENİDEN YAZ · hedef ≤ 50 satır (PROJE)
│                                       @AGENTS.md importu + proje mimarisi +
│                                       dokunulmaz dosya listesi + RPC/soft-delete kararı
├── CLAUDE.local.md                  ← YENİ · hedef ≤ 20 satır (LOCAL, .gitignore'a eklenir)
│                                       port 3001, sunucu kısayolu, Vercel/test hesabı,
│                                       "asıl kopya gokhanerdemprojeler" notu
├── .claude/
│   ├── launch.json                  ← DÜZELT · port 3000 → 3001
│   ├── rules/
│   │   ├── ekran-standartlari.md    ← YENİ · ~55 satır, paths: app/**/*.tsx
│   │   │                               (PAGE_STANDARDS.md §1–7, 9, 11)
│   │   ├── veri-kurallari.md        ← YENİ · ~20 satır, paths: supabase/**
│   │   │                               (PAGE_STANDARDS §8 + BUSINESS_LOGIC özü)
│   │   └── ortak-dosyalar.md        ← YENİ · ~12 satır, paths: lib/**, app/components/**
│   │                                   (ask kuralından buraya döndü — AJANLAR.md'nin
│   │                                    "dokunulmaz dosyalar" listesi)
│   ├── skills/                      ← **FAZ 2**
│   │   ├── paralel-ajan/SKILL.md    ← ~25 satır (AJANLAR.md'nin yaşayan kısmı)
│   │   └── is-kurallari/SKILL.md    ← ~15 satır + reference/ (BUSINESS_LOGIC.md)
│   └── worktrees/salon/             ← SİL (onay alınarak)
├── günaydın.md                      → İÇERİĞİ TAŞINIR (~/.claude/CLAUDE.md) · dosya SİL
├── AJANLAR.md                       → BÖLÜNÜR (proje CLAUDE.md + paralel-ajan skill) · SİL
├── PAGE_STANDARDS.md                → TAŞINIR (.claude/rules/) · SİL
├── BUSINESS_LOGIC.md                → TAŞINIR (skill reference/) · SİL
├── AGENTS.md                        ← KALIR (6 satır, otomatik üretilen blok)
└── _arsiv/                          ← YENİ klasör
    ├── ROADMAP.md, VISION.md, YOL-HARITASI-KARARLAR.md,
    ├── TEST-RAPORU.md, ARASTIRMA*.md   (import edilmez, gerektiğinde okunur)
```

**Otomatik hafıza:** iki klasör tek klasörde birleşir (`C--gokhanerdemprojeler-restoran-aios`).
Birleşik `MEMORY.md` hedefi ≤ 25 satır; `calisma-tarzi-gokhan.md` özü GLOBAL CLAUDE.md'ye
çıkar, tarihli olay dökümü memory dosyası olarak kalır.

**Her oturumda yüklenen yeni toplam:** ~40 (global) + ~50 (proje) + ~20 (local) + ~25
(MEMORY.md) + 6 (AGENTS) ≈ **140 satır** — bugünküyle aynı, ama tamamı yürürlükteki kural.
Ekran kuralları (~55) ve iş kuralları (~20) artık `.tsx`/`supabase` dosyasına dokunulduğunda
yükleniyor, boşuna değil.

---

## 3.8 Uygulama adımları

### Faz 1 kapsamı

Global CLAUDE.md · proje CLAUDE.md · CLAUDE.local.md · `.claude/rules/` üç dosya ·
`settings.json` izin kuralları · iki hook · hafıza temizliği · `claude-code-kurulum`
skill'i · launch.json portu · `_arsiv/` taşıması · doğrulama · silme.

**Faz 2'ye bırakılanlar (Gökhan):** `dogrulama`, `paralel-ajan`, `is-kurallari` skill'leri.
`claude-code-kurulum` Faz 1'de kalıyor — kurulum sırasında aramızda bir kural anlaşmazlığı
çıkarsa hakem o olacak, sonraya bırakılırsa işe yaramaz.

### Sıra

1. **Yedek.** `cp -r ~/.claude ~/.claude.bak` + projede temiz commit (`git add -A && git commit -m "yeniden yapılandırma öncesi"`). Bu adım onaydan sonra ilk iş.
2. **`_analiz/DURUM.md`** yazılır (bu dosyanın içeriği).
3. **İki hafıza klasörü birleştirilir.** Yön: **OneDrive tarafındaki 26 dosya → `C--gokhanerdemprojeler-restoran-aios\memory\`**. `calisma-tarzi-gokhan.md` zaten doğru klasörde; oradaki sürüm (47 satır) OneDrive'dakiyle karşılaştırılıp güncel olanı kalır. Taşınacak yeni kayıtlar: `rzv-mobil-durum`, `vercel-adresi`, `commit-push-yetkisi`, `no63-projesi`, `program-panosu`, `standart-kutuphanesi`, `rls-guvenlik-acigi-ertelendi`, `bildirim-sistemi-ertelendi`, `proje-yolu`, `hangi-kopyaya-bakiyor`, `program-kendi-yapsin`, `yuzeysel-birakma`, `sormadan-kaldirma`, `tasarim-dili-referans`, `rezervasyon-urun-hedefi`, `api-football-erisim`, `futta-kisisel-sistem`, `korner-modeli-kalibrasyon`. Hedefte kalanlar: `iki-kopya-uyarisi`, `masa-servisi-simulasyonu`. İki `MEMORY.md` tek indekste birleşir (≤25 satır). Sonra 2. adımdaki silme yüzünden OneDrive adlı hafıza klasörü bir daha yazılmaz.
4. **Boş OneDrive klasörü silinir** (`...\OneDrive\Belgeler\restoran-aios`). Bütün karışıklığın kaynağı bu — kurulum boyunca ayakta kalırsa, araya girecek bir oturum yine kuralsız açılabilir. Klasör boş, git deposu değil, içinde kaybedilecek bir şey yok. Bu oturum orada çalıştığı için **önce bu pencere kapatılır**, silme asıl proje klasöründe açılan yeni pencereden yapılır. Not: OneDrive klasörü olduğu için silmek buluttan da siler — boş olduğundan risk yok, ama bilerek yapılıyor.
5. **`~/.claude/CLAUDE.md`** yazılır (GLOBAL, ≤40 satır). Taslak önce ekranda gösterilir.
6. **Proje `CLAUDE.md`** yeniden yazılır (≤50 satır, `@AGENTS.md` importu korunur, diğer iki import kaldırılır).
7. **`CLAUDE.local.md`** yazılır + `.gitignore`'a eklenir (şu an `.gitignore`'da Claude'la ilgili hiçbir satır yok).
8. **`.claude/rules/`** üç dosyası yazılır: `ekran-standartlari.md`, `veri-kurallari.md`, `ortak-dosyalar.md` (`paths:` frontmatter ile).
9. **`settings.json`** güncellenir: `Bash(*)`/`Write`/`Edit` allow kaldırılır, `defaultMode: "auto"`, §3.5-A'daki ask/deny kuralları eklenir. **Hook'lardan önce**, çünkü eski hook'ların üçü buraya taşındı.
10. **İki hook** tek tek yazılır ve `settings.json`'a bağlanır — ayrı onay: bitmeden-doğrula → sıkıştırma-sonrası. Yollar **tırnak içinde tam yol** olarak yazılır (`"C:\Users\Gökhan Alp Erdem\.claude\hooks\..."`) — boşluk ve Türkçe karakter yüzünden tırnaksız yol sessizce çalışmaz. Her hook kurulduktan sonra **gerçekten tetiklendiği tek tek denenir**, "yazdım" ile yetinilmez.
11. **`claude-code-kurulum` skill'i**: `SKILL.md` onaylanır, `reference/` 9 dosyası tek seferde yazılır. Diğer üç skill Faz 2'de.
12. **`.claude/launch.json`** portu 3001'e çekilir.
13. **Arşiv öncesi referans düzeltmesi.** `_arsiv/`'e taşınacak dosyalara atıf veren yerler güncellenir. Tarama şimdiden yapıldı, üç gerçek atıf var (ayrıntı aşağıda). Taşımadan **önce** bu üç satır düzeltilir.
14. **Taşıma (silme değil).** Liste ekranda gösterilir, tek onay alınır, sonra `_arsiv/`'e **taşınır**: `günaydın.md`, `AJANLAR.md`, `PAGE_STANDARDS.md`, `BUSINESS_LOGIC.md`, `ROADMAP.md`, `VISION.md`, `YOL-HARITASI-KARARLAR.md`, `TEST-RAPORU.md`, `ARASTIRMA*.md`.
15. **Doğrulama:** asıl proje klasöründe yeni oturum açılır, `/context` ile yüklenen dosyalar beklenenle karşılaştırılır. Sonra sırayla: `npm run dev` denenir (engellenmeli), `git push` denenir (sormalı), **`AskUserQuestion` denenir — sorması ve plan akışını tıkamaması gözlenir; tıkamıyorsa `deny`'a çıkarılır, tıkıyorsa `ask`'te kalır**. Bir `.tsx` açtırılıp `ekran-standartlari` kuralının, bir `lib/` dosyası açtırılıp `ortak-dosyalar` kuralının bağlama girdiği teyit edilir. Stop hook üç durumda denenir: kod değişmeden bir tur (hiç çalışmamalı), sadece `lib/` düzenlemesi (yalnızca `tsc`), sunucu kapalıyken `page.tsx` düzenlemesi (atlayıp not düşmeli, kilitlememeli).
16. **Silme — sadece 15 geçtikten sonra.** `_arsiv/` içeriği kalır (import edilmediği için maliyeti yok). Gerçekten silinecekler: `~/.claude/claude.md.txt`, `~/.claude/settings - Kopya.json`, `.claude/worktrees/salon/`.

> **Sıra neden bu (Gökhan):** silme doğrulamadan önce gelirse, doğrulama başarısız çıktığında
> `günaydın.md` ve `PAGE_STANDARDS.md` çoktan gitmiş olur. Artık taşı → doğrula → sil. Tek
> istisna boş OneDrive klasörü: onu geciktirmenin faydası yok, riski var.

### 13. adımın taraması — bulunan atıflar

`grep -rn "ROADMAP.md\|VISION.md\|ARASTIRMA\|TEST-RAPORU.md\|..."` (node_modules hariç):

| Yer | Atıf | Yapılacak |
|---|---|---|
| `app/rezervasyon/ayarlar/page.tsx:282` ve `:1939` | Yorum içinde `ARASTIRMA-2-GECE-KULUBU.md 1.2` / `1.4` | Yol `_arsiv/ARASTIRMA-2-GECE-KULUBU.md` olarak güncellenir |
| `supabase/migrations/20260816200000_...sql:10` | Yorum içinde `ARASTIRMA-2-GECE-KULUBU.md` | Aynı. **Uygulanmış migration dosyası** — sadece yorum satırı düzeltilir, SQL'e dokunulmaz |
| `VISION.md:70,74,86` → `ROADMAP.md`; `YOL-HARITASI-KARARLAR.md:3,97` → `ARASTIRMA*.md`; `ROADMAP.md:198` → `VISION.md` | Arşive giden dosyalar birbirine atıf veriyor | **Değişiklik yok** — hepsi birlikte `_arsiv/`'e taşınıyor, göreli bağlantılar geçerli kalıyor |
| `CLAUDE.md:1,3`, `AJANLAR.md:25,43`, `günaydın.md:89-90` | Kaldırılan dosyalara atıf | **Değişiklik yok** — bu dosyaların kendisi zaten yeniden yazılıyor |

---

## 4. Kabul kriterleri karşılığı

| Kriter | Durum |
|---|---|
| Hiçbir kural iki dosyada tekrar etmeyecek | ✅ §3.3'teki 6 tekrar tek kaynağa indiriliyor |
| Her CLAUDE.md ≤ 100 satır | ✅ 40 / 50 / 20 — resmî öneri 200, hedef daha sıkı |
| Vurgu en fazla 3 kuralda | ✅ Ayrılan üç yer: (1) "onaylıyorum" tek onay kelimesidir, (2) bitince sadece "bitti", (3) ortak dosyalara tek başına dokunma |
| Her kural spesifik ve kontrol edilebilir | ✅ Kontrol edilemeyen 7 satır SİL etiketli (§3.2) |
| Yasak koyan kural yerine ne konacağını söyleyecek | ✅ Örn. "AskUserQuestion kullanma → düz cümleyle tek soru sor", "sunucu başlatma → Gökhan'ın kısayolu" |
| Referans/hafıza dosyaları `@` ile import edilmeyecek | ✅ Bugün 2 import var (`günaydın`, `AJANLAR`), ikisi de kaldırılıyor; `@AGENTS.md` kalıyor (6 satır, Claude Code `AGENTS.md`'yi kendiliğinden okumadığı için import zorunlu) |

---

## 2. Doküman doğrulaması — promptla çelişen noktalar

`code.claude.com/docs` üzerinden doğrulandı: memory, hooks, permissions, permission-modes,
skills, goal, commands. Promptun 6. bölümündeki referans materyalle **üç fark** çıktı:

1. **PreToolUse `permissionDecision` değerleri.** Prompt: `allow` / `deny` / `ask` / `defer`.
   Doküman: **`allow` / `deny` / `escalate`**. `escalate` "auto mode'da bile kullanıcıya sor"
   demek. Referans dosyası yazılırken doküman esas alınacak.
2. **`.claude/rules/` mekanizması promptta hiç yok.** Doküman, `paths:` frontmatter'lı kural
   dosyalarının **sadece eşleşen dosyaya dokunulduğunda** bağlama girdiğini söylüyor. Bu,
   `PAGE_STANDARDS.md` sorununun (yüklenmiyor ama "her ekranda uygulanır" diyor) tam
   karşılığı — planın omurgasına alındı.
3. **CLAUDE.md boyut hedefi.** Doküman "200 satırın altını hedefleyin" diyor; promptun kabul
   kriteri 100. Çelişki değil, daha sıkı bir hedef — 100'de kalınıyor.
4. **Hafıza dosyalarını elle taşımak desteklenen bir işlem mi? Evet.** Doküman açıkça
   söylüyor: *"Auto memory files are plain markdown you can edit or delete at any time."*
   Ayrı bir veri tabanı veya indeks yok — `MEMORY.md`'nin kendisi indeks. Dolayısıyla
   birleştirme = konu dosyalarını kopyala + iki `MEMORY.md`'nin satırlarını tek listede
   topla. Klasör adının nasıl seçildiği de doğrulandı: *"derived from the git repository…
   Outside a git repo, the project root is used instead"* — OneDrive kopyası git deposu
   olmadığı için kendi adına ikinci bir klasör açılmış. Klasör boş yol ortadan kalkınca
   bölünme tekrar oluşmaz. (Ek olarak `CLAUDE_CODE_PROJECT_DIR_NAME` diye bir değişken
   var, klasör adını sabitliyor; **bu kurulumda gerekli değil, kullanılmayacak** — sürüm
   şartı var ve buradaki sürümde çalıştığı doğrulanmadı.)
5. **`escalate` nerede kullanılır.** Bir hook'un döndürebileceği değerdir, `settings.json`'a
   yazılamaz. Ayarlardaki karşılığı `permissions.ask` kovasıdır ve etkisi aynıdır: ask
   kuralı auto mode'da da sorar, hatta bir PreToolUse hook'u `allow` dönse bile sorar
   (*"Hook decisions don't bypass permission rules… a matching ask rule still prompts"*).

Doğrulanan ve promptla uyuşan noktalar: import'lar başlangıçta satır içi genişler ve bağlamı
azaltmaz; `SessionStart` matcher'ı `compact` geçerlidir (`startup`, `resume`, `clear`,
`compact`, `fork`); `exit 2` engelleyicidir ve `Stop`'u da engeller; `PostToolUse`
engelleyemez; altı izin kipi (`default`, `acceptEdits`, `plan`, `auto`, `dontAsk`,
`bypassPermissions`); `/goal` değerlendiricisi yalnızca transkripti okur, araç çağırmaz;
`AGENTS.md` Claude Code tarafından kendiliğinden okunmaz, import edilmesi gerekir.

**Doğrulanamadı:** `/loop`'un kendi hızına göre değişen aralık davranışı ve `--bare`
bayrağının deterministik mod ayrıntısı ayrı bir doküman sayfasında bulunamadı; referans
dosyasına promptta yazıldığı gibi, "doğrulanmadı" notuyla geçirilecek.

---

## 7. Kural kural konuşulan oturumun kararları (2026-08-21)

Analiz yazıldıktan sonra global CLAUDE.md'nin dokuz kuralı Gökhan'la tek tek konuşuldu.
Aşağıdakiler yukarıdaki bölümleri **günceller** — çelişki olursa bu bölüm geçerlidir.

### Değişen kararlar

| Konu | Analizdeki hâli | Son karar |
|---|---|---|
| Sunucu | "Sunucuyu Gökhan başlatır", `npm run dev` deny | **Tersine döndü.** Claude sohbete girildiğinde sunucuyu sessizce başlatır; başlattığını yazmaz, izin istemez. Deny listesi boş kaldı |
| Link | Tüm sayfalar tam link | Vercel'de yayındaysa **sadece** Vercel adresi; değilse ana ekran + mobil. Başka sayfa linki yok |
| Onay kelimesi | "onaylıyorum" + kısa onaylar ("at", "uygula") | **Tek geçerli ifade: "onaylıyorum".** "onay", "evet", "tamam" onay sayılmaz |
| AskUserQuestion | deny | **ask** — Plan Mode tıkanmasın diye. 15. adımda gözlenip `deny`'a çıkarılabilir |
| PostToolUse hook | Var (her düzenlemede tsc+eslint) | **Çıkarıldı.** Stop hook aynı işi yapıyor |
| Stop hook | Tek kapı (port) | **Üç kapı:** `git diff` ile kod değişti mi → `tsc --noEmit` → HTTP kontrolü sadece `app/**/page.tsx` değiştiyse ve port cevap veriyorsa |
| `lib/`, `app/components/` | ask kuralı | ask'ten çıkarıldı, `.claude/rules/ortak-dosyalar.md` oldu — en çok dokunulan dizinlerde soran kural değerini yitirir |
| Skill'ler | Hepsi Faz 1 | Sadece `claude-code-kurulum` Faz 1'de; `dogrulama`, `paralel-ajan`, `is-kurallari` Faz 2 |

### Yeni kural — kural ile isteğin çeliştiğinde

Analizde olmayan, konuşma sırasında ortaya çıkan ve en önemlisi sayılan kural:

> Gökhan'ın o anki isteği yazılı bir kurala ters düşüyorsa sessizce ikisinden biri seçilmez.
> Çelişki tek cümleyle söylenir, sonra düzenleme istenir. "Devam et" → kural aynı kalır.
> "Şimdilik böyle yap" → o sefere mahsus. Düzenleme verilirse **kural dosyasına aynı gün
> işlenir, sohbette bırakılmaz.**

Sebebi davranış taramasında: aynı düzeltme 13, 14 ve 25 Temmuz'da üç kez tekrarlanmış, çünkü
düzeltmeler sohbette kalıp pencere kapanınca kaybolmuş.

### Kişisel kimlik maddesi

Gökhan'ın isteğiyle "restoran işletmeciliğinden geliyor" ifadesi global dosyadan çıkarıldı —
davranış üretmiyor ve dosya bütün projelerde geçerli. Yerine yaratıcı/görsel rol eklendi:
"koddan fark edilemeyeni o görür; 'şu kötü duruyor' dediğinde bu bir görüş değil, veridir."

Ayrıca bir şikayet kurala dönüştü: bir şey çalışmadığında kusur önce kendi işinde aranır,
"bakmamışsındır / yanlış yere bakıyorsun" denmez. Bu, `hangi-kopyaya-bakiyor.md` hafıza
kaydını yumuşatıyor — ortam kontrolü sessizce yapılır, Gökhan'ın bakışı sorgulanmaz.

### Global CLAUDE.md son metni

`~/.claude/plans/modular-riding-wren.md` §1'de. 43 satır, dokuz kural, üç vurgu
("onaylıyorum", "bitti", "mutlaka").
