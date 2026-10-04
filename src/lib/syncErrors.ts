import { SyncErrorCode } from '../types';

export class SyncError extends Error {
  public readonly code: SyncErrorCode;
  public readonly isPermanentConflict: boolean;
  public readonly details?: any;

  constructor(code: SyncErrorCode, message: string, details?: any) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
    this.details = details;
    this.isPermanentConflict = isPermanentConflictCode(code);
    Object.setPrototypeOf(this, SyncError.prototype);
  }
}

/**
 * Classifies a typed SyncErrorCode as a permanent conflict or retryable error.
 */
export function isPermanentConflictCode(code: SyncErrorCode): boolean {
  switch (code) {
    case 'DUPLICATE_TICKET':
    case 'STAGE_ALREADY_COMPLETE':
    case 'PAD_NOT_FOUND':
    case 'MALFORMED_QUEUE_ITEM':
    case 'PERMISSION_DENIED':
      return true;
    case 'NETWORK_ERROR':
    case 'TEMPORARY_UNAVAILABLE':
    case 'UNKNOWN_ERROR':
    default:
      return false;
  }
}

/**
 * Extracts or classifies an error object into a typed SyncErrorCode.
 */
export function classifySyncErrorCode(err: any): SyncErrorCode {
  if (!err) return 'UNKNOWN_ERROR';
  if (err instanceof SyncError || err.code) {
    const code = err.code as SyncErrorCode;
    if (
      code === 'DUPLICATE_TICKET' ||
      code === 'STAGE_ALREADY_COMPLETE' ||
      code === 'PAD_NOT_FOUND' ||
      code === 'MALFORMED_QUEUE_ITEM' ||
      code === 'PERMISSION_DENIED' ||
      code === 'NETWORK_ERROR' ||
      code === 'TEMPORARY_UNAVAILABLE'
    ) {
      return code;
    }
  }

  // Inspect standard Firestore error codes / properties
  const firestoreCode = err.code || '';
  if (firestoreCode === 'permission-denied') return 'PERMISSION_DENIED';
  if (firestoreCode === 'not-found') return 'PAD_NOT_FOUND';
  if (firestoreCode === 'unavailable') return 'TEMPORARY_UNAVAILABLE';
  if (firestoreCode === 'deadline-exceeded') return 'NETWORK_ERROR';

  // Fallback pattern classification for untyped throw sources
  const msg = (err?.message || String(err)).toLowerCase();
  if (msg.includes('duplicate ticket') || msg.includes('already exists on this pad')) {
    return 'DUPLICATE_TICKET';
  }
  if (msg.includes('stage already complete') || msg.includes('stage has already been completed')) {
    return 'STAGE_ALREADY_COMPLETE';
  }
  if (msg.includes('does not exist') || msg.includes('pad not found') || msg.includes('deleted')) {
    return 'PAD_NOT_FOUND';
  }
  if (msg.includes('malformed') || msg.includes('invalid') || msg.includes('corrupted')) {
    return 'MALFORMED_QUEUE_ITEM';
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout')) {
    return 'NETWORK_ERROR';
  }
  if (msg.includes('unavailable') || msg.includes('try again')) {
    return 'TEMPORARY_UNAVAILABLE';
  }

  return 'UNKNOWN_ERROR';
}
