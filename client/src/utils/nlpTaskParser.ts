import { TaskPriority } from '../types';

export interface ParsedTaskInput {
  raw: string;
  title: string;
  dueDate?: string;
  dueAt?: string;
  timeStr?: string;
  priority: TaskPriority;
  tags: string[];
  recurrenceRule?: string;
  hasParsedData: boolean;
}

export function parseNaturalLanguageTask(input: string): ParsedTaskInput {
  const raw = input.trim();
  if (!raw) {
    return {
      raw,
      title: '',
      priority: 'MEDIUM',
      tags: [],
      hasParsedData: false,
    };
  }

  let text = ` ${raw} `;
  let priority: TaskPriority = 'MEDIUM';
  const tags: string[] = [];
  let dueDateText = '';
  let dueTimeText = '';
  let recurrence = '';
  let calculatedDueDate: Date | null = null;

  // 1. Extract Tags (#tag)
  const tagRegex = /#([a-zA-Z0-9_\-]+)/g;
  let tagMatch;
  while ((tagMatch = tagRegex.exec(text)) !== null) {
    tags.push(tagMatch[1].toLowerCase());
  }
  text = text.replace(tagRegex, ' ');

  // 2. Extract Priority (urgent, high, medium, low, p1, p2, p3, p4, !urgent, etc.)
  if (/\b(!urgent|urgent|p1)\b/i.test(text)) {
    priority = 'URGENT';
    text = text.replace(/\b(!urgent|urgent|p1)\b/gi, ' ');
  } else if (/\b(!high|high|p2)\b/i.test(text)) {
    priority = 'HIGH';
    text = text.replace(/\b(!high|high|p2)\b/gi, ' ');
  } else if (/\b(!low|low|p4)\b/i.test(text)) {
    priority = 'LOW';
    text = text.replace(/\b(!low|low|p4)\b/gi, ' ');
  } else if (/\b(!medium|medium|normal|p3)\b/i.test(text)) {
    priority = 'MEDIUM';
    text = text.replace(/\b(!medium|medium|normal|p3)\b/gi, ' ');
  }

  // 3. Extract Recurrence (every day, daily, weekly, every week, every monday, etc.)
  if (/\b(every\s+day|daily)\b/i.test(text)) {
    recurrence = 'Daily';
    text = text.replace(/\b(every\s+day|daily)\b/gi, ' ');
  } else if (/\b(every\s+weekday|weekdays)\b/i.test(text)) {
    recurrence = 'Weekdays';
    text = text.replace(/\b(every\s+weekday|weekdays)\b/gi, ' ');
  } else if (/\b(every\s+week|weekly)\b/i.test(text)) {
    recurrence = 'Weekly';
    text = text.replace(/\b(every\s+week|weekly)\b/gi, ' ');
  } else if (/\b(every\s+month|monthly)\b/i.test(text)) {
    recurrence = 'Monthly';
    text = text.replace(/\b(every\s+month|monthly)\b/gi, ' ');
  } else if (/\b(every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(text)) {
    const match = text.match(/\b(every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i);
    if (match) {
      recurrence = `Every ${match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase()}`;
      text = text.replace(match[0], ' ');
    }
  }

  // 4. Extract Times (8pm, 8:30pm, at 8:00, 14:00, evening, morning)
  const timeRegex = /\b(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})\b/i;
  const timeMatch = text.match(timeRegex);
  if (timeMatch) {
    dueTimeText = timeMatch[1].toUpperCase();
    text = text.replace(timeMatch[0], ' ');
  } else if (/\b(in\s+the\s+evening|evening|tonight)\b/i.test(text)) {
    dueTimeText = '7:00 PM';
    text = text.replace(/\b(in\s+the\s+evening|evening|tonight)\b/gi, ' ');
  } else if (/\b(in\s+the\s+morning|morning)\b/i.test(text)) {
    dueTimeText = '9:00 AM';
    text = text.replace(/\b(in\s+the\s+morning|morning)\b/gi, ' ');
  } else if (/\b(in\s+the\s+afternoon|afternoon)\b/i.test(text)) {
    dueTimeText = '2:00 PM';
    text = text.replace(/\b(in\s+the\s+afternoon|afternoon)\b/gi, ' ');
  }

  // 5. Extract Dates (today, tomorrow, next week, day of week)
  const now = new Date();
  if (/\b(today)\b/i.test(text)) {
    dueDateText = 'Today';
    calculatedDueDate = new Date();
    text = text.replace(/\b(today)\b/gi, ' ');
  } else if (/\b(tomorrow|tmrw)\b/i.test(text)) {
    dueDateText = 'Tomorrow';
    calculatedDueDate = new Date();
    calculatedDueDate.setDate(calculatedDueDate.getDate() + 1);
    text = text.replace(/\b(tomorrow|tmrw)\b/gi, ' ');
  } else if (/\b(next\s+week)\b/i.test(text)) {
    dueDateText = 'Next week';
    calculatedDueDate = new Date();
    calculatedDueDate.setDate(calculatedDueDate.getDate() + 7);
    text = text.replace(/\b(next\s+week)\b/gi, ' ');
  } else {
    // Weekdays
    const daysMap: Record<string, number> = {
      sunday: 0, sun: 0,
      monday: 1, mon: 1,
      tuesday: 2, tue: 2,
      wednesday: 3, wed: 3,
      thursday: 4, thu: 4,
      friday: 5, fri: 5,
      saturday: 6, sat: 6,
    };
    const dayRegex = /\b(?:on\s+)?(next\s+)?(monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)\b/i;
    const dayMatch = text.match(dayRegex);
    if (dayMatch) {
      const isNext = Boolean(dayMatch[1]);
      const targetDay = daysMap[dayMatch[2].toLowerCase()];
      const currentDay = now.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      if (isNext) diff += 7;

      calculatedDueDate = new Date();
      calculatedDueDate.setDate(calculatedDueDate.getDate() + diff);
      dueDateText = dayMatch[2].charAt(0).toUpperCase() + dayMatch[2].slice(1).toLowerCase();
      text = text.replace(dayMatch[0], ' ');
    }
  }

  // Clean title
  let cleanTitle = text.replace(/\s+/g, ' ').trim();
  // Remove trailing prepositions like "at", "by", "on", "for"
  cleanTitle = cleanTitle.replace(/\s+(at|by|on|for)$/i, '').trim();

  // If title became completely empty, fall back to raw input
  if (!cleanTitle) {
    cleanTitle = raw;
  }

  // Format ISO due_at and display date
  let dueAtStr: string | undefined = undefined;
  if (calculatedDueDate) {
    if (dueTimeText) {
      // Parse time into calculatedDueDate
      const match = dueTimeText.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = match[2] ? parseInt(match[2], 10) : 0;
        const meridian = match[3]?.toUpperCase();
        if (meridian === 'PM' && hours < 12) hours += 12;
        if (meridian === 'AM' && hours === 12) hours = 0;
        calculatedDueDate.setHours(hours, minutes, 0, 0);
      }
    } else {
      calculatedDueDate.setHours(18, 0, 0, 0); // Default 6:00 PM
    }
    dueAtStr = calculatedDueDate.toISOString();
  }

  const finalDueDate = dueDateText
    ? (dueTimeText ? `${dueDateText} · ${dueTimeText}` : dueDateText)
    : (dueTimeText ? `Today · ${dueTimeText}` : undefined);

  const hasParsedData = Boolean(
    dueDateText || dueTimeText || priority !== 'MEDIUM' || tags.length > 0 || recurrence
  );

  return {
    raw,
    title: cleanTitle,
    dueDate: finalDueDate,
    dueAt: dueAtStr,
    timeStr: dueTimeText,
    priority,
    tags,
    recurrenceRule: recurrence || undefined,
    hasParsedData,
  };
}
