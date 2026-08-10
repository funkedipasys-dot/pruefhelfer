/**
 * Die Rückfallebene: einen Baustein in die Zwischenablage legen
 * (Plan-Punkt 43, 71).
 *
 * Steht hier und nicht im Popup, weil es **beide** Fassungen gibt und beide
 * exakt dasselbe liefern müssen. Sie setzt denselben `buildInsertion()`-Weg
 * ein wie das Einfügen ins Feld — gegen einen leeren Bestand, weil es hier kein
 * Feld gibt, in dem schon etwas stünde.
 *
 * **Die Obergrenze des Bemerkungsfeldes gilt trotzdem** (`effectiveLimit(-1, 0)`
 * fällt auf sie zurück). Die Zwischenablage selbst hat keine — aber kopiert wird
 * hier, um von Hand in genau dieses Feld einzusetzen. Ein Text, den der eine Weg
 * ablehnt und der andere durchlässt, wäre wieder der Fall, den ein gemeinsamer
 * `buildInsertion()` gerade ausschließen soll: der Prüfer fände ihn im Feld
 * abgeschnitten wieder.
 */

import { buildInsertion, effectiveLimit } from '../core/insertion';
import { describeSubstitutionFailure } from '../core/placeholders';
import type { ActionResult } from './chooser';

export async function copyToClipboard(
  baustein: { text: string },
  values: Record<string, string>,
): Promise<ActionResult> {
  const insertion = buildInsertion({
    existing: '',
    limit: effectiveLimit(-1, 0),
    text: baustein.text,
    values,
  });
  if (!insertion.ok) return { ok: false, message: describeSubstitutionFailure(insertion) };

  try {
    await navigator.clipboard.writeText(insertion.snippet);
  } catch {
    return { ok: false, message: 'Kopieren nicht möglich. Bitte den Text von Hand übernehmen.' };
  }
  return { ok: true };
}
