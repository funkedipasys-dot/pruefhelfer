/**
 * Der Nachweis, dass die Erweiterung läuft.
 *
 * Ohne ihn ist „die Erweiterung tut nichts" nicht von „die Erweiterung ist gar
 * nicht da" zu unterscheiden — und genau diese beiden Fälle sahen bei der
 * Abnahme am 10.08.2026 identisch aus. Die Knöpfe an den Feldern taugen dafür
 * nicht: sie erscheinen nur dort, wo es etwas anzubieten gibt, ihr Fehlen ist
 * also der Normalfall.
 *
 * Die **Fassungsnummer steht mit drauf**. Sie beantwortet die Anschlussfrage
 * („und ist es auch der neue Stand?") ohne einen Weg über `chrome://extensions`.
 *
 * Absichtlich nicht anklickbar: das hier liegt über einem Prüfwerkzeug, und
 * nichts von uns darf einen Klick abfangen, der dem Tool gegolten hätte.
 */

/** Ein fester Bezeichner macht den Wirt zum Singleton. */
export const BADGE_HOST_ID = 'gtue-pruefhelfer-badge-host';

const STYLE = `
:host { all: initial; }
.badge {
  position: fixed;
  left: 50%;
  /* Oben mittig, in der freien Fläche der Kopfleiste des Produktionstools.
     Nicht *in* ihr — wir hängen weiterhin nichts in den Angular-Baum, sondern
     legen uns nur darüber. Unten stand es dem Blättern-Knopf im Weg. */
  top: 8px;
  transform: translateX(-50%);
  z-index: 2147483000;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid #cbcdcf;
  border-radius: 999px;
  background: #fff;
  color: #565656;
  font: 12px/1.4 Roboto, "Helvetica Neue", Arial, sans-serif;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  /* Fängt keinen Klick ab, der dem Produktionstool gegolten hätte. */
  pointer-events: none;
}
.punkt {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #da1f3d;
}
`;

export interface BadgeHandle {
  destroy: () => void;
  /** Zum Prüfen — der Inhalt liegt sonst hinter der Schattengrenze. */
  readonly shadow: ShadowRoot;
}

/**
 * @param label Was dasteht. Kommt von außen, weil die beiden Fassungen
 *   unterschiedlich heißen — und die offene die fremde Marke nicht führen darf
 *   (siehe `build.spec.ts`).
 */
export function createBadge(label: string): BadgeHandle {
  const host = document.createElement('div');
  host.id = BADGE_HOST_ID;
  // Geschlossen wie die übrigen Wirte: die Seite hat an unseren Knoten nichts
  // zu suchen. Hier steht zwar nur eine Fassungsnummer — aber ein Kennzeichen,
  // das die Seite umschreiben kann, wäre als Nachweis nichts mehr wert.
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = STYLE;

  const badge = document.createElement('div');
  badge.className = 'badge';

  const punkt = document.createElement('span');
  punkt.className = 'punkt';

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = label;

  badge.append(punkt, text);
  shadow.append(style, badge);
  document.body.append(host);

  return {
    shadow,
    destroy() {
      host.remove();
    },
  };
}
