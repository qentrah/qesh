/* Adapted from TermCN (MIT): controlled, mouse-enabled tab strip.
 * Shell arrow/tab keys must never be intercepted by the tab bar.
 * https://www.termcn.dev/r/opentui/tabs.json */
import type { ReactNode } from 'react';
import { useTheme } from '../hooks/use-theme';
export interface Tab { key: string; label: string; content?: ReactNode }
export interface TabsProps { tabs: Tab[]; activeTab: string; onTabChange: (key: string) => void; width: number }
export function Tabs({ tabs, activeTab, onTabChange, width }: TabsProps) {
  const theme = useTheme();
  const active = tabs.findIndex(tab => tab.key === activeTab);
  // Keep the active tab visible without claiming rows needed by shells.
  const count = Math.max(1, Math.floor(width / 14));
  const start = Math.max(0, Math.min(active - count + 1, tabs.length - count));
  const shown = tabs.slice(start, start + count);
  const cellWidth = Math.max(1, Math.floor(width / shown.length));
  return <box flexDirection="row" height={1} width={width} overflow="hidden">
    {shown.map((tab, i) => {
      const selected = tab.key === activeTab;
      return <box key={tab.key} width={cellWidth} height={1} onMouseDown={() => onTabChange(tab.key)}>
        <text wrapMode="none" fg={selected ? theme.colors.primary : theme.colors.mutedForeground}>
          {selected ? <b>{`[${start + i + 1} ${tab.label}]`.slice(0, cellWidth)}</b> : ` ${start + i + 1} ${tab.label} `.slice(0, cellWidth)}
        </text>
      </box>;
    })}
  </box>;
}
