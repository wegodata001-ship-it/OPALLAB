# OPAL LAB - מערכת ניהול מעבדת שיניים

מערכת ניהול End-to-End למעבדת השיניים OPAL LAB. בשלב זה המערכת עובדת עם **Mock Data מקומי** בלבד, ללא חיבור ל-Database.

## התקנה והרצה

```bash
npm install
npm run dev
```

פתח [http://localhost:3000](http://localhost:3000)

## מודולים (גרסה 2)

| מודול | נתיב | תיאור |
|-------|------|--------|
| כניסה | `/` | התחברות עם שם משתמש וסיסמה |
| לוח בקרה | `/dashboard` | סקירה כללית |
| הזמנות | `/orders` | רשימה + הזמנה חדשה + העלאת קבצים |
| מעקב ייצור | `/workflow` | סימון ✓ לפי שלב ועובד |
| מלאי | `/inventory` | כל סוגי המלאי בלשונית אחת |
| כרטסות | `/accounts` | רופאים, עובדים, תשלומים |
| אריזה ושילוח | `/shipping` | תעודת משלוח לפני יציאה |
| נוכחות NFC | `/attendance` | קיוסק נפרד + גיאופנס |
| פורטל רופא | `/portal` | לרופאים בלבד |

## התחברות (דמו)

סיסמה לכולם: `1234`

| משתמש | תפקיד |
|--------|--------|
| admin | מנהל |
| amir | בעלים |
| sara | מזכירות |
| mohamed | מעצב |
| drmansour | רופא |

## ארכיטקטורה

```
src/
├── app/                    # Next.js App Router (דפים)
├── components/             # רכיבי UI
├── lib/
│   ├── types/              # TypeScript types (תואם Prisma)
│   ├── mock-data/          # נתוני דמו
│   ├── repositories/       # ממשקים להחלפה ב-Prisma
│   └── constants/          # תרגומים וקבועים
├── providers/
│   └── AppProvider.tsx     # State management (Mock)
prisma/
└── schema.prisma           # Schema מלא (ללא migrations)
```

## חיבור ל-Supabase (שלב הבא)

1. הגדר `DATABASE_URL` ב-`.env`
2. הרץ `npx prisma migrate dev`
3. צור repositories ב-`src/lib/repositories/prisma/`
4. החלף את `AppProvider` לשימוש ב-Prisma

ממשקי ה-repository מוגדרים ב-`src/lib/repositories/interfaces.ts`.

## תפקידים

- מנהל (ADMIN)
- מזכירות (SECRETARY)
- מעצב (DESIGNER)
- הדפסה (PRINTER)
- חריטה (MILLING)
- עיבוד (PROCESSING)
- גימור (FINISH)
- בעלים (OWNER)

ניתן להחליף תפקיד דרך תפריט בראש כל דף (לצורכי הדגמה).

## טכנולוגיות

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS 4
- Prisma (schema only)
- RTL + עברית
