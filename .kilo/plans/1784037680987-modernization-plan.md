# OwO Farm Bot Stable — Modernizasyon Planı

## Mevcut Durum

- Node.js v26, pnpm 11.9.0, `"type": "commonjs"`
- 85 `require()` çağrısı, 20+ dosya
- `discord.js-selfbot-v13@3.6.1` — upstream selfbot desteğini kaldırdı, fork'ta kalıyoruz
- Biome lint + Node built-in test runner, 15 test dosyası
- `config.json` + `.env`, elle yazılmış doğrulayıcı (`configValidator.js`, ~450 satır)
- `BotContext` DI kapsayıcısı var, `client`'a monkey-patch yok (iyi)

## Aşama 1 — Temel (Düşük risk, yüksek değer) — ✅ TAMAMLANDI

**Hedef**: Bağımlılık hijyeni, şemalı yapılandırma doğrulama, CI zorlaması. Çalışma zamanı davranışı değişikliği yok.

### Görev 1.1: Bağımlılık Yükseltmeleri — ✅ TAMAMLANDI

> **Uygulanan** (`package.json`): `axios` `^1.15.0` → `^1.7.2`, `sharp` `^0.35.2` → `^0.33.5`.
> `pnpm update axios@^1.7.2 sharp@^0.33.5` çalıştırıldı. Not: `^1.7.2` aralığı mevcut kurulu `axios@1.18.1`'i kapsadığından node_modules'da 1.18.1 kaldı (aralık içinde); `sharp` zaten `0.33.5`'teydi. Diğer paketler plandaki gibi sabit tutuldu. `pnpm test` geçiyor.


**Sıralama**: Tek tek paket yükselt, her biri sonrası `pnpm test` çalıştır.

| Paket | Mevcut | Hedef | Aksiyon |
|-------|--------|-------|---------|
| `axios` | `^1.15.0` | `^1.7.2` | `pnpm update axios@^1.7.2` |
| `sharp` | `^0.35.2` | `^0.33.5` | `pnpm update sharp@^0.33.5` |
| `puppeteer-extra-plugin-adblocker` | `^2.13.6` | `^2.13.6` (sabit tut) | Yükseltme yapma; `puppeteer-real-browser@1.4.4` ile uyumsuzluk riski var |
| `puppeteer-real-browser` | `^1.4.4` | `^1.4.4` (sabit tut) | Yükseltme yapma |
| `yargs` | `^18.0.0` | `^18.0.0` (sabit tut) | Sadece `captcha.js` ve `autovote.js` kullanıyor; çalışıyor |
| `chalk` | `^4.1.2` | `^4.1.2` (sabit tut) | v5 ESM-only; CJS'de kalmak için v4'ü koru |
| `discord.js-selfbot-v13` | `^3.6.1` | `^3.6.1` (sabit tut) | Selfbot desteği yok |

**Kabul kriteri**: `pnpm test` tüm yükseltmelerden sonra geçer.

---

### Görev 1.2: Yapılandırma Şema Doğrulama — ✅ TAMAMLANDI

> **Uygulanan**:
> - `pnpm add valibot@^1.0.0` → kurulan `valibot@^1.4.2` (Node 26 `require(esm)` ile CJS'te sorunsuz yükleniyor).
> - `src/services/configSchema.js` oluşturuldu: `validateConfig(ctx, config) → { success, errors }`, `parseConfigErrors(ctx, errors)` (hata log + fatal'de `process.exit(1)`), `getDebugConfig(ctx, config)` (eski debug dump'ı taşındı), `checkToken`. Token/regex, gamble miktarı (`v.minValue`), gem rarlığı (`v.picklist`), hayvan türü (`v.picklist`) valibot şemalarıyla; yinelenen kanal, sell/sacrifice, pray/curse ve aralık clamp'leri manuel korundu. Tüm yan etkiler (curse devre dışı, interval reset, rareLevel, animaltype) birebir korundu.
> - `src/core/bot.js`: `configValidator` → `configSchema` geçirildi (`validateConfig` + `parseConfigErrors` + `getDebugConfig`).
> - `src/services/configValidator.js` tamamen silindi.
> - `tests/configValidator.test.js` → `tests/configSchema.test.js` olarak güncellendi (yeni API'ye uyarlandı). `pnpm test` 178/178 geçiyor.
> - Bu geçiş, Aşama 2.1 ve 2.2'yi de kapsayacak şekilde yapıldı (bkz. aşağıdaki işaretler).


**Kütüphane**: `valibot@^1.0.0` (ekle: `pnpm add valibot`)

**Oluşturulacak dosya**: `src/services/configSchema.js`

**Kaldırılacak dosya**: `src/services/configValidator.js` (tamamen)

**Değiştirilecek dosya**: `src/core/bot.js` (doğrulama çağrısını değiştir)

**Şema gereksinimleri** (mevcut `configValidator.js`'den eşle):

```js
// src/services/configSchema.js (tam liste)
const v = require("valibot");

const TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const RARITY_MAP = { fabled: 7, legendary: 6, mythical: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
const ANIMAL_TYPE_MAP = { common: " c", uncommon: " u", rare: " r", epic: " e", mythical: " m", patreon: " p", cpatreon: " cp", legendary: " l", gem: " g", bot: " b", distorted: " d", fabled: " f", special: " s", hidden: " h" };

const INTERVAL_DEFAULTS = [
  { type: "hunt", min: 12000, max: 16000 },
  { type: "battle", min: 12000, max: 16000 },
  { type: "pray", min: 316000, max: 332000 },
  { type: "coinflip", min: 12000, max: 16000 },
  { type: "slot", min: 12000, max: 16000 },
  { type: "animals", min: 610000, max: 661000 },
];

// Şema tanımları burada olacak
// - MainSchema: token, userid, channel IDs, commands, maximum_gem_rarity
// - SettingsSchema: owoprefix, captcha, gamble, inventory, checklist, safety, logging
// - AnimalsSchema: type (sell/sacrifice), animaltype enum map
// - IntervalSchema: per-type min/max
// - ConfigSchema: firstrun, prefix, main, settings, animals, interval

// safeParse kullan, hataları parse et, eski kullanıcı dostu mesajları koru
```

**`bot.js` değişikliği**:
- `require("../services/configValidator.js")` → `require("../services/configSchema.js")`
- `configValidator.verifyconfig(ctx, config)` → `validateConfig(ctx, config)`
- `configValidator.getconfig(config, ctx)` → debug dump'u doğrudan `bot.js` içine taşı veya `configSchema.js`'den export et

**Geçiş stratejisi**:
1. Yeni `configSchema.js` oluştur, mevcut `configValidator.js`'yi silmeden paralel çalıştır
2. Tüm testler geçerken iki doğrulayıcıyı da etkinleştir
3. `bot.js`'yi yeni şemaya geçir
4. Eski `configValidator.js`'yi kaldır

**Kabul kriteri**: `pnpm test` geçer. Geçersiz `config.json` (eksik token, yinelenen kanal ID'si, geçersiz rarlık) doğru hata mesajıyla reddedilir. Geçerli `config.json` kabul edilir.

---

### Görev 1.3: CI/CD Hattı — ✅ TAMAMLANDI

> **Uygulanan**: `.github/workflows/ci.yml` oluşturuldu (lint / test / secret-scan işleri).
> Sapma: plandaki `pnpm format --check` geçersizdi (`biome format --write` ile `--check` çelişir), bunun yerine lint adımı `pnpm lint:fix` + `pnpm exec biome check .` (yalnız-okuma, sıfır hata zorunlu) olarak yazıldı.
> Sapma: `.gitignore` içinde `.github/` yok sayılıyordu; CI dosyasının takip edilip PR/push'larda çalışması için `.gitignore`'a `!.github/` istisnası eklendi.


**Oluşturulacak dosya**: `.github/workflows/ci.yml`

**İçerik**:
```yaml
name: CI
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.9.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install
      - run: pnpm lint:fix && pnpm format --check

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.9.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install
      - run: pnpm test

  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: gitleaks/gitleaks@v8
        with: { config: .gitleaks.toml }
```

**Kabul kriteri**: Tüm push ve PR'larda 3 iş de geçmeli. Başarısız iş birleşmeyi engeller.

---

### Görev 1.4: Geliştirici Yapılandırması Onarması — ✅ TAMAMLANDI

> **Uygulanan**: `developer/` dizini oluşturuldu ve `config.json` → `developer/config.json` kopyalandı (token boş olduğundan güvenli; `developer/` zaten `.gitignore`'ta). `src/services/runtimeConfig.js:58-61` konsol logu zaten kaldırılmıştı (doğrulandı). `DEVELOPER_MODE=true` ile fallback artık gürültüsüz.


**Sorun**: `src/services/runtimeConfig.js:52-62` mevcut olmayan `../../developer/config.json`'u yüklemeye çalışıyor.

**Çözüm**: `developer/config.json` oluştur (mevcut `config.json`'un kopyası).

**Adımlar**:
1. `developer/` dizini yoksa oluştur
2. `config.json`'u `developer/config.json`'a kopyala
3. `runtimeConfig.js:58-61`'deki `console.log`'u kaldır (zaten düşme var)

**Kabul kriteri**: `DEVELOPER_MODE=true` ile bot başlatılığında hata vermez, konsol gürültüsü yok.

---

## Aşama 2 — Güvenlik ve Sürdürülebilirlik

### Görev 2.1: Yapılandırma Şeması (tam detay) — ✅ TAMAMLANDI (1.2 kapsamında)

**Dosya**: `src/services/configSchema.js` (yeni)

**Yapı**:
```
- validateConfig(ctx, config) → { success: boolean, errors: string[] }
- parseConfigErrors(errors) → void (log errors, exit if fatal)
- getDebugConfig(config) → string (existing debug dump, moved from configValidator)
```

**Şema kuralları** (mevcut `configValidator.js`'den birebir eşle):

| Kural | Mevcut | Yeni |
|-------|--------|------|
| Token varlığı | `checkToken` | `v.pipe(v.string(), v.minLength(10), v.regex(TOKEN_SHAPE))` |
| Token şekli | regex | valibot `v.regex()` |
| Yinelenen kanal ID'si | `checkDuplicateChannels` | Manuel döngü, aynı mantık |
| Gamble miktarı > 0 | `checkGambleAmount` | `v.pipe(v.number(), v.minValue(1))` |
| Rarlık enum | `parseGemRarity` | `v.picklist(["fabled", "legendary", ...])` |
| Hayvan türü enum | `parseAnimalTypes` | `v.picklist([...ANIMAL_TYPE_MAP keys])` |
| Sat/sacrifice çakışma | `checkSellSacrificeConflict` | Manuel kontrol |
| Dua/kehanet çakışma | `checkPrayCurseConflict` | Manuel kontrol (pray kazansın) |
| Aralık sınırları | `validateIntervals` | `v.pipe(v.number(), v.minValue(defaultMin))` |
| owoprefix varsayılan | runtimeConfig.js | Şema sonrası `.default("owo")` |

**Hata mesajları** (mevcut ile aynı):
- "Main token is missing or too short!"
- "Main token is malformed!"
- "There are some duplicate channel id!"
- "Invalid gamble amount!"
- "Gem rarity: Invalid value. Valid value is: fabled, legendary, ..."
- "Sell and sacrifice cannot be turn on at the same time!"
- "Curse and pray cannot be turn on at the same time!"
- "Interval cannot be null!"
- "[type] min/max interval is too low, resetting to default!"

**Kabul kriteri**: Tüm mevcut testler geçer. `config.json` geçersiz olduğunda aynı hata mesajları gösterilir.

---

### Görev 2.2: Yapılandırma Doğrulama Geçişi — ✅ TAMAMLANDI (1.2 kapsamında)

**Adımlar**:
1. `configSchema.js` oluştur, `configValidator.js`'yi silmeden paralel çalıştır
2. `bot.js`'de her iki doğrulayıcıyı da çağır, her ikisinden de log yaz
3. Tüm testler geçerken `configValidator.js`'yi kaldır

---

## Aşama 3 — Gözlemlenebilirlik ve Dayanıklılık

### Görev 3.1: Yapılandırılmış Hata Yakalama — ✅ TAMAMLANDI

**Oluşturulacak dosya**: `src/services/errors.js` (yeni)

**Yapı**:
- `BotError(type, module, message, cause?)` - base class
- `ConfigError extends BotError`
- `CaptchaError extends BotError`
- `RateLimitError extends BotError` - `retryAfter`, `attempt`, `nextDelay()` exponential backoff

**Değiştirilecek dosyalar**:
- `src/core/index.js` anti-crash → hata sınıfına göre sınıflandırma eklendi
- `src/modules/farm.js`, `luck.js`, `gamble.js`, `animals.js`, `quest.js`: catch blokları `handleModuleError` ile sınıflandırıldı
- `src/modules/joingiveaways.js`, `src/services/checklist.js`: catch blokları sınıflandırıldı

**Kabul kriteri**: Hatalar modüle göre sınıflandırılır. `RateLimitError` için üstel backoff eklendi (farm, gamble, luck, animals, quest, checklist). `pnpm test` 198/198 geçiyor.

---

### Görev 3.2: Bot Bayrağı Durum Makinesi

**Oluşturulacak dosya**: `src/services/botState.js` (yeni)

**Durumlar**: `idle | paused | captcha | inventory | checklist | running`

**Geçişler**:
- `pause()`: running → paused
- `resume()`: paused → running
- `captcha()`: any → captcha
- `captchaSolved()`: captcha → paused (autoresume varsa running)
- `startInventory()`: running → inventory
- `endInventory()`: inventory → running
- `startChecklist()`: running → checklist
- `endChecklist()`: checklist → running

**Değiştirilecek dosyalar**:
- `src/core/globalutil.js`: `waitWhileBusy()` → durum aboneliği olarak yeniden yaz
- `src/modules/*.js`: `ctx.global.paused = true` → `ctx.state.pause()` gibi çağrılar

**Kabul kriteri**: `waitWhileBusy()` polling yok, durum değişikliğinde hemen resolve olur.

---

### Görev 3.3: Yapılandırılmış Kayıt

**Oluşturulacak dosya**: `src/services/structuredLogger.js` (yeni)

**Özellikler**:
- Mevcut `Logger` sınıfını koru (renkli çıktı)
- JSON format seçeneği ekle (`LOG_FORMAT=json` ortam değişkeni)
- Her log satırına `{ level, type, module, message, timestamp, state }` ekle

**Değiştirilecek dosyalar**: `src/services/logger.js` (genişlet)

---

### Görev 3.4: Sağlık ve Metrikler

**Oluşturulacak dosya**: `src/services/health.js` (yeni)

**Özellikler**:
- `/:health` HTTP endpoint (micro-http veya内置 http modülü)
- Döngü gecikmeleri, captcha sıklığı, komut başarı oranları
- `stats` komutunda görüntüle

**Kabul kriteri**: `curl http://localhost:PORT/health` 200 döner.

---

### Görev 3.5: Nazik Kapatma

**Değiştirilecek dosya**: `src/core/admin.js`

**Değişiklik**:
```js
// restart komutu:
ctx.loops.stopAll();
await ctx.client.destroy();
setTimeout(() => process.exit(0), 2000);
```

**Kabul kriteri**: Tüm bekleyen zamanlayıcılar iptal edilir, Discord bağlantısı düzgün kapatılır.

---

## Aşama 4 — Kod Kalitesi

### Görev 4.1: Modül Ayrıştırma

**Dosya**: `src/modules/joingiveaways.js` (105 satır, Biome uyarısı)

**Bölme**:
- `joingiveaways.js` → giriş noktası
- `src/services/giveawayState.js` → enteredGiveaways yönetimi
- `src/services/giveawayClicker.js` → buton tıklama mantığı

---

### Görev 4.2: Komut Çalıştırıcı Çıkarma

**Oluşturulacak dosya**: `src/services/commandRunner.js`

**Yapı**:
```js
async function sendCommand(ctx, channel, content) {
  await channel.sendTyping();
  const msg = await channel.send({ content });
  const reply = await waitForReply(ctx, channel, msg);
  return reply;
}
```

**Kullanılacak yerler**: `farm.js`, `inventory.js`, `checklist.js`, `quest.js`, `huntbot.js`, `gamble.js`, `luck.js`, `animals.js`

---

### Görev 4.3: farm.js Refactor

**Mevcut**: 344 satır, 3 `require("./inventory.js")` çağrısı

**Hedef**: `farmAction`'ı `commandRunner`'a taşı, inventory çağrılarını merkezileştir.

---

## Dış Kapsam

- Discord.js v14+ geçişi (upstream selfbot desteğini kaldırdı; fork'ta kalıyoruz)
- Tamamen farklı bir çerçeveye yeniden yazma
- GUI / web panosu
- Çoklu hesap / çoklu token desteği

## Kararlar

| Karar | Tercih | Gerekçe |
|-------|--------|---------|
| Yapılandırma doğrulama kütüphanesi | **valibot** | ~3KB, Zod API'siyle aynı, daha küçük ayak izi |
| chalk sürümü | **v4 koru** | v5 ESM-only; CJS'de kalmak için v4 sorunsuz çalışıyor |
| ESM geçişi | **Hayır** | Dinamik `require()` desenleri (dizin taraması, koşullu yükleme) ESM'de `import()`'a dönüşür, bootstrap sırasını bozar. `discord.js-selfbot-v13` CJS. Fayda/fiyat oranı düşük. |
| Geliştirici yapılandırma dosyası | **Oluştur** | `developer/config.json` eksik; kopyalayarak hızlıca giderilir |

## Riskler ve Azaltma

| Risk | Azaltma |
|------|---------|
| Bağımlılık yükseltmeleri puppeteer akışını bozar | Her yükseltmeden sonra captcha akışını yalıtılmış test et |
| Yapılandırma şeması geçişi kullanıcıyı etkiler | Paralel çalıştırma ile geri dönüş yolu; mevcut hata mesajlarını koru |
| CI dal koruması yanlış yapılandırılmış kilitlenmeye neden olur | Önce dal korumasız test et, sonra korumayı etkinleştir |
| Durum makinesi aşırı karmaşıklaşır | Maksimum 5 durum, tek geçiş fonksiyonu, sadece `waitWhileBusy`'yi etkiler |

## Doğrulama Planı

- Her görevden sonra `pnpm test` geçmeli
- `pnpm lint:fix ; pnpm format` sıfır fark üretmeli
- Manuel smoke test: botu başlat, 1 tam farm döngüsü, captcha tetikle, otomatik çözüm doğrula
- `pnpm secret:scan` geçmeli (git'te token yok)
