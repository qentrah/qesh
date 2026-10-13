import { expect, test } from 'bun:test';
import { createTestRenderer } from '@opentui/core/testing';
import { createRoot } from '@opentui/react';
import { Startup } from '../src/ui/startup';

test('startup logo dismisses to the workspace and fits small terminals', async () => {
  const setup = await createTestRenderer({ width: 70, height: 24 });
  try {
    createRoot(setup.renderer).render(<Startup duration={10000}><text>WORKSPACE READY</text></Startup>);
    await Bun.sleep(30); await setup.flush();
    expect(setup.captureCharFrame()).toContain('QH');
    expect(setup.captureCharFrame()).toContain('Starting your shell');
    expect(setup.captureCharFrame()).not.toContain('WORKSPACE READY');
    setup.resize(22, 7); await Bun.sleep(30); await setup.flush();
    expect(setup.captureCharFrame()).toContain('QH');
    setup.mockInput.pressEnter(); await Bun.sleep(30); await setup.flush();
    expect(setup.captureCharFrame()).toContain('WORKSPACE READY');
  } finally { setup.renderer.destroy(); }
});
