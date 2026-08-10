/**
 * Was sich alle Knopfleisten am Formular teilen: die Optik und die Frage,
 * *wo* eine Leiste hängt.
 *
 * Beides steht hier und nicht in einer der Leisten, weil beides mehrfach
 * gebraucht wird und genau einmal stimmen muss. Die Optik, damit eine Änderung
 * am Aussehen nicht an zwei Stellen nachgezogen werden will. Die Messung, weil
 * sie schon einmal falsch war (Plan-Punkt 74) — und ein zweites Vorkommen
 * hieße, denselben Fehler ein zweites Mal machen zu können.
 *
 * Die Nachführung selbst — Beobachter, Bildlauf, Einzelbild — bleibt bei den
 * Leisten: sie hängen an unterschiedlichen Dingen und melden sich zu
 * unterschiedlichen Zeitpunkten an und ab.
 */

/** Optik wie der Textbaustein-Starter: Roboto, Pillen, Markenrot. */
export const BAR_STYLE = `
:host { all: initial; }
.bar {
  position: fixed;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  gap: 4px;
  font: 12px/1.4 Roboto, "Helvetica Neue", Arial, sans-serif;
  /* top ist die Mitte der Textzeile, an der die Leiste haengt. */
  transform: translateY(-50%);
}
.bar[hidden] { display: none; }
.bar button {
  font: inherit;
  padding: 2px 10px;
  border: 1px solid #cbcdcf;
  border-radius: 999px;
  background: #fff;
  color: #565656;
  cursor: pointer;
  white-space: nowrap;
}
.bar button:hover { border-color: #da1f3d; color: #da1f3d; }
.bar .uebernehmen { font-variant-numeric: tabular-nums; }
.bar .hinweis {
  color: #565656;
  background: #fff;
  padding: 2px 4px;
  border-radius: 4px;
}
.bar .fehler {
  color: #da1f3d;
  background: #fff;
  padding: 2px 6px;
  border-radius: 4px;
}
.bar .fehler:empty { display: none; }
`;

/**
 * Das Rechteck des **Textes**, nicht des Kastens (Plan-Punkt 74).
 *
 * `mat-label` und `mat-error` sind Block-Elemente: sie reichen bis zum rechten
 * Rand des Formulars, obwohl „184731 - alter Stand" schon nach einem Drittel
 * endet. Am Element ausgerichtet landete die Leiste deshalb weit rechts vom
 * Text — bei offenem Dialog sogar außerhalb, auf dem Backdrop. Ein `Range` über
 * den Inhalt misst, was tatsächlich dasteht.
 *
 * Fällt die Messung leer aus — kein Textknoten, oder eine Umgebung ohne
 * Layout —, ist das Element selbst die beste verfügbare Auskunft.
 */
export function textRect(element: Element): DOMRect {
  const range = element.ownerDocument.createRange?.();
  // Nicht jede Umgebung misst Text: ohne Layout gibt es kein Rechteck, und
  // `Range.getBoundingClientRect` fehlt dort ganz.
  if (range !== undefined && typeof range.getBoundingClientRect === 'function') {
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return rect;
  }
  return element.getBoundingClientRect();
}

/**
 * Die Position der Leiste zu dem Element, an dem sie hängt.
 *
 * Senkrecht auf Texthöhe zentriert statt oben bündig: die Knöpfe sind höher als
 * die Zeile, an der sie hängen. Der Rest besorgt `transform: translateY(-50%)`.
 */
export function barPosition(target: Element): { top: number; left: number } {
  const rect = textRect(target);
  return {
    top: Math.round(rect.top + rect.height / 2),
    left: Math.round(rect.right) + 8,
  };
}
