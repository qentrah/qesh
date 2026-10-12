/* Adapted from TermCN Help (MIT). Compact rows keep commands readable in a TUI. */
import { useTheme } from '../hooks/use-theme';
export interface HelpProps { keymap: Record<string, string>; title?: string; compact?: boolean }
export function Help({ keymap, title, compact = false }: HelpProps) {
  const theme = useTheme();
  return <box flexDirection="column">
    {title && <text fg={theme.colors.primary}><b>{title}</b></text>}
    {compact ? <text fg={theme.colors.mutedForeground}>{Object.entries(keymap).map(([key, action]) => `${key}: ${action}`).join(' · ')}</text> :
      Object.entries(keymap).map(([key, action]) => <box key={key} flexDirection="row">
        <text width={18} fg={theme.colors.primary}>{key}</text>
        <text fg={theme.colors.foreground}>{action}</text>
      </box>)}
  </box>;
}
