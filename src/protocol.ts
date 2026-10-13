type SessionRequest =
  | { type: 'spawn'; id: string; generation: number; shell: string; args: string[]; cwd: string; cols: number; rows: number }
  | { type: 'input'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'ack'; id: string; size: number }
  | { type: 'close'; id: string }
  | { type: 'shutdown' };
type SessionResponse =
  | { type: 'info'; id: string; cwd?: string; process?: string }
  | { type: 'spawned'; id: string; pid: number }
  | { type: 'output'; id: string; data: string }
  | { type: 'exit'; id: string; code: number; signal?: number }
  | { type: 'error'; id: string; message: string };

export type Response = SessionResponse & {generation?: number};

export type Request = SessionRequest & {generation?: number};
