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

## הוספת/החלפת תמונות

- גלריה: הוסיפו קובץ ל-`assets/gallery/` (פורמט 3:4 מומלץ) ורשומה תואמת ב-
  `content/gallery.json`
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
