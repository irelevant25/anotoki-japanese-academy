-- Japanese Academy — the database (PostgreSQL 13 or newer; the tests drop their databases WITH (FORCE))
--
-- Your study data. Nothing rebuilds these; setup.php fills them once from the
-- old JSON files (progress/, results/, reports/) and the backups copy them:
--   srs_settings, srs_progress, srs_daily, srs_log   the kanji trainer
--   exam_attempts                                    the exam's attempts and their reports
--   imports                                          what setup.php has imported
--
-- The study content, rebuilt from data/ whenever data/ or the code that builds
-- from it changes (src/content.php):
--   srs_items, exam_questions, content_state
--
-- Times the browser sees are milliseconds since 1970; the columns are
-- timestamptz, converted with these two functions.

CREATE FUNCTION academy_ms(t timestamptz) RETURNS bigint
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $$ SELECT (extract(epoch FROM t) * 1000)::bigint $$;

CREATE FUNCTION academy_time(ms bigint) RETURNS timestamptz
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $$ SELECT timestamptz 'epoch' + ms * interval '1 millisecond' $$;

-- ---------------------------------------------------------------- kanji SRS

-- One row: the trainer's settings, and when this progress was started (a full
-- reset starts it again) and last changed.
CREATE TABLE srs_settings (
    id           smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    batch_size   smallint    NOT NULL DEFAULT 5 CHECK (batch_size BETWEEN 1 AND 20),
    lesson_types text        NOT NULL DEFAULT 'both' CHECK (lesson_types IN ('both', 'kanji', 'vocab')),
    autoplay     boolean     NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO srs_settings (id) VALUES (1);

-- One row per item you have touched (learned, reviewed, practised, or given a
-- note). No foreign key to srs_items: progress outlives a catalog rebuild.
CREATE TABLE srs_progress (
    item_id            text        PRIMARY KEY, -- k:<kanji> / v:<word>
    stage              smallint    NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 9),
    learned_at         timestamptz,
    next_review        timestamptz,
    last_review_at     timestamptz,
    burned_at          timestamptz,
    meaning_correct    integer     NOT NULL DEFAULT 0,
    meaning_incorrect  integer     NOT NULL DEFAULT 0,
    reading_correct    integer     NOT NULL DEFAULT 0,
    reading_incorrect  integer     NOT NULL DEFAULT 0,
    meaning_streak     integer     NOT NULL DEFAULT 0,
    reading_streak     integer     NOT NULL DEFAULT 0,
    practice_correct   integer     NOT NULL DEFAULT 0,
    practice_incorrect integer     NOT NULL DEFAULT 0,
    practice_last      timestamptz,
    last_wrong_at      timestamptz,
    meaning_note       text        NOT NULL DEFAULT '',
    reading_note       text        NOT NULL DEFAULT '',
    synonyms           jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(synonyms) = 'array'),
    extra_readings     jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(extra_readings) = 'array'),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX srs_progress_next_review ON srs_progress (next_review) WHERE stage BETWEEN 1 AND 8;

-- Lessons, reviews and practice per local day, for the dashboard.
CREATE TABLE srs_daily (
    day              date    PRIMARY KEY,
    lessons          integer NOT NULL DEFAULT 0,
    reviews          integer NOT NULL DEFAULT 0,
    reviews_correct  integer NOT NULL DEFAULT 0,
    practice         integer NOT NULL DEFAULT 0,
    practice_correct integer NOT NULL DEFAULT 0
);

-- Every lesson, review and practice answer, and every reset. Only ever added to.
CREATE TABLE srs_log (
    id      bigserial   PRIMARY KEY,
    at      timestamptz NOT NULL,
    kind    text        NOT NULL,             -- lesson | review | practice | reset-item | reset
    item_id text,
    details json        NOT NULL DEFAULT '{}' -- review: meaningWrong, readingWrong, from, to; practice: firstTryCorrect, wrong
);
CREATE INDEX srs_log_item ON srs_log (item_id);

-- ---------------------------------------------------------------- the exam

CREATE TABLE exam_attempts (
    id          text        PRIMARY KEY, -- <finished at>-<seed>, as the result files were named
    started_at  timestamptz,
    finished_at timestamptz NOT NULL,
    candidate   text        NOT NULL DEFAULT '',
    seed        text        NOT NULL,
    total       integer     NOT NULL,
    right_count integer     NOT NULL,
    pct         double precision NOT NULL,
    grade       text        NOT NULL,
    passed      boolean     NOT NULL,
    attempt     json        NOT NULL,    -- the whole record: paper, summary, breakdowns, every answer
    report      text                     -- the standalone HTML report
);
CREATE INDEX exam_attempts_finished ON exam_attempts (finished_at);

-- ------------------------------------------------------------------ imports

CREATE TABLE imports (
    source      text        PRIMARY KEY, -- 'json-files': progress/, results/, reports/
    imported_at timestamptz NOT NULL DEFAULT now(),
    summary     jsonb       NOT NULL
);

-- ------------------------------------------------------------ study content

-- Which content the tables below were built from.
CREATE TABLE content_state (
    id           smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    hash         text        NOT NULL, -- of data/ and the code that builds from it
    synced_at    timestamptz NOT NULL,
    lessons      jsonb       NOT NULL, -- the catalog's lessons
    audio_words  integer     NOT NULL,
    audio_voices integer     NOT NULL
);

-- The kanji trainer's study items, in course order.
CREATE TABLE srs_items (
    id     text     PRIMARY KEY,
    ord    integer  NOT NULL UNIQUE,
    type   text     NOT NULL CHECK (type IN ('kanji', 'vocab')),
    lesson smallint NOT NULL,
    kanji  jsonb    NOT NULL, -- the kanji a word is written with ([] for a kanji)
    data   json     NOT NULL  -- the item as GET /api/kanji/catalog sends it
);

-- The exam's question bank. Papers are drawn from it in seq order.
CREATE TABLE exam_questions (
    seq         integer  PRIMARY KEY,
    id          text     NOT NULL UNIQUE, -- q1, q2 …
    section     text     NOT NULL,
    lesson      smallint NOT NULL,
    book        smallint NOT NULL,
    question    text     NOT NULL,
    hint        text,
    reading     text,
    audio       text,
    correct     text     NOT NULL,
    distractors json     NOT NULL,
    explain     text     NOT NULL,
    ref         text
);
CREATE INDEX exam_questions_scope ON exam_questions (section, lesson);
