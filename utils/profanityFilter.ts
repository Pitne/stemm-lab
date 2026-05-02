const BadWordsFilter = require('bad-words').Filter;
const filter = new BadWordsFilter();

export function containsProfanity(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  try {
    return filter.isProfane(text);
  } catch {
    return true;
  }
}

export function cleanText(text: string): string {
  if (!text || text.trim().length === 0) return text;
  try {
    return filter.clean(text);
  } catch {
    return text;
  }
}