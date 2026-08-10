/**
 * Eingebaute Standardtexte.
 *
 * Der Bestand, mit dem die Erweiterung **ohne jede Einrichtung** sofort
 * benutzbar ist. Wo ein zentral gepflegter Bestand dazukommt, treten sie
 * zurück: dieselben Texte doppelt zu zeigen, sobald sie auch zentral gepflegt
 * werden, wäre bloß verwirrend.
 *
 * Herkunft: Textvorlagen aus der Praxis eines Prüfbüros, Wortlaut unverändert
 * übernommen (Stand 2026-08-10). Sie enthalten keine Platzhalter; dass sie die
 * Grammatik des Scanners bestehen, sichert `defaults.spec.ts`.
 */

import type { CachedBaustein } from './baustein';

export const DEFAULT_BAUSTEINE: CachedBaustein[] = [
  {
    id: 'standard-bremswerte-bbkp',
    titel: 'Bremswerte manuell (BBKP)',
    text: 'Bremswerte konnten infolge eines Software- bzw. Netzwerkfehlers nicht automatisch übertragen werden und wurden daher manuell eingegeben. Die Bezugsbremskraftprüfung (BBKP) wurde ordnungsgemäß durchgeführt und war ohne Beanstandung.',
    kategorie: 'Bremsen',
    sortierung: 1,
  },
  {
    id: 'standard-fahrversuch',
    titel: 'Bremswirkungsprüfung Fahrversuch',
    text: 'Bremswirkungsprüfung mittels Fahrversuch aufgrund nicht verwertbarer Messergebnisse oder fahrwerksgeometrischen oder anderen fahrzeugtechnischen Gründen.',
    kategorie: 'Bremsen',
    sortierung: 2,
  },
  {
    id: 'standard-korrosion',
    titel: 'Korrosion ohne Schwächung',
    text: 'Korrosion ohne Schwächung der Achsteile oder Karosserie. Gummilagerungen altersbedingt rissig.',
    kategorie: 'Korrosion',
    sortierung: 3,
  },
  {
    id: 'standard-korrosion-teilweise',
    titel: 'Korrosion ohne Schwächung (teilweise rissig)',
    text: 'Korrosion ohne Schwächung der Achsteile oder Karosserie. Gummilagerungen altersbedingt teilweise rissig.',
    kategorie: 'Korrosion',
    sortierung: 4,
  },
  {
    id: 'standard-beladen',
    titel: 'Prüfobjekt beladen',
    text: 'Das Prüfobjekt war zum Zeitpunkt der Prüfung beladen, eine Inspektion von innen war nicht möglich',
    kategorie: 'Hinweise',
    sortierung: 5,
  },
];
