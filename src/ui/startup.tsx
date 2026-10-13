import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useKeyboard, usePaste, useTerminalDimensions } from '@opentui/react';
import { colors } from './theme';
import { QH_LOGO } from './logo';

export function Startup({ children, duration = 750 }: { children: ReactNode; duration?: number }) {
  const [visible, setVisible] = useState(true);
  const showing = useRef(true);
  const { width, height } = useTerminalDimensions();
  function dismiss() { showing.current = false; setVisible(false); }
  useEffect(() => { const timer = setTimeout(dismiss, duration); return () => clearTimeout(timer); }, [duration]);
  useKeyboard(key => { if (showing.current) { key.preventDefault(); dismiss(); } });
  usePaste(event => { if (showing.current) { event.preventDefault(); dismiss(); } });
  if (!visible) return children;
  const showMark = width >= 26 && height >= 16;
  return <box width={width} height={height} backgroundColor={colors.background} justifyContent="center" alignItems="center" flexDirection="column" overflow="hidden">
    {showMark && <text width={20} height={10} fg={colors.foreground}>{QH_LOGO}</text>}
    <text fg={colors.foreground} marginTop={showMark ? 1 : 0}><b>QH</b></text>
    {height >= 5 && <text fg={colors.muted} marginTop={1}>Starting your shell…</text>}
  </box>;
}
