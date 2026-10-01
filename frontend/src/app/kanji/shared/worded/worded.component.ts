import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Part } from './worded-parts';

/**
 * A sentence with material inside it, drawn piece by piece (wordedParts()):
 * the app's own words as they are, each piece of material, kept term or typed
 * text in a span that says which language it is in. The host takes no room of
 * its own, and adds no space around the sentence.
 */
@Component({
  selector: 'app-worded',
  templateUrl: './worded.component.html',
  styleUrl: './worded.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WordedComponent {
  readonly parts = input.required<Part[]>();
}
