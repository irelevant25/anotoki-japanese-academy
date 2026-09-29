import { Routes } from '@angular/router';
import { BrowseComponent } from './browse/browse.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ItemComponent } from './item/item.component';
import { freshKanji, KanjiShellComponent } from './kanji-shell.component';
import { LessonsComponent } from './lessons/lessons.component';
import { PracticeComponent } from './practice/practice.component';
import { ReviewsComponent } from './reviews/reviews.component';

/** Every screen of the trainer loads fresh progress first (freshKanji), even at the address already shown. */
const screen = (nav: string) => ({ data: { nav }, resolve: { fresh: freshKanji }, runGuardsAndResolvers: 'always' as const });

export const KANJI_ROUTES: Routes = [
  {
    path: '',
    component: KanjiShellComponent,
    children: [
      { path: '', component: DashboardComponent, ...screen('') },
      { path: 'lessons', component: LessonsComponent, ...screen('lessons') },
      { path: 'reviews', component: ReviewsComponent, ...screen('reviews') },
      { path: 'practice', component: PracticeComponent, ...screen('practice') },
      { path: 'browse', component: BrowseComponent, ...screen('browse') },
      // an item's page is none of the tabs: none is marked
      { path: 'item/:id', component: ItemComponent, ...screen('item') },
      { path: '**', redirectTo: '' },
    ],
  },
];
