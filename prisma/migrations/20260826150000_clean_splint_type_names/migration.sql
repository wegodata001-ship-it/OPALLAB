-- Remove emoji prefixes from system / seeded splint type display names.
UPDATE "SplintType" SET "name" = 'סד לילה', "updatedAt" = CURRENT_TIMESTAMP
WHERE ("id" = 'splint_night_guard' OR "code" = 'NIGHT_GUARD') AND "name" <> 'סד לילה';

UPDATE "SplintType" SET "name" = 'סד הלבנה', "updatedAt" = CURRENT_TIMESTAMP
WHERE ("id" = 'splint_whitening' OR "code" = 'WHITENING') AND "name" <> 'סד הלבנה';

UPDATE "SplintType" SET "name" = 'סד חרוט', "updatedAt" = CURRENT_TIMESTAMP
WHERE ("id" = 'splint_surgical' OR "code" = 'SURGICAL') AND "name" <> 'סד חרוט';

UPDATE "SplintType" SET "name" = 'OMNIVAC', "updatedAt" = CURRENT_TIMESTAMP
WHERE ("id" = 'splint_omnivac' OR "code" = 'OMNIVAC') AND "name" <> 'OMNIVAC';
