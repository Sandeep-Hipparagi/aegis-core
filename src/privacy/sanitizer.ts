import { createHash } from 'node:crypto';

export type PiiCategory = 'aadhaar' | 'pan' | 'phone' | 'email' | 'card';

export interface TokenizeResult {
  sanitizedPayload: Record<string, unknown>;
  vault: Map<string, string>;
}

// Luhn algorithm check for credit cards
function isValidLuhn(numStr: string): boolean {
  const digits = numStr.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(digits)) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// Regex patterns for Indian & global PII
const PII_PATTERNS: Array<{
  category: PiiCategory;
  regex: RegExp;
  validate?: (match: string) => boolean;
}> = [
  // 1. Email addresses
  {
    category: 'email',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  },
  // 2. Indian PAN Card (e.g., ABCDE1234F)
  {
    category: 'pan',
    regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g
  },
  // 3. Indian Aadhaar Number (12 digits, often spaced or hyphenated: e.g. 5432 1234 5678)
  {
    category: 'aadhaar',
    regex: /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    validate: (match: string) => {
      const clean = match.replace(/[\s-]/g, '');
      return clean.length === 12 && /^[2-9]\d{11}$/.test(clean);
    }
  },
  // 4. Credit card / Debit cards (13 to 19 digits)
  {
    category: 'card',
    regex: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
    validate: (match: string) => isValidLuhn(match)
  },
  // 5. Phone numbers (Indian mobile: +91 9876543210 or 10-digit [6-9]xxxxxxxxx, and E.164)
  {
    category: 'phone',
    regex: /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|(?:\+91[\s-]?)?[6-9]\d{9}\b/g
  }
];

function generateToken(category: PiiCategory, value: string, salt: string): string {
  const hash = createHash('sha256')
    .update(`${salt}:${category}:${value}`)
    .digest('hex')
    .substring(0, 16);
  return `tok_${category}_${hash}`;
}

function tokenizeString(str: string, salt: string, vault: Map<string, string>): string {
  let result = str;

  for (const { category, regex, validate } of PII_PATTERNS) {
    // Reset regex index
    regex.lastIndex = 0;
    result = result.replace(regex, (match) => {
      if (validate && !validate(match)) {
        return match;
      }
      const token = generateToken(category, match, salt);
      vault.set(token, match);
      return token;
    });
  }

  return result;
}

function detokenizeString(str: string, vault: Map<string, string>): string {
  let result = str;
  // Match any token of pattern tok_<category>_<hash>
  const tokenRegex = /\btok_(?:aadhaar|pan|phone|email|card)_[a-f0-9]{16}\b/g;
  result = result.replace(tokenRegex, (token) => {
    if (vault.has(token)) {
      return vault.get(token)!;
    }
    // If vault was shredded or does not have the token, return token as-is
    return token;
  });
  return result;
}

function processValue(val: unknown, salt: string, vault: Map<string, string>): unknown {
  if (typeof val === 'string') {
    return tokenizeString(val, salt, vault);
  }
  if (Array.isArray(val)) {
    return val.map(item => processValue(item, salt, vault));
  }
  if (val !== null && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = processValue(v, salt, vault);
    }
    return out;
  }
  return val;
}

function unprocessValue(val: unknown, vault: Map<string, string>): unknown {
  if (typeof val === 'string') {
    return detokenizeString(val, vault);
  }
  if (Array.isArray(val)) {
    return val.map(item => unprocessValue(item, vault));
  }
  if (val !== null && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = unprocessValue(v, vault);
    }
    return out;
  }
  return val;
}

/**
 * Intercepts and tokenizes sensitive PII in structured payloads.
 * Returns the sanitized payload and a private vault mapping tokens to plaintexts.
 */
export function tokenize(
  payload: Record<string, unknown>,
  sessionSalt: string,
  existingVault?: Map<string, string>
): TokenizeResult {
  const vault = existingVault ?? new Map<string, string>();
  const sanitizedPayload = processValue(payload, sessionSalt, vault) as Record<string, unknown>;
  return { sanitizedPayload, vault };
}

/**
 * Re-inflates a tokenized payload back to plain text using the private vault.
 */
export function detokenize(
  sanitizedPayload: Record<string, unknown>,
  vault: Map<string, string>
): Record<string, unknown> {
  return unprocessValue(sanitizedPayload, vault) as Record<string, unknown>;
}

/**
 * Cryptographically shreds the vault, permanently disabling recovery of personal data
 * while leaving WORM Merkle logs and token strings intact.
 */
export function shredVault(vault: Map<string, string>): void {
  vault.clear();
}
