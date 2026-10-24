/**
 * AegisCore Schema Validator
 * Strict, deterministic type & payload validator inspired by Zod/Pydantic.
 * Enforces fail-closed validation for non-deterministic model payloads.
 */

export type SchemaTypeCode = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'array' 
  | 'object' 
  | 'enum';

export interface FieldConstraint {
  type: SchemaTypeCode;
  required?: boolean;
  min?: number;
  max?: number;
  regex?: RegExp | string;
  allowedValues?: unknown[]; // for enum
  items?: FieldConstraint;   // for array
  properties?: Record<string, FieldConstraint>; // for nested object
  strict?: boolean; // fail closed on unrecognized keys
}

export interface SchemaDefinition {
  name: string;
  strict?: boolean; // defaults to true: fail closed on extra fields
  properties?: Record<string, FieldConstraint>;
}

export interface ValidationIssue {
  path: string;
  code: 'REJECTED_SCHEMA';
  message: string;
  expected: string;
  received: string;
  value?: unknown;
}

export class ValidationError extends Error {
  public readonly code: 'REJECTED_SCHEMA' = 'REJECTED_SCHEMA';
  public readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(message);
    this.name = 'ValidationError';
    this.issues = issues;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export interface ValidationOptions {
  strict?: boolean;            // Fail-closed if extra properties exist (default: true)
  stripUnrecognized?: boolean; // Strip unrecognized properties after strict check passes (default: false)
}

/**
 * Validates payloads against strict schema contracts.
 */
export class SchemaValidator {
  public static readonly FORBIDDEN_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  public static readonly MAX_NESTING_DEPTH = 32;

  /**
   * Recursively checks for forbidden prototype pollution keys at any depth,
   * enforcing maximum nesting depth and circular reference defenses.
   */
  public static checkPrototypePollution(
    obj: unknown,
    path = '$',
    issues: ValidationIssue[] = [],
    depth = 0,
    seen = new WeakSet<object>()
  ): ValidationIssue[] {
    if (obj === null || typeof obj !== 'object') {
      return issues;
    }

    if (depth > SchemaValidator.MAX_NESTING_DEPTH) {
      issues.push({
        path,
        code: 'REJECTED_SCHEMA',
        message: `Object nesting depth exceeds safety threshold (${SchemaValidator.MAX_NESTING_DEPTH}). Potential denial of service or evasion attempt.`,
        expected: `<= ${SchemaValidator.MAX_NESTING_DEPTH} nesting depth`,
        received: `${depth}`
      });
      return issues;
    }

    if (seen.has(obj as object)) {
      issues.push({
        path,
        code: 'REJECTED_SCHEMA',
        message: `Circular reference detected at '${path}'.`,
        expected: 'acyclic object',
        received: 'circular reference'
      });
      return issues;
    }
    seen.add(obj as object);

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        SchemaValidator.checkPrototypePollution(obj[i], `${path}[${i}]`, issues, depth + 1, seen);
      }
      return issues;
    }

    const target = obj as Record<string, unknown>;
    const keys = new Set([...Object.keys(target), ...Object.getOwnPropertyNames(target)]);

    for (const key of keys) {
      const currentPath = path === '$' ? key : `${path}.${key}`;
      const normKey = key.trim().toLowerCase();
      if (SchemaValidator.FORBIDDEN_POLLUTION_KEYS.has(normKey) || SchemaValidator.FORBIDDEN_POLLUTION_KEYS.has(key)) {
        issues.push({
          path: currentPath,
          code: 'REJECTED_SCHEMA',
          message: `Forbidden prototype pollution key '${key}' detected under fail-closed policy.`,
          expected: 'undefined (prototype keys forbidden)',
          received: typeof target[key],
          value: target[key]
        });
      } else {
        try {
          SchemaValidator.checkPrototypePollution(target[key], currentPath, issues, depth + 1, seen);
        } catch (err: unknown) {
          issues.push({
            path: currentPath,
            code: 'REJECTED_SCHEMA',
            message: `Runtime property inspection exception at '${currentPath}': ${err instanceof Error ? err.message : String(err)}`,
            expected: 'safe inspectable property',
            received: 'property access error'
          });
        }
      }
    }

    return issues;
  }

  /**
   * Validate a payload against a SchemaDefinition.
   * Throws ValidationError with code REJECTED_SCHEMA on any mismatch or unexpected property.
   * Returns a sanitized/typed copy of the payload.
   */
  public static validate<T = Record<string, unknown>>(
    schema: SchemaDefinition,
    payload: unknown,
    options: ValidationOptions = {}
  ): T {
    const isStrict = options.strict !== false && schema.strict !== false;
    const shouldStrip = options.stripUnrecognized ?? false;
    const issues: ValidationIssue[] = [];

    // 0. Strict check for prototype pollution keys at any nesting depth
    SchemaValidator.checkPrototypePollution(payload, '$', issues);

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ValidationError(`Payload must be a non-null object for schema [${schema.name}]`, [
        {
          path: '$',
          code: 'REJECTED_SCHEMA',
          message: `Expected root object, received ${payload === null ? 'null' : typeof payload}`,
          expected: 'object',
          received: payload === null ? 'null' : typeof payload,
          value: payload
        }
      ]);
    }

    const payloadObj = payload as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    const schemaProps = schema.properties || {};

    // 1. Strict check for unrecognized / unexpected fields (Fail-closed)
    const allowedKeys = new Set(Object.keys(schemaProps));
    const receivedKeys = Object.keys(payloadObj);

    for (const key of receivedKeys) {
      if (!allowedKeys.has(key)) {
        if (isStrict) {
          issues.push({
            path: key,
            code: 'REJECTED_SCHEMA',
            message: `Unrecognized or unauthorized parameter '${key}' detected under fail-closed policy.`,
            expected: 'undefined (field not allowed in schema)',
            received: typeof payloadObj[key],
            value: payloadObj[key]
          });
        }
      }
    }

    // 2. Validate declared properties
    for (const [propName, constraint] of Object.entries(schemaProps)) {
      const val = payloadObj[propName];
      const propPath = propName;

      this.validateField(propPath, constraint, val, issues, sanitized);
    }

    if (issues.length > 0) {
      const formattedErrors = issues.map(i => `[${i.path}]: ${i.message}`).join('; ');
      throw new ValidationError(
        `[REJECTED_SCHEMA] Validation failed for schema [${schema.name}]: ${formattedErrors}`,
        issues
      );
    }

    if (shouldStrip) {
      return sanitized as T;
    }

    return { ...payloadObj } as T;
  }

  private static validateField(
    path: string,
    constraint: FieldConstraint,
    val: unknown,
    issues: ValidationIssue[],
    sanitizedObj: Record<string, unknown>
  ): void {
    const isRequired = constraint.required !== false;

    if (val === undefined || val === null) {
      if (isRequired) {
        issues.push({
          path,
          code: 'REJECTED_SCHEMA',
          message: `Required field '${path}' is missing.`,
          expected: constraint.type,
          received: val === null ? 'null' : 'undefined',
          value: val
        });
      }
      return;
    }

    // Type checking
    switch (constraint.type) {
      case 'string': {
        if (typeof val !== 'string') {
          issues.push({
            path,
            code: 'REJECTED_SCHEMA',
            message: `Field '${path}' expected string, received ${typeof val}.`,
            expected: 'string',
            received: typeof val,
            value: val
          });
          return;
        }

        if (constraint.min !== undefined && val.length < constraint.min) {
          issues.push({
            path,
            code: 'REJECTED_SCHEMA',
            message: `String length for '${path}' is ${val.length}, minimum required is ${constraint.min}.`,
            expected: `>= ${constraint.min} chars`,
            received: `${val.length} chars`,
            value: val
          });
        }

        if (constraint.max !== undefined && val.length > constraint.max) {
          issues.push({
            path,
            code: 'REJECTED_SCHEMA',
            message: `String length for '${path}' is ${val.length}, maximum allowed is ${constraint.max}.`,
            expected: `<= ${constraint.max} chars`,
            received: `${val.length} chars`,
            value: val
          });
        }

        if (constraint.regex) {
          const re = typeof constraint.regex === 'string' ? new RegExp(constraint.regex) : constraint.regex;
          if (!re.test(val)) {
            issues.push({
              path,
              code: 'REJECTED_SCHEMA',
              message: `Field '${path}' does not match required pattern ${re.toString()}.`,
              expected: re.toString(),
              received: val,
              value: val
            });
          }
        }

        sanitizedObj[path.split('.').pop()!] = val;
        break;
      }

      case 'number': {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
          issues.push({
            path,
            code: 'REJECTED_SCHEMA',
            message: `Field '${path}' expected finite number, received ${typeof val === 'number' ? String(val) : typeof val}.`,
            expected: 'number',
            received: typeof val === 'number' ? String(val) : typeof val,
            value: val
          });
          return;
        }

        if (constraint.min !== undefined && val < constraint.min) {
          issues.push({
            path,
            code: 'REJECTED_SCHEMA',
            message: `Numeric value for '${path}' is ${val}, minimum allowed is ${constraint.min}.`,
            expected: `>= ${constraint.min}`,
            received: String(val),
            value: val
          });
        }

        if (constraint.max !== undefined && val > constraint.max) {
          issues.push({
            path,
            code: 'REJECTED_SCHEMA',
            message: `Numeric value for '${path}' is ${val}, maximum allowed is ${constraint.max}.`,
            expected: `<= ${constraint.max}`,
            received: String(val),
            value: val
          });
        }

        sanitizedObj[path.split('.').pop()!] = val;
        break;
      }

      case 'boolean': {
        if (typeof val !== 'boolean') {
          issues.push({
            path,
            code: 'REJECTED_SCHEMA',
            message: `Field '${path}' expected boolean, received ${typeof val}.`,
            expected: 'boolean',
            received: typeof val,
            value: val
          });
          return;
        }
        sanitizedObj[path.split('.').pop()!] = val;
        break;
      }

      case 'enum': {
        const allowed = constraint.allowedValues ?? [];
        if (!allowed.includes(val)) {
          issues.push({
            path,
            code: 'REJECTED_SCHEMA',
            message: `Field '${path}' value '${String(val)}' is not in allowed enum: [${allowed.map(String).join(', ')}].`,
            expected: allowed.map(String).join(' | '),
            received: String(val),
            value: val
          });
          return;
        }
        sanitizedObj[path.split('.').pop()!] = val;
        break;
      }

      case 'array': {
        if (!Array.isArray(val)) {
          issues.push({
            path,
            code: 'REJECTED_SCHEMA',
            message: `Field '${path}' expected array, received ${typeof val}.`,
            expected: 'array',
            received: typeof val,
            value: val
          });
          return;
        }

        if (constraint.min !== undefined && val.length < constraint.min) {
          issues.push({
            path,
            code: 'REJECTED_SCHEMA',
            message: `Array '${path}' has ${val.length} items, minimum required is ${constraint.min}.`,
            expected: `>= ${constraint.min} items`,
            received: `${val.length} items`,
            value: val
          });
        }

        if (constraint.max !== undefined && val.length > constraint.max) {
          issues.push({
            path,
            code: 'REJECTED_SCHEMA',
            message: `Array '${path}' has ${val.length} items, maximum allowed is ${constraint.max}.`,
            expected: `<= ${constraint.max} items`,
            received: `${val.length} items`,
            value: val
          });
        }

        if (constraint.items) {
          for (let i = 0; i < val.length; i++) {
            const itemPath = `${path}[${i}]`;
            const itemSanitized: Record<string, unknown> = {};
            this.validateField(itemPath, constraint.items, val[i], issues, itemSanitized);
          }
        }

        sanitizedObj[path.split('.').pop()!] = val;
        break;
      }

      case 'object': {
        if (typeof val !== 'object' || val === null || Array.isArray(val)) {
          issues.push({
            path,
            code: 'REJECTED_SCHEMA',
            message: `Field '${path}' expected object, received ${val === null ? 'null' : typeof val}.`,
            expected: 'object',
            received: val === null ? 'null' : typeof val,
            value: val
          });
          return;
        }

        const nestedObj = val as Record<string, unknown>;
        const nestedSanitized: Record<string, unknown> = {};

        if (constraint.properties) {
          const nestedAllowed = new Set(Object.keys(constraint.properties));
          for (const k of Object.keys(nestedObj)) {
            if (!nestedAllowed.has(k) && constraint.strict !== false) {
              issues.push({
                path: `${path}.${k}`,
                code: 'REJECTED_SCHEMA',
                message: `Unexpected property '${path}.${k}' in strict nested object.`,
                expected: 'undefined',
                received: typeof nestedObj[k],
                value: nestedObj[k]
              });
            }
          }

          for (const [subProp, subConstraint] of Object.entries(constraint.properties)) {
            this.validateField(`${path}.${subProp}`, subConstraint, nestedObj[subProp], issues, nestedSanitized);
          }
        }

        sanitizedObj[path.split('.').pop()!] = nestedSanitized;
        break;
      }
    }
  }
}
