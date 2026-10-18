/**
 * sessionStorage: the paper that was open when the site stopped for an update
 * (ExamComponent.keepPaper()). A file of its own, so that what names it - the
 * Privacy page's list of what this app keeps in the browser
 * (legal/legal-facts.ts) - does not load the exam with it.
 */
export const KEPT_PAPER_KEY = 'academy-exam-kept-paper';
