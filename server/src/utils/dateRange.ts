/**
 * Date Range Utilities for Timezone-Aware Task History & Reporting
 * Supports Monday -> Sunday week boundaries and natural date parsing.
 */

export interface DateRange {
  start: string; // ISO string or YYYY-MM-DD HH:mm:ss
  end: string;
  startDateStr: string; // YYYY-MM-DD
  endDateStr: string;   // YYYY-MM-DD
  label: string;
}

/**
 * Normalizes any date value (Date instance, ISO string, SQL timestamp string) to an ISO string or empty string.
 */
export function normalizeDate(val: any): string {
  if (!val) return '';
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? '' : val.toISOString();
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return '';
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
    return trimmed;
  }
  return String(val);
}

/**
 * Extracts YYYY-MM-DD from any date representation safely.
 */
export function extractDayString(val: any): string {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const iso = normalizeDate(val);
  if (!iso) return '';
  return iso.split('T')[0].split(' ')[0];
}


/**
 * Get day range (00:00:00.000 to 23:59:59.999) for a given date in local/specified timezone.
 */
export function getUserDayRange(targetDate?: string | Date, timezoneOffsetHours: number = 0): DateRange {
  const now = targetDate ? new Date(targetDate) : new Date();
  
  // Adjust for timezone offset if supplied (in minutes/hours)
  const d = new Date(now.getTime() + timezoneOffsetHours * 3600000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  return {
    start: `${dateStr} 00:00:00`,
    end: `${dateStr} 23:59:59`,
    startDateStr: dateStr,
    endDateStr: dateStr,
    label: 'Day'
  };
}

/**
 * Get Monday -> Sunday week range.
 * weekOffset: 0 for current week, -1 for last week, +1 for next week.
 */
export function getUserWeekRange(weekOffset: number = 0, timezoneOffsetHours: number = 0): DateRange {
  const now = new Date();
  const d = new Date(now.getTime() + timezoneOffsetHours * 3600000);
  
  // Day of week: 0 (Sun), 1 (Mon), ..., 6 (Sat)
  const currentDay = d.getUTCDay();
  // Distance from Monday (if currentDay is 0 (Sunday), diff is -6; if 1 (Monday), diff is 0; if 2 (Tuesday), diff is 1)
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday + (weekOffset * 7));

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const format = (date: Date) => {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const startStr = format(monday);
  const endStr = format(sunday);

  return {
    start: `${startStr} 00:00:00`,
    end: `${endStr} 23:59:59`,
    startDateStr: startStr,
    endDateStr: endStr,
    label: weekOffset === 0 ? 'This Week' : weekOffset === -1 ? 'Last Week' : `Week (${startStr})`
  };
}

/**
 * Get month range (1st of month to end of month).
 */
export function getUserMonthRange(monthOffset: number = 0, timezoneOffsetHours: number = 0): DateRange {
  const now = new Date();
  const d = new Date(now.getTime() + timezoneOffsetHours * 3600000);
  
  const targetYear = d.getUTCFullYear();
  const targetMonth = d.getUTCMonth() + monthOffset;
  
  const firstDay = new Date(Date.UTC(targetYear, targetMonth, 1));
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0));

  const format = (date: Date) => {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const startStr = format(firstDay);
  const endStr = format(lastDay);

  return {
    start: `${startStr} 00:00:00`,
    end: `${endStr} 23:59:59`,
    startDateStr: startStr,
    endDateStr: endStr,
    label: monthOffset === 0 ? 'This Month' : monthOffset === -1 ? 'Last Month' : `Month (${startStr})`
  };
}

/**
 * Natural date language parser for Spark voice & search queries.
 */
export function parseNaturalDateExpression(text: string): DateRange | null {
  const lower = text.toLowerCase().trim();

  if (lower.includes('yesterday')) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    return getUserDayRange(yesterday);
  }

  if (lower.includes('today') || lower.includes("today's") || lower.includes('so far today')) {
    return getUserDayRange();
  }

  if (lower.includes('last week') || lower.includes('previous week') || lower.includes('past week')) {
    return getUserWeekRange(-1);
  }

  if (lower.includes('this week') || lower.includes('current week') || lower.includes('weekly') || lower.includes('this week’s')) {
    return getUserWeekRange(0);
  }

  if (lower.includes('last month') || lower.includes('previous month')) {
    return getUserMonthRange(-1);
  }

  if (lower.includes('this month') || lower.includes('current month') || lower.includes('monthly')) {
    return getUserMonthRange(0);
  }

  // Check specific day names in current week (e.g. "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < dayNames.length; i++) {
    const day = dayNames[i];
    if (lower.includes(day)) {
      const now = new Date();
      const currentDay = now.getDay();
      let diff = i - currentDay;
      if (lower.includes('last ' + day)) {
        diff -= 7;
      }
      const target = new Date(now.getTime() + diff * 86400000);
      return getUserDayRange(target);
    }
  }

  return null;
}
