// @vitest-environment jsdom

import { hideWhileDialogOpen } from './dialog';

/** MutationObserver arbeitet als Microtask — einmal die Schlange leerlaufen lassen. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function overlay(): ShadowRoot {
  const host = document.createElement('div');
  document.body.append(host);
  return host.attachShadow({ mode: 'closed' });
}

function openDialog(): HTMLElement {
  const container = document.createElement('mat-dialog-container');
  document.body.append(container);
  return container;
}

const display = (shadow: ShadowRoot): string => (shadow.host as HTMLElement).style.display;

beforeEach(() => {
  document.body.replaceChildren();
});

it('blendet die Wirte aus, sobald ein Dialog auftaucht, und danach wieder ein', async () => {
  const panel = overlay();
  const stop = hideWhileDialogOpen([panel]);
  expect(display(panel)).toBe('');

  const dialog = openDialog();
  await settle();
  expect(display(panel)).toBe('none');

  dialog.remove();
  await settle();
  expect(display(panel)).toBe('');
  stop();
});

it('ist schon beim Start ausgeblendet, wenn der Dialog vor dem Skript da war', () => {
  openDialog();
  const panel = overlay();
  const stop = hideWhileDialogOpen([panel]);
  expect(display(panel)).toBe('none');
  stop();
});

it('gibt die Wirte beim Abräumen wieder frei — sonst bliebe die Seite blind', async () => {
  const panel = overlay();
  const stop = hideWhileDialogOpen([panel]);
  openDialog();
  await settle();

  stop();
  expect(display(panel)).toBe('');
});
