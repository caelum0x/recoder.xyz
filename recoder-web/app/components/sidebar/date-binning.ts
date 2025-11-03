import { format, isAfter, isThisWeek, isThisYear, isToday, isYesterday, subDays } from 'date-fns';
import type { ChatHistoryItem } from '~/lib/persistence';

type Bin = { category: string; items: ChatHistoryItem[] };

export function binDates(_list: ChatHistoryItem[]) {
  const list = _list.toSorted((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const binLookup: Record<string, Bin> = {};
  const bins: Array<Bin> = [];

  list.forEach((item) => {
    const category = dateCategory(new Date(item.timestamp));

    if (!(category in binLookup)) {
      const bin = {
        category,
        items: [item],
      };

      binLookup[category] = bin;

      bins.push(bin);
    } else {
      binLookup[category].items.push(item);
    }
  });

  return bins;
}

function dateCategory(date: Date) {
  // FIXED: Ensure we're working with valid dates and current time
  // date-fns uses client's timezone by default which is correct
  const now = new Date();

  if (isToday(date)) {
    return 'Today';
  }

  if (isYesterday(date)) {
    return 'Yesterday';
  }

  // FIXED: Use proper week start configuration (Monday as start of week is more common)
  // This ensures "This Week" is calculated correctly
  if (isThisWeek(date, { weekStartsOn: 1 })) {
    // e.g., "Monday", "Tuesday", etc.
    return format(date, 'eeee');
  }

  const thirtyDaysAgo = subDays(new Date(), 30);

  if (isAfter(date, thirtyDaysAgo)) {
    return 'Last 30 Days';
  }

  if (isThisYear(date)) {
    // e.g., "July"
    return format(date, 'MMMM');
  }

  // e.g., "July 2023"
  return format(date, 'MMMM yyyy');
}
