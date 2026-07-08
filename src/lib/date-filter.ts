import type { DateRange } from "@/lib/types";

export function isInDateRange(date: Date, range: DateRange): boolean {
  if (range.from && date < range.from) return false;
  if (range.to) {
    const end = new Date(range.to);
    end.setHours(23, 59, 59, 999);
    if (date > end) return false;
  }
  return true;
}

export function filterByDateRange<T>(items: T[], getDate: (item: T) => Date, range: DateRange): T[] {
  if (!range.from && !range.to) return items;
  return items.filter((item) => isInDateRange(getDate(item), range));
}
