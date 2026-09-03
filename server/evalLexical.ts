import {
  buildSearchDocument,
  lexicalSynonyms,
  searchFields,
  type FootageClip,
  type RankedFootage,
} from "./footage";

const CJK_CODE_POINT = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

function unique(values: string[]) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function isCjkChar(char: string) {
  return CJK_CODE_POINT.test(char);
}

function isLatinToken(token: string) {
  return /^[a-z0-9]+$/.test(token);
}

export function queryTokensMultilingual(query: string): string[] {
  const latin = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const cjkChars = Array.from(query).filter(isCjkChar);
  const grams = [...cjkChars];
  for (let index = 0; index < cjkChars.length - 1; index += 1) {
    grams.push(`${cjkChars[index]}${cjkChars[index + 1]}`);
  }
  return unique([...latin, ...grams]);
}

function normalizeMultilingual(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaffa-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandedConcepts(token: string) {
  if (!isLatinToken(token)) return [token];
  return unique([token, ...(lexicalSynonyms[token] ?? [])]).map(
    normalizeMultilingual
  );
}

function scoreField(
  field: ReturnType<typeof searchFields>[number],
  tokens: string[]
) {
  const normalizedValues = field.values
    .map(value => ({ raw: value, normalized: normalizeMultilingual(value) }))
    .filter(value => value.normalized);
  const matched: Array<{ field: string; value: string }> = [];
  const matchedTokens = new Set<string>();

  for (const token of tokens) {
    if (matchedTokens.has(token)) continue;
    const concepts = expandedConcepts(token);
    const match = normalizedValues.find(value =>
      concepts.some(concept => value.normalized.includes(concept))
    );
    if (!match) continue;
    matchedTokens.add(token);
    if (
      !matched.some(
        reason => reason.field === field.label && reason.value === match.raw
      )
    ) {
      matched.push({ field: field.label, value: match.raw });
    }
  }

  const cappedMatches = Math.min(matchedTokens.size, field.maxMatches);
  return {
    score: cappedMatches * field.weight,
    reasons: matched.slice(0, field.maxMatches),
  };
}

export function rankFootageA1(
  clips: FootageClip[],
  query: string
): RankedFootage[] {
  const tokens = queryTokensMultilingual(query);
  if (!tokens.length) return [];
  return clips
    .map(clip => {
      const fieldScores = searchFields(buildSearchDocument(clip)).map(field =>
        scoreField(field, tokens)
      );
      const score = fieldScores.reduce((sum, field) => sum + field.score, 0);
      const reasons = unique(
        fieldScores.flatMap(field =>
          field.reasons.map(reason => `${reason.field}: ${reason.value}`)
        )
      ).slice(0, 4);
      return { clip, score, reasons };
    })
    .filter(item => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return Number(right.clip.id) - Number(left.clip.id);
    });
}
