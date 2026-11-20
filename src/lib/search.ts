/**
 * Keyword or question? Used by the search boxes to switch to AI search automatically.
 * A VIN, a stock number, a year or one word ("civic", "f-150") stay a normal search;
 * a sentence ("red SUV under 25000 with low mileage") goes to the AI.
 */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^[A-HJ-NPR-Z0-9]{11,17}$/i.test(t.replace(/[\s-]/g, ''))) return false; // VIN (or most of one)
  const words = t.split(/\s+/);
  // the server's keyword search matches ONE word or code, so two or more words are a question for the AI
  if (words.length >= 2) return true;
  if (/\b(under|over|below|above|less|more|than|between|with|without|cheapest|newest|oldest|lowest|highest|low|high|which|what|how|show|find|listed|days|miles|mileage|price|sold|draft|pending|available|photos?)\b/i.test(t)) return true;
  if (/[$<>?]/.test(t)) return true;
  return false;
}
