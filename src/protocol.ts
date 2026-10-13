export type Request =
  | { type: 'spawn'; id: string; shell: string; args: string[]; cwd: string; cols: number; rows: number }
  | { type: 'input'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'ack'; id: string; size: number }
  | { type: 'close'; id: string }
  | { type: 'shutdown' };
export type Response =
  | { type: 'info'; id: string; cwd?: string; process?: string }
  | { type: 'spawned'; id: string; pid: number }
  | { type: 'output'; id: string; data: string }
  | { type: 'exit'; id: string; code: number; signal?: number }
  | { type: 'error'; id: string; message: string };
