// What the backend answers (backend/api/routes/*.php), as the frontend reads it.

/** GET /api/auth/config: how this copy signs people in. */
export interface AuthConfig {
  mode: 'none' | 'iam';
  issuer?: string;
  clientId?: string;
}

/** Every failure: {error, code?}; a copy not set up yet also says where to set it up (and, to this computer, what is missing). */
export interface ApiErrorBody {
  error?: string;
  code?: string;
  setup?: string;
  reason?: string;
}

/* ------------------------------------------------------------------ kanji */

export type ItemType = 'kanji' | 'vocab';
export type LessonTypes = 'both' | 'kanji' | 'vocab';

/** One study item of the catalog (backend/src/srs/catalog.php). */
export interface CatalogItem {
  id: string;
  type: ItemType;
  chars: string;
  /** a kanji's number in the course's list */
  no?: number;
  /** the item's level: a kanji's lesson; a word's latest kanji's */
  lesson: number;
  courseLesson: number;
  order: number;
  meanings: string[];
  readings: string[];
  on?: string[];
  kun?: string[];
  /** a word's kanji */
  kanji?: string[];
  /** a kanji's example words (vocabulary ids) */
  examples?: string[];
  /** a word's two clips, female and male */
  audio: string[] | null;
  verbClass?: string | null;
  adjClass?: string | null;
  pos?: string | null;
}

export interface Stage {
  n: number;
  name: string;
  group: string;
  hours: number | null;
}

export interface StageGroup {
  id: string;
  name: string;
  stages: number[];
}

/** GET /api/kanji/catalog */
export interface Catalog {
  items: CatalogItem[];
  lessons: number[];
  stages: Stage[];
  groups: StageGroup[];
}

export interface Tally {
  correct: number;
  incorrect: number;
}

/** One item's record (srs_blank() in backend/src/srs/srs.php); times in milliseconds. */
export interface ItemState {
  stage: number;
  learnedAt: number | null;
  nextReview: number | null;
  lastReviewAt: number | null;
  burnedAt: number | null;
  reviews: { meaning: Tally; reading: Tally };
  streak: { meaning: number; reading: number };
  practice: Tally & { last: number | null };
  lastWrongAt: number | null;
  notes: { meaning: string; reading: string };
  synonyms: string[];
  extraReadings: string[];
}

export interface Settings {
  batchSize: number;
  lessonTypes: LessonTypes;
  autoplay: boolean;
}

export interface DayCounts {
  lessons: number;
  reviews: number;
  reviewsCorrect: number;
  practice: number;
  practiceCorrect: number;
}

export interface LessonCounts {
  total: number;
  learned: number;
  guru: number;
}

/** The dashboard (kanji_summarize()). */
export interface Summary {
  now: number;
  total: number;
  learned: number;
  lessonsAvailable: number;
  reviewsDue: number;
  nextReviewAt: number | null;
  groups: Record<string, { total: number; kanji: number; vocab: number }>;
  forecastHours: number[];
  forecastDays: number[];
  byLesson: Record<string, { kanji: LessonCounts; vocab: LessonCounts }>;
  today: DayCounts;
  history: (DayCounts & { date: string })[];
}

/** GET /api/kanji/progress */
export interface Progress {
  settings: Settings;
  items: Record<string, ItemState>;
  summary: Summary;
}

/** POST /api/kanji/learn, /review, /practice, /item, /reset-item */
export interface StateAnswer {
  state: ItemState;
  from?: number;
  to?: number;
}

/** What POST /api/kanji/item may change. */
export interface ItemPatch {
  notes?: Partial<Record<'meaning' | 'reading', string>>;
  addSynonym?: string;
  removeSynonym?: string;
  addReading?: string;
  removeReading?: string;
}

/* ------------------------------------------------------------------- exam */

export interface ExamMeta {
  books: { id: number; name: string; lessons: number[]; available: number; bySection: Record<string, number> }[];
  sections: { id: string; name: string; audio: boolean; available: number }[];
  lessons: { id: number; name: string; book: number }[];
  bankSize: number;
  attempts: number;
}

/** What a paper is built from; echoed back verbatim with the answers, so the server rebuilds this very paper. */
export type ExamSpec = Record<string, unknown>;

/** A question as the browser gets it: never its answer. */
export interface ExamQuestion {
  n: number;
  id: string;
  section: string;
  sectionName: string;
  lesson: number;
  book: number;
  question: string;
  hint: string | null;
  reading: string | null;
  audio: string | null;
  options: string[];
}

/** POST /api/exam */
export interface ExamPaper {
  spec: ExamSpec;
  seed: string;
  size: number;
  createdAt: string;
  questions: ExamQuestion[];
}

export interface Breakdown {
  name: string;
  pct: number;
  right: number;
  total: number;
}

export interface ReviewRow {
  n: number;
  section: string;
  lesson: number;
  audio: string | null;
  question: string;
  chosen: string | null;
  correctAnswer: string;
  correct: boolean;
  explain: string;
  ref: string | null;
}

/** POST /api/submit */
export interface ExamResult {
  id: string;
  summary: {
    total: number;
    answered: number;
    unanswered: number;
    right: number;
    wrong: number;
    pct: number;
    grade: string;
    passed: boolean;
    passMark: number;
    totalMs: number;
    avgMs: number;
  };
  bySection: Breakdown[];
  byLesson: Breakdown[];
  reportUrl: string;
  review: ReviewRow[];
}

/** One line of GET /api/attempts (newest first). */
export interface Attempt {
  id: string;
  finishedAt: string;
  total: number;
  right: number;
  pct: number;
  grade: string;
  passed: boolean;
  candidate: string;
}
