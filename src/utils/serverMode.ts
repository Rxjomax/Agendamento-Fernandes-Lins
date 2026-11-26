let ephemeralServer = false;

export function isEphemeralServer(): boolean {
  return ephemeralServer;
}

export function markEphemeralServer(flag: boolean): void {
  ephemeralServer = flag;
}
