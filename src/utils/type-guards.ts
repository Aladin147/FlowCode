/**
 * Type guards and utility functions for runtime type checking
 * Helps prevent undefined/null access errors throughout the codebase
 */

/**
 * Check if value is not null or undefined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
}

/**
 * Check if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

/**
 * Check if value is a valid array with elements
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
    return Array.isArray(value) && value.length > 0;
}

/**
 * Check if value is a valid object (not null, not array)
 */
export function isValidObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if value is a valid number (not NaN, not Infinity)
 */
export function isValidNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Check if value is a valid positive number
 */
export function isPositiveNumber(value: unknown): value is number {
    return isValidNumber(value) && value > 0;
}

/**
 * Check if value is a valid Error object
 */
export function isError(value: unknown): value is Error {
    return value instanceof Error;
}

/**
 * Check if array index is valid for the given array
 */
export function isValidArrayIndex<T>(array: T[], index: number): boolean {
    return isValidNumber(index) && index >= 0 && index < array.length;
}

/**
 * Safe array access with type guard
 */
export function safeArrayAccess<T>(array: T[], index: number): T | undefined {
    return isValidArrayIndex(array, index) ? array[index] : undefined;
}

/**
 * Safe object property access
 */
export function safePropertyAccess<T extends object, K extends keyof T>(
    obj: T | null | undefined,
    key: K
): T[K] | undefined {
    return isDefined(obj) && key in obj ? obj[key] : undefined;
}

/**
 * Check if string contains valid file path
 */
export function isValidFilePath(value: unknown): value is string {
    if (!isNonEmptyString(value)) {
        return false;
    }
    
    // Basic file path validation (not exhaustive)
    const invalidChars = /[<>:"|?*]/;
    return !invalidChars.test(value);
}

/**
 * Check if value is a valid VS Code URI
 */
export function isValidUri(value: unknown): boolean {
    try {
        if (!isNonEmptyString(value)) {
            return false;
        }
        // Basic URI validation
        return value.includes('://') || value.startsWith('/') || value.includes('\\');
    } catch {
        return false;
    }
}

/**
 * Type guard for checking if value has a specific property
 */
export function hasProperty<T extends Record<string, unknown>, K extends string>(
    obj: T,
    prop: K
): obj is T & Record<K, unknown> {
    return prop in obj;
}

/**
 * Type guard for checking if value has a method
 */
export function hasMethod<T extends Record<string, unknown>, K extends string>(
    obj: T,
    method: K
): obj is T & Record<K, Function> {
    return hasProperty(obj, method) && typeof obj[method] === 'function';
}

/**
 * Safe function call with error handling
 */
export function safeCall<T extends unknown[], R>(
    fn: (...args: T) => R,
    ...args: T
): R | undefined {
    try {
        return fn(...args);
    } catch {
        return undefined;
    }
}

/**
 * Safe async function call with error handling
 */
export async function safeAsyncCall<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    ...args: T
): Promise<R | undefined> {
    try {
        return await fn(...args);
    } catch {
        return undefined;
    }
}

/**
 * Check if value is a valid configuration object
 */
export function isValidConfig(value: unknown): value is Record<string, unknown> {
    return isValidObject(value) && Object.keys(value).length > 0;
}

/**
 * Check if value is a valid API response
 */
export function isValidApiResponse(value: unknown): value is { success: boolean; data?: unknown; error?: string } {
    return isValidObject(value) && 
           hasProperty(value, 'success') && 
           typeof value.success === 'boolean';
}

/**
 * Ensure value is an array, convert if necessary
 */
export function ensureArray<T>(value: T | T[]): T[] {
    return Array.isArray(value) ? value : [value];
}

/**
 * Ensure value is a string, convert if necessary
 */
export function ensureString(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (value === null || value === undefined) {
        return '';
    }
    return String(value);
}

/**
 * Ensure value is a number, return default if invalid
 */
export function ensureNumber(value: unknown, defaultValue: number = 0): number {
    if (isValidNumber(value)) {
        return value;
    }
    const parsed = Number(value);
    return isValidNumber(parsed) ? parsed : defaultValue;
}

/**
 * Check if value is a valid timeout value
 */
export function isValidTimeout(value: unknown): value is number {
    return isValidNumber(value) && value >= 0 && value <= 300000; // Max 5 minutes
}

/**
 * Check if value is a valid port number
 */
export function isValidPort(value: unknown): value is number {
    return isValidNumber(value) && value >= 1 && value <= 65535;
}

/**
 * Check if value looks like a valid API key
 */
export function isValidApiKey(value: unknown): value is string {
    return isNonEmptyString(value) && value.length >= 10 && !/\s/.test(value);
}

/**
 * Check if value is a valid semantic version
 */
export function isValidSemVer(value: unknown): value is string {
    if (!isNonEmptyString(value)) {
        return false;
    }
    const semVerRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?(\+[a-zA-Z0-9-]+)?$/;
    return semVerRegex.test(value);
}

/**
 * Check if value is a valid git branch name
 */
export function isValidBranchName(value: unknown): value is string {
    if (!isNonEmptyString(value)) {
        return false;
    }
    // Basic git branch name validation
    const invalidChars = /[\s~^:?*\[\]\\]/;
    return !invalidChars.test(value) && !value.startsWith('-') && !value.endsWith('.');
}

/**
 * Assertion function that throws if condition is false
 */
export function assert(condition: unknown, message: string = 'Assertion failed'): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

/**
 * Assertion function for defined values
 */
export function assertDefined<T>(value: T | null | undefined, message?: string): asserts value is T {
    assert(isDefined(value), message || 'Value must be defined');
}

/**
 * Assertion function for non-empty strings
 */
export function assertNonEmptyString(value: unknown, message?: string): asserts value is string {
    assert(isNonEmptyString(value), message || 'Value must be a non-empty string');
}

/**
 * Assertion function for non-empty arrays
 */
export function assertNonEmptyArray<T>(value: unknown, message?: string): asserts value is T[] {
    assert(isNonEmptyArray(value), message || 'Value must be a non-empty array');
}
