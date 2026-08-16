/**
 * Eigene Overlays ausblenden, solange ein Dialog offen ist.
 *
 * Unsere Wirte hängen an `document.body` und stehen `position: fixed` — der
 * Backdrop eines Material-Dialogs legt sich über die Seite, aber nicht über
 * sie. Der Knopf „Textbausteine" stand deshalb mitten auf der Abschlussmaske
 * und bediente ein Bemerkungsfeld, das der Prüfer dort gar nicht mehr sieht;
 * dasselbe gilt für die Erstzulassungs-Leiste und die FSD-Leiste.
 *
 * **Die Kilometerstand-Leiste steht bewusst nicht in der Liste.** Sie hängt bei
 * offenem Dialog an dessen *eigenem* Feld (siehe `resolveMileageField`) — genau
 * dort soll sie bedienbar bleiben. Findet sie keins, meldet ihr Beobachter sie
 * ohnehin ab.
 *
 * **`ANY_DIALOG_SELECTOR`, nicht `OPEN_DIALOG_SELECTOR`.** Die Klasse
 * `mdc-dialog--open` kommt erst mit der Einblend-Animation; eine
 * Klassenänderung ist keine `childList`-Regung und käme beim Beobachter nie an.
 * Der Container selbst wird eingehängt und wieder entfernt — das sieht er. Dass
 * wir während der Ausblend-Animation einen Lidschlag länger verborgen bleiben,
 * ist das kleinere Übel.
 */

import { ANY_DIALOG_SELECTOR } from './mileage';
import { watchField } from './watcher';
import type { StopWatching } from './watcher';

export function hideWhileDialogOpen(overlays: readonly ShadowRoot[]): StopWatching {
  const hosts = overlays.map((shadow) => shadow.host as HTMLElement);

  // Inline statt eines Attributs: die Wirte tragen `:host { all: initial }`,
  // und eine Autoren-Regel schlägt die UA-Regel hinter `hidden`.
  const setVisible = (visible: boolean): void => {
    for (const host of hosts) host.style.display = visible ? '' : 'none';
  };

  return watchField<HTMLElement>({
    root: document,
    selector: ANY_DIALOG_SELECTOR,
    ignoreWithin: hosts,
    onAttach: () => setVisible(false),
    onDetach: () => setVisible(true),
  });
}
