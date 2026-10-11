import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

export const GENESIS_HASH = '0'.repeat(64);

export type PolicyVerdict = 'APPROVED' | 'BLOCKED' | 'REQUIRES_HITL';

export interface AuditEntry {
  sequenceId: number;
  timestamp: string; // ISO 8601
  sessionId: string;
  agentId: string;
  intentPayloadHash: string; // SHA-256 of canonicalized intent
  policyVerdict: PolicyVerdict;
  violationTrace?: unknown;
  previousEntryHash: string;
  entryHash: string; // SHA-256 over all fields including previousEntryHash
}

export interface AppendEntryInput {
  sessionId: string;
  agentId: string;
  intentPayload: unknown; // Canonicalized and hashed inside append
  policyVerdict: PolicyVerdict;
  violationTrace?: unknown;
  timestamp?: string; // Optional override for testing
}

export interface ChainVerificationResult {
  isValid: boolean;
  brokenAtIndex?: number;
  reason?: string;
}

export interface LedgerOptions {
  storagePath?: string; // Optional file path for disk append-only persistence
  inMemoryOnly?: boolean;
}

/**
 * Deterministic JSON canonicalization (sorted keys recursively)
 */
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeJson).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const inner = keys
    .map(k => `${JSON.stringify(k)}:${canonicalizeJson((obj as Record<string, unknown>)[k])}`)
    .join(',');
  return `{${inner}}`;
}

/**
 * Compute SHA-256 hash of any input payload using deterministic canonicalization
 */
export function hashPayload(payload: unknown): string {
  const canonical = canonicalizeJson(payload);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Compute the cryptographic hash for an audit entry
 */
export function computeEntryHash(entry: Omit<AuditEntry, 'entryHash'>): string {
  const payloadToHash = {
    sequenceId: entry.sequenceId,
    timestamp: entry.timestamp,
    sessionId: entry.sessionId,
    agentId: entry.agentId,
    intentPayloadHash: entry.intentPayloadHash,
    policyVerdict: entry.policyVerdict,
    violationTrace: entry.violationTrace ?? null,
    previousEntryHash: entry.previousEntryHash
  };
  return createHash('sha256').update(canonicalizeJson(payloadToHash)).digest('hex');
}

/**
 * Write-Once-Read-Many (WORM) Cryptographic Audit Ledger
 */
export class WormAuditLedger {
  private entries: AuditEntry[] = [];
  private storagePath?: string;

  constructor(options: LedgerOptions = {}) {
    this.storagePath = options.storagePath;

    // Load existing chain if disk file exists
    if (this.storagePath && existsSync(this.storagePath)) {
      try {
        const lines = readFileSync(this.storagePath, 'utf-8').trim().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            this.entries.push(JSON.parse(line));
          }
        }
      } catch (err) {
        console.warn(`[WormAuditLedger] Could not read existing log file: ${err}`);
      }
    }
  }

  /**
   * Get total number of entries in ledger
   */
  public get length(): number {
    return this.entries.length;
  }

  /**
   * Return a read-only copy of all entries
   */
  public getEntries(): ReadonlyArray<AuditEntry> {
    return [...this.entries];
  }

  /**
   * Get an entry by sequence ID (1-indexed)
   */
  public getEntry(sequenceId: number): AuditEntry | undefined {
    return this.entries.find(e => e.sequenceId === sequenceId);
  }

  /**
   * Append a new entry to the cryptographic ledger.
   * Links to previousEntryHash and calculates the tamper-evident entryHash.
   */
  public append(input: AppendEntryInput): AuditEntry {
    const sequenceId = this.entries.length + 1;
    const timestamp = input.timestamp ?? new Date().toISOString();
    const intentPayloadHash = hashPayload(input.intentPayload);

    const previousEntryHash = this.entries.length === 0
      ? GENESIS_HASH
      : this.entries[this.entries.length - 1].entryHash;

    const partialEntry: Omit<AuditEntry, 'entryHash'> = {
      sequenceId,
      timestamp,
      sessionId: input.sessionId,
      agentId: input.agentId,
      intentPayloadHash,
      policyVerdict: input.policyVerdict,
      violationTrace: input.violationTrace,
      previousEntryHash
    };

    const entryHash = computeEntryHash(partialEntry);

    const fullEntry: AuditEntry = {
      ...partialEntry,
      entryHash
    };

    this.entries.push(fullEntry);

    // Persist to append-only disk log if enabled
    if (this.storagePath) {
      appendFileSync(this.storagePath, JSON.stringify(fullEntry) + '\n', 'utf-8');
    }

    return fullEntry;
  }

  /**
   * Verify complete cryptographic integrity of the ledger chain.
   * Returns isValid: true or pinpoints the broken index.
   */
  public verifyChainIntegrity(): ChainVerificationResult {
    if (this.entries.length === 0) {
      return { isValid: true };
    }

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      // 1. Verify sequence order
      if (entry.sequenceId !== i + 1) {
        return {
          isValid: false,
          brokenAtIndex: i,
          reason: `Invalid sequenceId: expected ${i + 1}, found ${entry.sequenceId}`
        };
      }

      // 2. Verify previousEntryHash chaining
      const expectedPrevHash = i === 0 ? GENESIS_HASH : this.entries[i - 1].entryHash;
      if (entry.previousEntryHash !== expectedPrevHash) {
        return {
          isValid: false,
          brokenAtIndex: i,
          reason: `Chain broken: previousEntryHash mismatch at index ${i}`
        };
      }

      // 3. Recompute and verify entryHash
      const recomputedHash = computeEntryHash({
        sequenceId: entry.sequenceId,
        timestamp: entry.timestamp,
        sessionId: entry.sessionId,
        agentId: entry.agentId,
        intentPayloadHash: entry.intentPayloadHash,
        policyVerdict: entry.policyVerdict,
        violationTrace: entry.violationTrace,
        previousEntryHash: entry.previousEntryHash
      });

      if (entry.entryHash !== recomputedHash) {
        return {
          isValid: false,
          brokenAtIndex: i,
          reason: `Cryptographic digest mismatch at index ${i} (tampered content)`
        };
      }
    }

    return { isValid: true };
  }

  /**
   * INTERNAL TESTING HOOK: Tamper with an entry to verify tamper detection
   */
  public _tamperEntryForTest(index: number, field: keyof AuditEntry, value: unknown): void {
    if (this.entries[index]) {
      (this.entries[index] as unknown as Record<string, unknown>)[field] = value;
    }
  }
}
