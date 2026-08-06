# פשוט ליצור — אתר לידים

דף נחיתה סטטי לסדנאות טיח פולימרי. מטרת הדף: הנעה לפנייה בוואטסאפ.

## קבצים

```
index.html            ← כל האתר (HTML + CSS + JS בקובץ אחד)
CNAME                 ← דומיין מותאם אישית (pashutlitzor.com)
frames/               ← 45 פריימים (ezgif-frame-001.png … 045.png) לאנימציית הגלילה
assets/
  gallery/            ← photo-1.jpg, photo-2.jpg … תמונות הגלריה
  corporate.jpg       ← תמונת אירוע חברה
  branding/
    logo-removebg-preview.png  ← לוגו המותג
    favicon.png
    og-image.jpg      ← תמונת שיתוף לרשתות חברתיות
content/               ← תוכן שניתן לעריכה בלי לגעת בקוד (JSON)
  gallery.json          תמונות הגלריה + תיאור לכל תמונה
  testimonials.json      המלצות לקוחות
  corporate.json         תמונת אירוע חברה
  workshops.json         כרטיסי הסדנאות
admin/                 ← ממשק העריכה הגרפי (Decap CMS)
  index.html
  config.yml
oauth-worker/          ← פרוקסי OAuth (Cloudflare Worker) שמאפשר כניסה ל-/admin
  worker.js
  wrangler.toml
```

## הפעלה

```bash
python3 -m http.server 4599
# http://localhost:4599
```

## מבנה האתר

| Section | ID | תיאור |
|---|---|---|
| ניווט | `#navbar` | Fixed, glassmorphism בגלילה |
| אנימציית גלילה | `#canvas-sequence` | 45 פריימים, reverse playback, crossfade |
| גיבור | `#hero` | CTA ראשי + לוגו-watermark |
| מושג | `#concept` | "מה זה טיח פולימרי?" |
| סדנאות | `#workshops` | 4 כרטיסים |
| גלריה | `#gallery` | תמונות masonry (מספר משתנה) |
| לארגונים | `#corporate` | B2B, סטטיסטיקות, value props |
| המלצות | `#testimonials` | 4 ציטוטים, carousel mobile |
| CTA סגירה | `#contact` | כפתור וואטסאפ + כפתור אינסטגרם |
| פוטר | `footer` | לוגו + קישור אינסטגרם + קופירייט |

## עריכת תוכן — ממשק גרפי ללקוחה (/admin)

הגלריה, ההמלצות, תמונת האירוע החברתי וכרטיסי הסדנאות **לא כתובים בקוד** —
הם נטענים בזמן ריצה מתוך קובצי `content/*.json`. זה מאפשר לערוך אותם דרך
ממשק גרפי בכתובת **`/admin`** (למשל `pashutlitzor.com/admin`), בלי לגעת
בקוד בכלל: התחברות עם GitHub, טופס עם שדות (תמונה + תיאור, טקסט המלצה
וכו'), כפתור "שמור ופרסם" — והאתר החי מתעדכן בעקבות זה אוטומטית.

> ⏱️ **חשוב לדעת**: אחרי לחיצה על "שמור ופרסם", GitHub Pages בונה מחדש את
> האתר תוך כדקה. אבל האתר לא מוגש ישירות מהשרת שבנה אותו — הוא מוגש דרך
> רשת קאש גלובלית (CDN), וכל שרת קאש כזה יכול להחזיק גרסה ישנה של הקבצים
> **עד כ-10 דקות**, גם אחרי שהבנייה כבר הסתיימה. זה קורה גם בגלישה
> פרטית/בסתר, כי זה לא קשור לקאש של הדפדפן אלא לקאש של השרת. אז אם שינוי
> לא נראה מיד באתר החי — זה לא סימן לתקלה, פשוט כדאי לחכות עד 10 דקות
> ולבדוק שוב.

### הקמה חד-פעמית (רק בפעם הראשונה)

1. **GitHub OAuth App** — בהגדרות GitHub (Settings → Developer settings →
   OAuth Apps → New OAuth App) ליצור אפליקציה עם:
   - Homepage URL: `https://pashutlitzor.com`
   - Authorization callback URL: `https://<כתובת-ה-worker>/callback` (מתקבלת
     בשלב הבא)
   - לשמור את ה-Client ID וה-Client Secret שנוצרים (הם רגישים — לא לשתף)
2. **פריסת הפרוקסי** (`oauth-worker/`, חינמי ב-Cloudflare Workers):
   ```bash
   cd oauth-worker
   npx wrangler deploy
   npx wrangler secret put OAUTH_CLIENT_ID
   npx wrangler secret put OAUTH_CLIENT_SECRET
   ```
   הפקודה הראשונה מדפיסה כתובת (`https://....workers.dev`) — זו הכתובת
   שמשלימים בה את ה-callback URL בשלב 1, ואותה יש להכניס ל-`base_url`
   בקובץ `admin/config.yml` (במקום `REPLACE-WITH-OAUTH-WORKER-URL`).
3. **הזמנת הלקוחה לריפו** — ב-GitHub, Settings → Collaborators, להזמין
   לפי כתובת האימייל שלה עם הרשאת Write. היא תקבל מייל, תיצור חשבון
   GitHub חינמי אם אין לה (רק פעם אחת), ותאשר.

לאחר מכן היא נכנסת ל-`pashutlitzor.com/admin`, לוחצת "Login with GitHub"
(חד פעמי), ומקבלת ממשק עריכה גרפי מלא.

### הוספת/החלפת תמונות ידנית (בלי /admin)

- גלריה: הוסיפו קובץ ל-`assets/gallery/` ורשומה תואמת ב-`content/gallery.json`
- תמונת אירוע חברה: `assets/corporate.jpg` + `content/corporate.json`

> כאשר קובץ תמונה חסר — האתר מציג placeholder אוטומטי.

## פרטי קשר

- וואטסאפ: `972525477845`
- אינסטגרם: `@dina_evgi` — `https://www.instagram.com/dina_evgi?igsh=NWgyeW82cmZkeXp0`

## טכנולוגיות

- Vanilla HTML/CSS/JS — אין תלויות חיצוניות
- Google Fonts: Heebo + DM Mono
- כיוון: RTL עברית (`dir="rtl" lang="he"`)
- Canvas scroll-sequence: crossfade בין פריימים (`globalAlpha` blend)
- אנימציית גלילה: לולאת `requestAnimationFrame` רציפה (חלקה גם בגלילה מהירה)
