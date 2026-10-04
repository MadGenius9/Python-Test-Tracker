// Standalone / Offline Design Mode Firebase Mock
// Provides synchronous ready status with zero network requests or Firestore dependencies.

export const db: any = {};

export const auth: any = {
  currentUser: {
    uid: 'design-mode-user',
    displayName: 'Design Engineer',
    email: 'engineer@sandtracker.local',
    isAnonymous: false,
  },
};

export const authError: string | null = null;
export type FirestoreConnectionStatus = 'connected' | 'connecting' | 'error';
let connectionStatus: FirestoreConnectionStatus = 'connected';
type ConnectionStatusCallback = (status: FirestoreConnectionStatus) => void;
type ErrorCallback = (err: string | null) => void;

export function onFirestoreConnectionStatusChange(cb: ConnectionStatusCallback) {
  cb(connectionStatus);
  return () => {};
}

export function setFirestoreConnectionStatus(status: FirestoreConnectionStatus) {
  connectionStatus = status;
}

export function getFirestoreConnectionStatus(): FirestoreConnectionStatus {
  return 'connected';
}

export function onFirebaseError(cb: ErrorCallback) {
  cb(null);
  return () => {};
}

export function triggerFirebaseError(_msg: string) {
  // No-op in design mode
}

export function clearFirebaseError() {
  // No-op in design mode
}

export async function waitForFirebaseAuth(_timeoutMs = 1000): Promise<any> {
  return auth.currentUser;
}

export function resetAuthReadyPromise() {
  // No-op in design mode
}
