import { Pipe, PipeTransform, inject } from '@angular/core';
import { fmtClock, fmtDate, fmtDateTime, fmtWeekday } from '../format';
import { TimeWording } from './time-wording';

/** A date, a date with its time, the clock alone, or the day of the week. */
export type LocalDateStyle = 'date' | 'dateTime' | 'clock' | 'weekday';

/**
 * `{{ entry.date | localDate }}`: a date or a time written the way the
 * language on the page writes it — through `Intl`, so in the reader's own time
 * zone. The same as core/format.ts gives a component's own code.
 *
 *   'date'      24 Sept 2026 / 24. 9. 2026
 *   'dateTime'  24 Sept 2026, 14:00 / 24. 9. 2026, 14:00
 *   'clock'     14:00
 *   'weekday'   Thu / št
 *
 * A signed-in person's own date order and clock, chosen for their anotoki
 * account (TimeWording.dateFormat(), timeFormat()), win over the
 * language's: 2026-09-24, 2026-09-24 2:00 pm, 2:00 pm.
 *
 * Takes a time in milliseconds or the server's ISO text. A calendar day
 * (`2026-09-24`, a release's date) is that day wherever the reader is — not
 * midnight UTC. Nothing gives nothing; what is not a date comes back as it
 * came.
 *
 * Impure, like the translate pipe: the language — or the account's choice —
 * changes under the same value.
 */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly wording = inject(TimeWording);

  transform(value: string | number | null | undefined, style: LocalDateStyle = 'date'): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    const ts = timeOf(value);
    if (Number.isNaN(ts)) {
      return String(value);
    }
    switch (style) {
      case 'dateTime':
        return fmtDateTime(this.wording, ts);
      case 'clock':
        return fmtClock(this.wording, ts);
      case 'weekday':
        return fmtWeekday(this.wording, ts);
      default:
        return fmtDate(this.wording, ts);
    }
  }
}

/** A calendar day is taken as that day at noon here; anything else as the moment it names. */
function timeOf(value: string | number): number {
  if (typeof value === 'number') {
    return value;
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return (day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12) : new Date(value)).getTime();
}
