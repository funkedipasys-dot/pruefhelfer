/**
 * Die Rückfallebene: einen Baustein in die Zwischenablage legen
 * (Plan-Punkt 43, 71).
 *
 * Steht hier und nicht im Popup, weil es **beide** Fassungen gibt und beide
 * exakt dasselbe liefern müssen. Sie setzt denselben `buildInsertion()`-Weg
 * ein wie das Einfügen ins Feld — bloß gegen einen leeren Bestand und ohne
 * Längengrenze, denn die Zwischenablage hat keine.
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
