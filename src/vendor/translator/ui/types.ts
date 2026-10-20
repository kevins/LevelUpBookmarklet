// The two types of the Translator's ui/types.ts that the copied files use.

export type ToastKind = 'info' | 'ok' | 'warn' | 'error';

export interface ConfirmOptions {
  title: string;
  body: string | Node;
  ok: string;
  cancel?: string;
  danger?: boolean;
}
