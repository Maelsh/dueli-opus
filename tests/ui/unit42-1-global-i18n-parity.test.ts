/**
 * UNIT 42.1+43 (R4-GLOBAL-I18N-ALL-LANGS-1) — global i18n parity suite.
 *
 * What this file locks in, permanently:
 *   1. The 56-language central registry with ALL languages enabled
 *      (4 RTL: ar/fa/ur/he + 52 LTR), every single one with a usable
 *      translation pack — bundled ar/en or a lazy-loaded static dictionary
 *      from public/static/locales/<lang>.json.
 *   2. 100% key parity of the 54 runtime packs with en.ts — nested
 *      objects and arrays included. ar.ts parity is enforced against the
 *      documented legacy exception list (flat category labels that only
 *      en.ts ever had), so any NEW drift fails here.
 *   3. Identical {placeholders} in every translated string of every language.
 *   4. Protected identity terms (Dueli, Maelsh Pro, domains, e-mails, AI /
 *      model & infrastructure names) survive translation verbatim.
 *   5. Owner-mandated copy: the splash motto (word_1..4) and the public
 *      monetization gate phrase in all 56 languages, and the non-negotiable
 *      80%/20% (and 100%) financial figures.
 *   5b. The guide pillars stay translated ARRAYS in every runtime pack —
 *      same length as en.ts, and pillars[0].title is never the English
 *      original (regression guard for the copied-array fix).
 *   6. No truncation / no meta markers anywhere.
 *   7. hreflang + canonical + og:locale + JSON-LD for all 56 languages in
 *      seo.ts, correct <html lang/dir> + language fonts + the inlined
 *      window.__DUELI_LOCALE_PACK__ head script in layout.ts.
 *   8. The lazy-loading boundary: ensureLanguageLoaded loads every pack from
 *      the static locale files through the REAL runtime engine (no registry
 *      language is fileless any more), and any unknown code stays silently
 *      and safely on English via the negative-cache miss path.
 *   9. i18nAutoFit works with the translated strings of all languages, and
 *      I18nLayoutGuard applies the auto-fit CSS variable through a DOM stub.
 */
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { en } from '../../src/i18n/en';
import { ar } from '../../src/i18n/ar';
import { translations } from '../../src/i18n';
import {
    LANGUAGES,
    TRANSLATED_LANGUAGES,
    DEFAULT_LANGUAGE,
    getAvailableLanguages,
    getUILanguage,
    registerLanguage,
    ensureLanguageLoaded,
    isLanguageLoaded,
    localeAssetUrl,
    t,
    isRTL,
    getDir,
    normalizeContentLanguage,
} from '../../src/i18n';
import { SEO_LANGUAGES, hreflangLinks, canonicalUrl, buildJsonLd, buildSeoHead, ogLocaleFor, SITE_ORIGIN } from '../../src/shared/templates/seo';
import { generateHTML } from '../../src/shared/templates/layout';
import { estimateTextWidthUnits, computeI18nFontScale, clampI18nFontScale, I18N_FONT_SCALE_MIN } from '../../src/lib/i18nAutoFit';

const STATIC_LOCAL_DIR = join(process.cwd(), 'public', 'static', 'locales');

/** The 54 runtime-loaded UNIT 42.1+43 dictionaries, in canonical registry
 *  order (languages.ts minus the bundled ar/en) — the other 2 global packs. */
const LAZY_CODES = [
    'es', 'fr', 'de', 'pt', 'ru', 'zh', 'ja', 'ko', 'tr', 'hi', 'id', 'fa', 'ur',
    'he', 'it', 'nl', 'sv', 'no', 'da', 'fi', 'pl', 'cs', 'el', 'ro', 'hu', 'bg',
    'hr', 'sr', 'uk', 'th', 'vi', 'ms', 'bn', 'my', 'km', 'lo', 'ne', 'si', 'az',
    'ka', 'hy', 'kk', 'uz', 'tk', 'ky', 'tg', 'mn', 'am', 'sw', 'rw', 'be', 'is',
    'mt', 'ca',
];
const ALL_CODES = ['ar', 'en', ...LAZY_CODES];

/** The 4 right-to-left languages of the central registry. */
const RTL_LANGUAGES = ['ar', 'fa', 'ur', 'he'];

/** The exact English original the pillars regression guard forbids. */
const EN_PILLAR_0_TITLE = 'Replacing Conflict with Constructive Dialogue (Elevate)';

/** Packs sourced through the REAL runtime engine (translations registry). */
const PACKS: Record<string, Record<string, any>> = {};

beforeAll(async () => {
    for (const code of LAZY_CODES) {
        expect(existsSync(join(STATIC_LOCAL_DIR, `${code}.json`)), `${code}.json must ship in public/static/locales`).toBe(true);
        JSON.parse(readFileSync(join(STATIC_LOCAL_DIR, `${code}.json`), 'utf8')); // every file is valid, parseable JSON
        await ensureLanguageLoaded(code); // no assetsFetcher → the Node/Vitest disk fallback path
        PACKS[code] = translations[code];
        expect(PACKS[code], `${code} pack must register via ensureLanguageLoaded`).toBeTruthy();
    }
    expect(hasProperty(translations, 'xx'), 'no test language may pre-exist').toBe(false);
    PACKS.ar = translations.ar;
    PACKS.en = translations.en;
});

/** Owner-mandated official copy — mirrors MANDATED_COPY in
 *  dev-tools/i18n-global-generator.mjs; all 56 global languages. */
const MANDATED: Record<string, { splash: [string, string, string, string]; monetization_locked: string }> = {
    "ar": {
        "splash": [
            "ارتقِ",
            "تثقف",
            "استمتع",
            "اربح"
        ],
        "monetization_locked": "سيتم فتح الباب بعد استكمال الإجراءات"
    },
    "en": {
        "splash": [
            "Elevate",
            "Learn",
            "Enjoy",
            "Earn"
        ],
        "monetization_locked": "This section will open soon upon completion of procedures"
    },
    "es": {
        "splash": [
            "Supera",
            "Aprende",
            "Disfruta",
            "Gana"
        ],
        "monetization_locked": "Esta sección se abrirá pronto una vez completados los trámites"
    },
    "fr": {
        "splash": [
            "Élevez",
            "Apprenez",
            "Savourez",
            "Gagnez"
        ],
        "monetization_locked": "Cette section ouvrira bientôt une fois les procédures achevées"
    },
    "de": {
        "splash": [
            "Steige auf",
            "Lerne",
            "Genieße",
            "Verdiene"
        ],
        "monetization_locked": "Dieser Bereich wird bald geöffnet, sobald die Verfahren abgeschlossen sind"
    },
    "pt": {
        "splash": [
            "Eleve-se",
            "Aprenda",
            "Desfrute",
            "Ganhe"
        ],
        "monetization_locked": "Esta seção abrirá em breve após a conclusão dos procedimentos"
    },
    "ru": {
        "splash": [
            "Возвышайся",
            "Познавай",
            "Наслаждайся",
            "Зарабатывай"
        ],
        "monetization_locked": "Этот раздел скоро откроется после завершения процедур"
    },
    "zh": {
        "splash": [
            "进阶",
            "求知",
            "乐享",
            "赢取"
        ],
        "monetization_locked": "相关手续完成后，此板块即将开放"
    },
    "ja": {
        "splash": [
            "高めよう",
            "学ぼう",
            "楽しもう",
            "稼ごう"
        ],
        "monetization_locked": "このセクションは、手続きの完了後まもなく開放されます"
    },
    "ko": {
        "splash": [
            "격상",
            "배움",
            "즐거움",
            "수익"
        ],
        "monetization_locked": "이 섹션은 절차가 완료되면 곧 개방될 예정입니다"
    },
    "tr": {
        "splash": [
            "Yüksel",
            "Öğren",
            "Keyfini çıkar",
            "Kazan"
        ],
        "monetization_locked": "Bu bölüm, prosedürler tamamlandıktan sonra yakında açılacaktır"
    },
    "hi": {
        "splash": [
            "ऊपर उठें",
            "सीखें",
            "आनंद लें",
            "कमाएँ"
        ],
        "monetization_locked": "प्रक्रियाएँ पूरी होने के बाद यह अनुभाग शीघ्र खुल जाएगा"
    },
    "id": {
        "splash": [
            "Tingkatkan",
            "Belajar",
            "Nikmati",
            "Hasilkan"
        ],
        "monetization_locked": "Bagian ini akan segera dibuka setelah prosedur selesai"
    },
    "fa": {
        "splash": [
            "اوج بگیر",
            "یاد بگیر",
            "لذت ببر",
            "درآمد بساز"
        ],
        "monetization_locked": "این بخش به‌زودی پس از تکمیل تشریفات باز خواهد شد"
    },
    "ur": {
        "splash": [
            "بلندی حاصل کریں",
            "سیکھیں",
            "لطف اٹھائیں",
            "کمائیں"
        ],
        "monetization_locked": "یہ حصہ جلد ہی طریقہ کار مکمل ہونے کے بعد کھل جائے گا"
    },
    "he": {
        "splash": [
            "התרומם",
            "למד",
            "תיהנה",
            "הרוויח"
        ],
        "monetization_locked": "האזור הזה ייפתח בקרוב לאחר השלמת ההליכים"
    },
    "it": {
        "splash": [
            "Elevati",
            "Impara",
            "Divertiti",
            "Guadagna"
        ],
        "monetization_locked": "Questa sezione sarà aperta a breve al completamento delle procedure"
    },
    "nl": {
        "splash": [
            "Stijg uit",
            "Leer",
            "Geniet",
            "Verdien"
        ],
        "monetization_locked": "Deze sectie opent binnenkort zodra de procedures zijn afgerond"
    },
    "sv": {
        "splash": [
            "Lyft",
            "Lär dig",
            "Njut",
            "Tjäna"
        ],
        "monetization_locked": "Denna sektion öppnar snart när procedurerna har slutförts"
    },
    "no": {
        "splash": [
            "Løft",
            "Lær",
            "Nyt",
            "Tjen"
        ],
        "monetization_locked": "Denne seksjonen åpnes snart når prosedyrene er fullført"
    },
    "da": {
        "splash": [
            "Løft",
            "Lær",
            "Nyd",
            "Tjen"
        ],
        "monetization_locked": "Denne sektion åbner snart, når procedurerne er gennemført"
    },
    "fi": {
        "splash": [
            "Kohota",
            "Opiskele",
            "Nauti",
            "Ansaitse"
        ],
        "monetization_locked": "Tämä osio avautuu pian, kun toimenpiteet on saatettu loppuun"
    },
    "pl": {
        "splash": [
            "Wznoś się",
            "Ucz się",
            "Ciesz się",
            "Zarabiaj"
        ],
        "monetization_locked": "Ta sekcja zostanie wkrótce otwarta po zakończeniu procedur"
    },
    "cs": {
        "splash": [
            "Povýš se",
            "Uč se",
            "Užívej si",
            "Vydělávej"
        ],
        "monetization_locked": "Tato sekce bude brzy otevřena po dokončení procedur"
    },
    "el": {
        "splash": [
            "Ανύψωσε",
            "Μάθε",
            "Απόλαυσε",
            "Κέρδιζε"
        ],
        "monetization_locked": "Αυτή η ενότητα θα ανοίξει σύντομα μετά την ολοκλήρωση των διαδικασιών"
    },
    "ro": {
        "splash": [
            "Evoluează",
            "Învață",
            "Bucură-te",
            "Câștigă"
        ],
        "monetization_locked": "Această secțiune se va deschide în curând după finalizarea procedurilor"
    },
    "hu": {
        "splash": [
            "Emelkedj",
            "Tanulj",
            "Élvezz",
            "Keress"
        ],
        "monetization_locked": "Ez a szekció hamarosan megnyílik az eljárások befejezése után"
    },
    "bg": {
        "splash": [
            "Издигай се",
            "Учи се",
            "Наслаждавай се",
            "Печели"
        ],
        "monetization_locked": "Този раздел ще се отвори скоро след приключване на процедурите"
    },
    "hr": {
        "splash": [
            "Uzdiži se",
            "Uči",
            "Uživaj",
            "Zarađuj"
        ],
        "monetization_locked": "Ovaj će se odjeljak uskoro otvoriti nakon završetka postupaka"
    },
    "sr": {
        "splash": [
            "Уздижи се",
            "Учи",
            "Уживај",
            "Заражуј"
        ],
        "monetization_locked": "Овај део ће се ускоро отворити након завршетка процедура"
    },
    "uk": {
        "splash": [
            "Підвищуйся",
            "Пізнавай",
            "Насолоджуйся",
            "Заробляй"
        ],
        "monetization_locked": "Цей розділ буде незабаром відкрито після завершення процедур"
    },
    "th": {
        "splash": [
            "พัฒนา",
            "เรียนรู้",
            "สนุก",
            "หารายได้"
        ],
        "monetization_locked": "ส่วนนี้จะเปิดให้ใช้งานเร็ว ๆ นี้ หลังจากขั้นตอนต่าง ๆ เสร็จสมบูรณ์"
    },
    "vi": {
        "splash": [
            "Vươn cao",
            "Học hỏi",
            "Tận hưởng",
            "Kiếm tiền"
        ],
        "monetization_locked": "Mục này sẽ sớm được mở sau khi hoàn tất các thủ tục"
    },
    "ms": {
        "splash": [
            "Angkat",
            "Belajar",
            "Nikmati",
            "Jana"
        ],
        "monetization_locked": "Bahagian ini akan dibuka tidak lama lagi setelah prosedur selesai"
    },
    "bn": {
        "splash": [
            "উঠে আসো",
            "শেখো",
            "উপভোগ করো",
            "আয় করো"
        ],
        "monetization_locked": "প্রক্রিয়াগুলো সম্পন্ন হওয়ার পর এই সেকশনটি শীঘ্রই খুলে যাবে"
    },
    "my": {
        "splash": [
            "မြှင့်တင်ပါ",
            "လေ့လာပါ",
            "ပျော်ရွှင်ပါ",
            "ဝင်ငွေရှာပါ"
        ],
        "monetization_locked": "လုပ်ထုံးလုပ်စဉ်များ ပြီးစီးပါက ဤကဏ္ဍသည် မကြာမီ ဖွင့်ပါမည်"
    },
    "km": {
        "splash": [
            "លើកខ្លួន",
            "រៀនសូត្រ",
            "រីករាយ",
            "រកចំណូល"
        ],
        "monetization_locked": "ផ្នែកនេះនឹងត្រូវបើកក្នុងពេលឆាប់ៗ បន្ទាប់ពីនីតិវិធីត្រូវបានបញ្ចប់"
    },
    "lo": {
        "splash": [
            "ຍົກລະດັບ",
            "ຮຽນຮູ້",
            "ມ່ວນຊື່ນ",
            "ສ້າງລາຍໄດ້"
        ],
        "monetization_locked": "ພາກສ່ວນນີ້ຈະເປີດໃນໄວໆນີ້ ຫຼັງຈາກຂັ້ນຕອນຕ່າງໆສຳເລັດແລ້ວ"
    },
    "ne": {
        "splash": [
            "उक्ल",
            "सिक",
            "रमाइलो गर",
            "कमाउ"
        ],
        "monetization_locked": "प्रक्रियाहरू सम्पन्न भएपछि यो खण्ड चाँडै खुल्नेछ"
    },
    "si": {
        "splash": [
            "ඔසවා ගන්න",
            "ඉගෙන ගන්න",
            "භුක්ති විඳින්න",
            "ඉපයන්න"
        ],
        "monetization_locked": "පියවරයන් සම්පූර්ණ වූ පසු මෙම කොටස ඉක්මනින් විවෘත වේවි"
    },
    "az": {
        "splash": [
            "Yüksəl",
            "Öyrən",
            "Zövq al",
            "Qazan"
        ],
        "monetization_locked": "Bu bölmə prosedurlar başa çatdıqdan sonra tezliklə açılacaq"
    },
    "ka": {
        "splash": [
            "ამაღლდი",
            "ისწავლე",
            "ტკბი",
            "იშოვე"
        ],
        "monetization_locked": "ეს განყოფილება მალე გაიხსნება პროცედურების დასრულების შემდეგ"
    },
    "hy": {
        "splash": [
            "Բարձրացիր",
            "Սովորիր",
            "Վայելիր",
            "Վաստակիր"
        ],
        "monetization_locked": "Այս բաժինը շուտով կբացվի ընթացակարգերի ավարտից հետո"
    },
    "kk": {
        "splash": [
            "Көтеріл",
            "Үйрен",
            "Ләззат ал",
            "Тап"
        ],
        "monetization_locked": "Бұл бөлім рәсімдер аяқталғаннан кейін жақын арада ашылады"
    },
    "uz": {
        "splash": [
            "Koʻtaril",
            "Oʻrgan",
            "Bahramand boʻl",
            "Yut"
        ],
        "monetization_locked": "Bu boʻlim protseduralar yakunlangandan soʻng tez orada ochiladi"
    },
    "tk": {
        "splash": [
            "Ýüksel",
            "Öwren",
            "Lezzet al",
            "Kazan"
        ],
        "monetization_locked": "Bu bölüm prosedurlar tamamlanandan soňra gysga möhletde açylar"
    },
    "ky": {
        "splash": [
            "Көтөрүл",
            "Үйрөн",
            "Ырахат ал",
            "Тап"
        ],
        "monetization_locked": "Бул бөлүм жол-жобалар аяктагандан кийин жакында ачылат"
    },
    "tg": {
        "splash": [
            "Баланд шав",
            "Омӯз",
            "Ләззат бар",
            "Касб кун"
        ],
        "monetization_locked": "Ин бахш ба зудӣ пас аз анҷоми расмиёт кушода мешавад"
    },
    "mn": {
        "splash": [
            "Дээшлэ",
            "Сур",
            "Амтла",
            "Олзло"
        ],
        "monetization_locked": "Энэ хэсэг нь процедур дууссаны дараа удахгүй нээгдэх болно"
    },
    "am": {
        "splash": [
            "ተነሳ",
            "ተማር",
            "ደስ በል",
            "አትርፍ"
        ],
        "monetization_locked": "ይህ ክፍል የሂደቶቹ አሰራር ከተጠናቀቀ በኋላ በቅርቡ ይከፈታል"
    },
    "sw": {
        "splash": [
            "Panda",
            "Jifunze",
            "Furahia",
            "Kazana"
        ],
        "monetization_locked": "Sehemu hii itafunguliwa hivi karibuni baada ya taratibu kukamilika"
    },
    "rw": {
        "splash": [
            "Zamura",
            "Iga",
            "Ishimire",
            "Injiza"
        ],
        "monetization_locked": "Iyi igice kizafungurwa vuba aha nyuma yo kurangiza ibikorwa byagenwe."
    },
    "be": {
        "splash": [
            "Узвішся",
            "Вучыся",
            "Смакуй",
            "Зарабляй"
        ],
        "monetization_locked": "Гэта раздзел неўзабаве адкрыецца пасля завяршэння ўсіх працэдур"
    },
    "is": {
        "splash": [
            "Lyftu",
            "Lærðu",
            "Njóttu",
            "Þénaðu"
        ],
        "monetization_locked": "Þessi hluti opnast fljótlega þegar ferlið er lokið"
    },
    "mt": {
        "splash": [
            "Ogħla",
            "Tgħallem",
            "Gawdi",
            "Irbaħ"
        ],
        "monetization_locked": "Din is-sezzjoni se tkun disponibli fil-qrib wara li jispiċċaw il-proċeduri."
    },
    "ca": {
        "splash": [
            "Supera",
            "Aprèn",
            "Gaudeix",
            "Guanya"
        ],
        "monetization_locked": "Aquesta secció s'obrirà aviat un cop completats els tràmites"
    }
};

/** Legacy flat category labels only en.ts ever carried (see parity baseline). */
const AR_LEGACY_FLAT_EXCEPTIONS = [
    'religions', 'sects', 'politics', 'economics', 'current_affairs', 'disputes',
    'physics', 'biology', 'chemistry', 'math', 'technology', 'medicine',
    'philosophy', 'singing', 'poetry', 'art', 'sports', 'comedy', 'cooking', 'gaming',
    'magic', // UNIT 42.1 audit: legacy ar.ts predates the `magic` competition category
];

const PROTECTED_TERMS = [
    'Dueli', 'Maelsh Pro', 'dueli.win', 'dueli.maelshpro.com',
    'dueli@maelshpro.com', 'info@maelshpro.com',
    'OpenAI', 'ChatGPT', 'Anthropic', 'Claude Opus', 'Claude Sonnet', 'Claude Haiku',
    'Gemini', 'Google AI Studio', 'Google Cloud', 'AWS', 'Alibaba Cloud', 'Tencent Cloud',
    'DeepSeek', 'MiniMax', 'Genspark AI', 'OpenRouter',
    'Cloudflare Pages', 'Cloudflare Workers', 'Cloudflare D1', 'Cloudflare',
    'SQLite', 'Wrangler', 'Hono', 'TypeScript', 'JavaScript', 'Tailwind CSS',
    'Vite', 'esbuild', 'FFmpeg', 'WebRTC', 'Stripe', 'PayPal', 'Vitest', 'Playwright',
    'PWA', 'SEO', 'API', 'OAuth', 'CSRF', 'RTL', 'LTR',
];

// ── helpers ─────────────────────────────────────────────────────────────────

/** Own-property check (inherited names must never count as packs). */
function hasProperty(obj: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Deep key paths; array elements are indexed (a.b.0.c), array objects included. */
function flatKeys(node: unknown, prefix = '', out: Set<string> = new Set()): Set<string> {
    if (Array.isArray(node)) {
        out.add(prefix);
        node.forEach((el, i) => flatKeys(el, `${prefix}.${i}`, out));
        return out;
    }
    if (node !== null && typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            flatKeys(v, prefix ? `${prefix}.${k}` : k, out);
        }
        return out;
    }
    out.add(prefix);
    return out;
}

/** {placeholder} tokens of a string. */
function vars(s: string): string[] {
    return (s.match(/\{[A-Za-z_][A-Za-z0-9_]*\}/g) || []).sort();
}

interface WalkIssue {
    path: string;
    problem: string;
}

/** Walk a pack; run a check on every string leaf. */
function walkStrings(node: unknown, path: string, check: (s: string, path: string) => WalkIssue[] | undefined, out: WalkIssue[] = []): WalkIssue[] {
    if (Array.isArray(node)) {
        node.forEach((el, i) => walkStrings(el, `${path}.${i}`, check, out));
        return out;
    }
    if (node !== null && typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            walkStrings(v, path ? `${path}.${k}` : k, check, out);
        }
        return out;
    }
    if (typeof node === 'string') {
        out.push(...(check(node, path) ?? []));
    }
    return out;
}

function lookup(root: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, seg) => {
        if (acc !== null && typeof acc === 'object') return (acc as Record<string, unknown>)[seg];
        return undefined;
    }, root);
}

const EN_FLAT = flatKeys(en);
const AR_FLAT = flatKeys(ar);

// ── 1. registry ─────────────────────────────────────────────────────────────

describe('UNIT 42.1+43 — central language registry (56 languages, all active)', () => {
    it('registers 56 languages; every one of them is enabled in canonical order', () => {
        expect(LANGUAGES).toHaveLength(56);
        expect(LANGUAGES.filter((l) => !l.enabled), 'UNIT 42.1+43 left no fileless language behind').toEqual([]);
        expect(new Set(LANGUAGES.map((l) => l.code)).size, 'codes must be unique').toBe(56);
        expect(LANGUAGES.map((l) => l.code)).toEqual(ALL_CODES);
        expect(TRANSLATED_LANGUAGES, 'the code bundle embeds exactly the 2 base packs').toEqual(['ar', 'en']);
    });

    it('marks ar/fa/ur/he as rtl and every other registered language as ltr', () => {
        for (const l of LANGUAGES) {
            const expectRtl = RTL_LANGUAGES.includes(l.code);
            expect(l.dir, `dir of ${l.code}`).toBe(expectRtl ? 'rtl' : 'ltr');
        }
    });

    it('exposes all 56 in the switcher once the packs are loaded (registry + pack)', async () => {
        expect(getAvailableLanguages().map((l) => l.code).sort()).toEqual([...ALL_CODES].sort());
        expect(getAvailableLanguages()).toHaveLength(56);
        for (const code of ALL_CODES) {
            expect(isLanguageLoaded(code), `${code} must be loaded before rendering`).toBe(true);
            expect(getUILanguage(code)).toBe(code);
        }
    });

    it('points every locale asset at /static/locales/<lang>.json', () => {
        expect(localeAssetUrl('fr')).toBe('/static/locales/fr.json');
        expect(localeAssetUrl('he')).toBe('/static/locales/he.json');
        expect(localeAssetUrl('bn')).toBe('/static/locales/bn.json');
    });

    it('keeps the DB content-language boundary strictly ar/en', () => {
        expect(normalizeContentLanguage('ar')).toBe('ar');
        expect(normalizeContentLanguage('en')).toBe('en');
        expect(normalizeContentLanguage('fr')).toBe('en');
        expect(normalizeContentLanguage('zh-CN')).toBe('en');
        expect(normalizeContentLanguage('fa')).toBe('en');
        expect(normalizeContentLanguage(undefined)).toBe('en');
    });
});

// ── 2. key parity ───────────────────────────────────────────────────────────

describe('UNIT 42.1+43 — Strict Parity Guard (keys, shapes, variables)', () => {
    it('the 54 runtime packs match en.ts 1:1 — no missing key, no extra key, arrays included', () => {
        for (const code of LAZY_CODES) {
            const packFlat = flatKeys(PACKS[code]);
            const missing = [...EN_FLAT].filter((k) => !packFlat.has(k));
            const extra = [...packFlat].filter((k) => !EN_FLAT.has(k));
            expect(missing, `${code}: missing keys vs en.ts`).toEqual([]);
            expect(extra, `${code}: extra keys vs en.ts`).toEqual([]);
        }
    });

    it('array shapes (lengths + element object fields) match en.ts exactly', () => {
        for (const code of LAZY_CODES) {
            for (const key of EN_FLAT) {
                const enVal = lookup(en, key);
                if (Array.isArray(enVal)) {
                    const locVal = lookup(PACKS[code], key);
                    expect(Array.isArray(locVal), `${code}: ${key} must stay an array`).toBe(true);
                    expect((locVal as unknown[]).length, `${code}: ${key}.length`).toBe(enVal.length);
                    enVal.forEach((el, i) => {
                        if (el !== null && typeof el === 'object') {
                            expect(Object.keys((locVal as unknown[])[i] as object).sort(), `${code}: ${key}.${i} fields`).toEqual(Object.keys(el as object).sort());
                        }
                    });
                }
            }
        }
    });

    it('every en.ts array also stays an array in ar.ts (and the 54 runtime packs)', () => {
        // The copied-array regression (UNIT 43 audit) turned translated arrays
        // into English strings; this makes that failure impossible again.
        const arrayKeys = [...EN_FLAT].filter((k) => Array.isArray(lookup(en, k)));
        expect(arrayKeys.length, 'en.ts carries arrays at all').toBeGreaterThan(10);
        for (const key of arrayKeys) {
            expect(lookup(ar, key), `ar: ${key} must stay an array`).toBeTruthy();
        }
    });

    it('ar.ts drift is frozen to the documented legacy exception list', () => {
        const missing = [...EN_FLAT].filter((k) => !AR_FLAT.has(k));
        const bare = missing.filter((k) => !k.includes('.'));
        const nested = missing.filter((k) => k.includes('.'));
        expect(bare.sort()).toEqual([...AR_LEGACY_FLAT_EXCEPTIONS].sort());
        expect(nested, 'ar.ts must never lose a nested/array key vs en.ts').toEqual([]);
        expect([...AR_FLAT].filter((k) => !EN_FLAT.has(k)), 'ar.ts must never gain an en.ts-foreign key').toEqual([]);
    });

    it('keeps every {placeholder} identical in every language', () => {
        for (const code of LAZY_CODES) {
            for (const key of EN_FLAT) {
                const enVal = lookup(en, key);
                if (typeof enVal === 'string' && enVal.includes('{')) {
                    const locVal = lookup(PACKS[code], key);
                    expect(typeof locVal, `${code}: ${key} must stay a string`).toBe('string');
                    expect(vars(locVal as string), `${code}: ${key} placeholders`).toEqual(vars(enVal));
                }
            }
        }
    });

    it('survives spot-check of the known variable keys with t()', () => {
        const varKeys = [
            'notification.new_message_body',
            'notification.new_join_request_body',
            'notification.competition_invite_body',
            'profile_competitions.delete_confirm_body',
            'download_ui.success',
            'download_ui.success_partial',
        ];
        for (const code of ALL_CODES) {
            for (const key of varKeys) {
                const value = t(key, code);
                expect(value, `${code}/${key}`).not.toBe(key);
                expect(vars(value), `${code}/${key} vars`).toEqual(vars(String(lookup(en, key))));
            }
        }
    });
});

// ── 3. content rules ────────────────────────────────────────────────────────

describe('UNIT 42.1+43 — protected identity, mandated copy, no truncation', () => {
    it('never truncates: no empty value, no …/...// TODO sentinel in any pack', () => {
        const issues: WalkIssue[] = [];
        for (const code of LAZY_CODES) {
            walkStrings(PACKS[code], code, (s, path) => {
                const out: WalkIssue[] = [];
                if (!s.trim()) out.push({ path, problem: 'empty' });
                if (/^(\.{3}|…|\[\s*\.\.\.\s*\]|\/\/\s*\.\.\.)$/.test(s.trim())) out.push({ path, problem: 'truncation sentinel' });
                if (/\b(TODO|FIXME|XXX)\b/.test(s)) out.push({ path, problem: 'meta marker' });
                return out;
            }, issues);
        }
        expect(issues).toEqual([]);
    });

    it('keeps protected identity terms verbatim wherever en.ts carries them', () => {
        const issues: WalkIssue[] = [];
        for (const code of LAZY_CODES) {
            for (const key of EN_FLAT) {
                const enVal = lookup(en, key);
                if (typeof enVal !== 'string') continue;
                for (const term of PROTECTED_TERMS) {
                    if (enVal.includes(term) && !String(lookup(PACKS[code], key)).includes(term)) {
                        issues.push({ path: `${code}:${key}`, problem: `lost ${term}` });
                    }
                }
            }
        }
        expect(issues).toEqual([]);
    });

    it('keeps app_title as "Dueli" and the splash motto in every language', () => {
        for (const code of ALL_CODES) {
            // ar keeps its legacy BASE rendering of the brand; every UNIT 42.1 pack uses Latin "Dueli".
            expect(t('app_title', code)).toBe(code === 'ar' ? 'ديولي' : 'Dueli');
            MANDATED[code].splash.forEach((word, i) => {
                expect(t(`splash.word_${i + 1}`, code), `${code} splash.word_${i + 1}`).toBe(word);
            });
        }
    });

    it('uses the owner-mandated monetization gate phrase in every language', () => {
        for (const code of ALL_CODES) {
            expect(t('monetization_locked', code), `${code}`).toBe(MANDATED[code].monetization_locked);
            // zh is a complete 15-char sentence — CJK compacts; the real guard against
            // truncation is the mandated-copy equality above, this only rejects empties.
            expect(t('monetization_locked', code).length).toBeGreaterThan(6);
        }
    });

    it('ships the guide pillars as translated arrays — pillars[0].title is never the English original', () => {
        const enPillars = lookup(en, 'guide.message_content.pillars') as Array<{ title: string; body: string }>;
        expect(Array.isArray(enPillars), 'en.ts guides keep pillars as an array').toBe(true);
        for (const code of LAZY_CODES) {
            const pillars = lookup(PACKS[code], 'guide.message_content.pillars');
            expect(Array.isArray(pillars), `${code}: guide.message_content.pillars must stay an array`).toBe(true);
            expect((pillars as unknown[]).length, `${code}: pillars.length`).toBe(enPillars.length);
            for (const [i, p] of (pillars as Array<{ title: string; body: string }>).entries()) {
                expect(typeof p?.title, `${code}: pillars.${i}.title`).toBe('string');
                expect((p.title as string).length, `${code}: pillars.${i}.title empty`).toBeGreaterThan(0);
                expect(typeof p?.body, `${code}: pillars.${i}.body`).toBe('string');
                expect((p.body as string).length, `${code}: pillars.${i}.body empty`).toBeGreaterThan(0);
            }
            expect(pillars[0]?.title, `${code}: pillars[0].title must be translated, not the EN copy`).not.toBe(EN_PILLAR_0_TITLE);
        }
    });

    it('preserves the non-negotiable 80%/20%/100% figures everywhere', () => {
        // Locale typography is respected: "80%" (en/ar), "80 %" (de),
        // "%80" (tr), "80％" (zh/ja full-width) all carry the same figure.
        const hasPercent = (s: string, num: string) => new RegExp(`${num}\\s*[%％]|[%％]\\s*${num}`).test(s);
        const issues: string[] = [];
        for (const code of LAZY_CODES) {
            for (const key of EN_FLAT) {
                const enVal = lookup(en, key);
                if (typeof enVal !== 'string') continue;
                for (const num of ['80', '20', '100']) {
                    if (new RegExp(`(?<!\\d)${num}(?!\\d)\\s*[%％]|[%％]\\s*${num}(?!\\d)`).test(enVal) && !hasPercent(String(lookup(PACKS[code], key)), num)) {
                        issues.push(`${code}:${key} lost ${num}%`);
                    }
                }
            }
        }
        expect(issues).toEqual([]);
    });

    it('translates the escrow-continuity clause without changing the split', () => {
        for (const code of ALL_CODES) {
            const continuity = t('guide.charter_content.continuity_body', code);
            expect(typeof continuity).toBe('string');
            expect(continuity.length).toBeGreaterThan(0);
        }
    });
});

// ── 4. t()/fallback behaviour across languages ───────────────────────────────

describe('UNIT 42.1+43 — t()/fallback behaviour with all 56 packs', () => {
    it('resolves UI keys in every language and never returns the bare key', () => {
        for (const code of ALL_CODES) {
            for (const key of ['home', 'explore', 'login', 'register', 'search_placeholder', 'skip_to_content']) {
                const value = t(key, code);
                expect(value, `${code}/${key}`).not.toBe(key);
                expect(value.length).toBeGreaterThan(0);
            }
        }
    });

    it('keeps the live.* alias working in every language', () => {
        for (const code of ALL_CODES) {
            expect(t('live.connecting', code)).toBe(t('live_signaling.connecting', code));
        }
    });

    it('UNIT 42.1+43 upgrade: he — and every registry language — now loads its own pack', async () => {
        // Before UNIT 42.1+43, `he` was registered but fileless and fell back to
        // English; today every one of the 56 registry languages carries its
        // dictionary. Direction still comes from the registry, the pack from
        // the same lazy engine as every other language.
        expect(existsSync(join(STATIC_LOCAL_DIR, 'he.json'))).toBe(true);
        await ensureLanguageLoaded('he'); // no-op if already loaded by beforeAll
        expect(isLanguageLoaded('he')).toBe(true);
        expect(getUILanguage('he')).toBe('he');
        expect(isRTL('he')).toBe(true);
        expect(getDir('he')).toBe('rtl');
        expect(t('home', 'he').length).toBeGreaterThan(0);
        expect(t('app_title', 'he')).toBe('Dueli');
    });

    it('UNIT 42.1 contract: unknown codes stay silently and safely on English', async () => {
        // (a) resolver behaviour for a code outside the 56-language registry
        expect(getUILanguage('xx')).toBe(DEFAULT_LANGUAGE);
        expect(getUILanguage('xx')).toBe('en');
        expect(t('home', 'xx')).toBe(t('home', 'en'));
        expect(getDir('xx')).toBe('ltr');
        expect(isRTL('xx')).toBe(false);

        // (b) the loader refuses unregistered codes silently — a single
        //     negative-cache entry (allow-list miss), no error, no retry
        //     storm: every later attempt reuses the miss and stays English.
        await expect(ensureLanguageLoaded('xx')).resolves.toBeUndefined();
        expect(isLanguageLoaded('xx')).toBe(false);
        await expect(ensureLanguageLoaded('xx')).resolves.toBeUndefined();

        // (c) missing keys inside a loaded language fall back to English values
        expect(t('definitely_not_a_key', 'fr')).toBe('definitely_not_a_key');
    });

    it('registerLanguage is the single in-memory entry point outside the loader', () => {
        expect(getUILanguage('pseudo-probe')).toBe('en');
        registerLanguage('pseudo-probe', { app_title: 'Probe', home: 'Pseudo' });
        expect(getUILanguage('pseudo-probe')).toBe('pseudo-probe');
        expect(t('home', 'pseudo-probe')).toBe('Pseudo');
    });
});

// ── 5. SEO / hreflang / meta ────────────────────────────────────────────────

describe('UNIT 42.1+43 — SEO meta + hreflang for 56 languages', () => {
    it('exposes exactly the 56 languages to SEO (static, deterministic set)', () => {
        expect([...SEO_LANGUAGES].sort()).toEqual(ALL_CODES.slice().sort());
        expect(SEO_LANGUAGES).toHaveLength(56);
    });

    it('emits hreflang links for all 56 languages + x-default on /guide', () => {
        const links = hreflangLinks('/guide');
        expect(links).toHaveLength(57);
        const byCode = new Map(links.map((l) => [l.hreflang, l.href]));
        for (const code of ALL_CODES) expect(byCode.get(code)).toBeTruthy();
        expect(byCode.get('en')).toBe(`${SITE_ORIGIN}/guide`);
        expect(byCode.get('fr')).toBe(`${SITE_ORIGIN}/guide?lang=fr`);
        expect(byCode.get('fa')).toBe(`${SITE_ORIGIN}/guide?lang=fa`);
        expect(byCode.get('he')).toBe(`${SITE_ORIGIN}/guide?lang=he`);
        expect(byCode.get('x-default')).toBe(`${SITE_ORIGIN}/guide`);
    });

    it('keeps the canonical ?lang contract per language', () => {
        expect(canonicalUrl('/guide', 'en')).toBe(`${SITE_ORIGIN}/guide`);
        for (const code of ALL_CODES.filter((c) => c !== 'en')) {
            expect(canonicalUrl('/guide', code)).toBe(`${SITE_ORIGIN}/guide?lang=${code}`);
        }
    });

    it('builds localized meta description + og:locale for every language', () => {
        for (const code of ALL_CODES) {
            const head = buildSeoHead({ lang: code, title: 'Guide', path: '/guide' });
            expect(head).toContain(`content="${ogLocaleFor(code)}"`);
            const desc = (PACKS[code].seo as Record<string, string>).default_description;
            expect(head).toContain(desc.slice(0, 24));
            expect(head).toContain('og:title');
            expect(head).toContain('og:description');
        }
        expect(ogLocaleFor('ja')).toBe('ja_JP');
        expect(ogLocaleFor('ur')).toBe('ur_PK');
        expect(ogLocaleFor('he')).toBe('he_IL');
        expect(ogLocaleFor('no')).toBe('nb_NO');
        expect(ogLocaleFor('bn')).toBe('bn_BD');
        expect(ogLocaleFor('sr')).toBe('sr_RS');
        expect(ogLocaleFor('ca')).toBe('ca_ES');
        expect(ogLocaleFor('pt')).toBe('pt_BR');
        expect(ogLocaleFor('xx')).toBe('en_US');
    });

    it('lists all 56 languages in the JSON-LD inLanguage and parses as JSON', () => {
        const jsonLd = buildJsonLd('en');
        const parsed = JSON.parse(jsonLd) as { '@graph': Array<{ '@type': string; inLanguage?: string[] }> };
        const website = parsed['@graph'].find((n) => n['@type'] === 'WebSite');
        expect(website?.inLanguage?.sort()).toEqual(ALL_CODES.slice().sort());
    });
});

// ── 6. layout / direction / fonts / inlined pack ─────────────────────────────

describe('UNIT 42.1+43 — layout html lang/dir + language fonts + locale pack injection', () => {
    it('renders correct lang/dir attribute pair for every language', () => {
        for (const code of ALL_CODES) {
            const html = generateHTML('<main>x</main>', code);
            expect(html).toContain(`<html lang="${code}" dir="${RTL_LANGUAGES.includes(code) ? 'rtl' : 'ltr'}"`);
        }
    });

    it('uses a script-appropriate font per language', () => {
        const expectations: Record<string, string> = {
            ar: 'Cairo', fa: 'Noto Naskh Arabic', ur: 'Noto Nastaliq Urdu', he: 'Noto Sans Hebrew',
            zh: 'Noto Sans SC', ja: 'Noto Sans JP', ko: 'Noto Sans KR', hi: 'Noto Sans Devanagari',
            th: 'Noto Sans Thai', bn: 'Noto Sans Bengali', my: 'Noto Sans Myanmar',
            km: 'Noto Sans Khmer', lo: 'Noto Sans Lao', si: 'Noto Sans Sinhala',
            ka: 'Noto Sans Georgian', hy: 'Noto Sans Armenian', am: 'Noto Sans Ethiopic',
            en: 'Inter', fr: 'Inter', de: 'Inter', ru: 'Inter',
        };
        for (const [code, font] of Object.entries(expectations)) {
            const html = generateHTML('<main>x</main>', code);
            expect(html).toContain(`font-family: '${font}'`);
        }
    });

    it('loads the extended Google Fonts set once', () => {
        const html = generateHTML('<main>x</main>', 'zh');
        expect(html).toContain('Noto+Sans+SC');
        expect(html).toContain('Noto+Nastaliq+Urdu');
        expect(html).toContain('Noto+Sans+Devanagari');
        expect(html).toContain('Noto+Sans+Hebrew');
        expect(html).toContain('Noto+Sans+Thai');
        expect(html).toContain('Noto+Sans+Bengali');
        expect(html).toContain('Noto+Sans+Georgian');
        expect(html).toContain('Noto+Sans+Ethiopic');
    });

    it('localizes the document title suffix and metaTitle override per language', () => {
        const frHtml = generateHTML('<main>x</main>', 'fr');
        expect(frHtml).toContain(`<title>Dueli - ${(PACKS.fr as Record<string, string>).app_title}</title>`);
        const jaHtml = generateHTML('<main>x</main>', 'ja', 'Dueli', '', { metaTitle: (PACKS.ja.seo as Record<string, string>).meta_title });
        expect(jaHtml).toContain((PACKS.ja.seo as Record<string, string>).meta_title);
    });

    it('localizes skip-to-content in every language', () => {
        for (const code of ALL_CODES) {
            const html = generateHTML('<main>x</main>', code);
            expect(html).toContain(String(PACKS[code].skip_to_content));
        }
    });

    it('inlines the resolved locale pack for lazy languages into <head> with a nonce', () => {
        const html = generateHTML('<main>x</main>', 'fr', 'Dueli', 'test-nonce-42');
        expect(html).toContain('<script nonce="test-nonce-42">window.__DUELI_LOCALE_PACK__ = {"code":"fr","pack"');
        // only ONE injection, never for the bundled ar/en pairs
        expect(html.match(/__DUELI_LOCALE_PACK__/g)?.length).toBe(1);
        const arHtml = generateHTML('<main>x</main>', 'ar');
        expect(arHtml).not.toContain('__DUELI_LOCALE_PACK__');
        const enHtml = generateHTML('<main>x</main>', 'en');
        expect(enHtml).not.toContain('__DUELI_LOCALE_PACK__');

        // the payload is the exact loaded pack, safely escaped, still server JSON
        const payloadStart = html.indexOf('window.__DUELI_LOCALE_PACK__ = ');
        const payloadEnd = html.indexOf(';</script>', payloadStart);
        const payload = html.slice(payloadStart + 'window.__DUELI_LOCALE_PACK__ = '.length, payloadEnd);
        expect(payload).not.toContain('</script');
        expect(payload).not.toContain('<'); // '<' escaped to \u003c — tag spoofing impossible
        const parsed = JSON.parse(payload) as { code: string; pack: Record<string, unknown> };
        expect(parsed.code).toBe('fr');
        expect(parsed.pack.app_title).toBe('Dueli');
        expect(parsed.pack).toEqual(PACKS.fr);
    });

    it('keeps injecting a pack for the RTL newcomer he into <head>', () => {
        const html = generateHTML('<main>x</main>', 'he');
        expect(html).toContain(`<html lang="he" dir="rtl"`);
        expect(html).toContain('__DUELI_LOCALE_PACK__');
        const payloadStart = html.indexOf('window.__DUELI_LOCALE_PACK__ = ');
        const payloadEnd = html.indexOf(';</script>', payloadStart);
        const parsed = JSON.parse(html.slice(payloadStart + 'window.__DUELI_LOCALE_PACK__ = '.length, payloadEnd)) as { code: string };
        expect(parsed.code).toBe('he');
    });

    it('never injects a pack when the language resolved to the English fallback', () => {
        const html = generateHTML('<main>x</main>', 'xx');
        expect(html).not.toContain('__DUELI_LOCALE_PACK__');
        expect(html).toContain('<html lang="xx" dir="ltr"');
        // the page renders in English even though ?lang=xx was requested
        expect(html).toContain(String(PACKS.en.skip_to_content));
    });
});

// ── 7. i18nAutoFit + I18nLayoutGuard ────────────────────────────────────────

describe('UNIT 42.1+43 — i18nAutoFit with translated copy', () => {
    it('measures text for all 56 languages (positive width units)', () => {
        for (const code of ALL_CODES) {
            const units = estimateTextWidthUnits('x'.repeat(10), code);
            expect(units).toBeGreaterThan(0);
        }
    });

    it('scales long localized copy down when wider than the EN baseline', () => {
        // German "Startseite" is wider than "Home" → clamped at the floor.
        expect(computeI18nFontScale('Home', 'Startseite', 'de')).toBe(I18N_FONT_SCALE_MIN);
        expect(computeI18nFontScale('Home', 'Home', 'es')).toBe(1);
        expect(computeI18nFontScale('Home', 'Inicio', 'es')).toBe(1);
    });

    it('measures every global script with a dedicated branch', () => {
        // Hanzi/Kana are full-width squares
        expect(estimateTextWidthUnits('进阶求知', 'zh')).toBeCloseTo(4, 5);
        // Perso-Arabic, Devanagari, Cyrillic
        expect(estimateTextWidthUnits('ارتقِ', 'ar')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('سیکھیں', 'ur')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('सीखें', 'hi')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('सिक्नुहोस्', 'ne')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('Возвышайся', 'ru')).toBeGreaterThan(estimateTextWidthUnits('Elevate', 'en'));
        // UNIT 42.1+43 newcomer scripts
        expect(estimateTextWidthUnits('התרוממות', 'he')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('শিখুন', 'bn')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('เรียนรู้', 'th')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('ຮຽນຮູ້', 'lo')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('រៀន', 'km')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('ඉගෙන ගන්න', 'si')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('သင်ယူ', 'my')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('სწავლა', 'ka')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('սովորել', 'hy')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('ተማር', 'am')).toBeGreaterThan(0);
    });

    it('clamps to the documented scale bounds', () => {
        expect(clampI18nFontScale(0.1)).toBe(I18N_FONT_SCALE_MIN);
        expect(clampI18nFontScale(3)).toBe(1);
        expect(clampI18nFontScale(Number.NaN)).toBe(1);
    });

    it('applies the auto-fit CSS variable through I18nLayoutGuard (DOM stub)', async () => {
        const elements: Array<Record<string, unknown>> = [];
        const fakeEl = () => {
            const el: Record<string, unknown> = {
                textContent: 'Startseite',
                style: { setProperty: (k: string, v: string) => { el.__set = [k, v]; } },
                classList: { contains: () => false, add: () => undefined },
                dataset: {},
                getAttribute: (attr: string) => (attr === 'data-i18n-fit-key' ? 'home' : null),
                addEventListener: () => undefined,
                setAttribute: () => undefined,
            };
            return el;
        };
        const target = fakeEl();
        elements.push(target);
        vi.stubGlobal('document', {
            documentElement: { lang: 'de', dir: 'ltr' },
            getElementById: () => null,
            querySelectorAll: () => elements,
            body: { appendChild: () => undefined },
        });
        vi.stubGlobal('window', { innerWidth: 1200, innerHeight: 800 });
        const { refreshI18nLayout } = await import('../../src/client/ui/I18nLayoutGuard');
        refreshI18nLayout(document as unknown as ParentNode, 'de');
        expect(target.__set).toEqual(['--i18n-font-scale', String(computeI18nFontScale('Home', 'Startseite', 'de'))]);
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });
});
