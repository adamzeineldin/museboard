// Text normalisation for the local embedder: lowercase, protect tech names that contain symbols,
// split on non-alphanumerics, drop stopwords and bare numbers, then a light suffix stemmer.

const SYMBOL_TERMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/c\+\+/g, " cplusplus "],
  [/c#/g, " csharp "],
  [/f#/g, " fsharp "],
  [/(^|[^a-z0-9])\.net\b/g, "$1 dotnet "],
  [/\bnode\.?js\b/g, " nodejs "],
  [/\bnext\.?js\b/g, " nextjs "],
  [/\bvue\.?js\b/g, " vuejs "],
  [/\bexpress\.?js\b/g, " expressjs "],
  [/\breact\.?js\b/g, " react "],
  [/\bci\/cd\b/g, " cicd "],
];

const PROTECTED_TOKENS: ReadonlySet<string> = new Set(
  SYMBOL_TERMS.map(([, replacement]) => replacement.replace(/\$1/, "").trim()),
);

export const STOPWORDS: ReadonlySet<string> = new Set(
  (
    "a about above after again against all also am an and any are as at be because been before being below " +
    "between both but by can could did do does doing down during each etc few for from further had has have " +
    "having he her here hers herself him himself his how i if in into is it its itself just me more most my " +
    "myself no nor not now of off on once only or other our ours ourselves out over own per same she should so " +
    "some such than that the their theirs them themselves then there these they this those through to too under " +
    "until up us very via was we were what when where which while who whom why will with would you your yours " +
    "yourself yourselves within across using use used e g ie eg inc llc ll ve re"
  ).split(" "),
);

/** Very small suffix stemmer: enough to fold plurals and -ing/-ed forms together. */
export function stemLite(word: string): string {
  if (word.length <= 3 || word.endsWith("js") || PROTECTED_TOKENS.has(word)) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  const keepS = /(ss|us)$/.test(word) || (word.endsWith("is") && word.length > 4);
  if (word.endsWith("s") && !keepS) return word.slice(0, -1);
  return word;
}

function protectSymbols(text: string): string {
  return SYMBOL_TERMS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

/** Normalised, stemmed content tokens in document order. */
export function tokenize(text: string): string[] {
  const lowered = protectSymbols(text.toLowerCase());
  return lowered
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !/^\d+$/.test(token) && !STOPWORDS.has(token))
    .map(stemLite)
    .filter((token) => !STOPWORDS.has(token));
}
