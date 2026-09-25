//The subjects the lesson PDF library holds, in the order the admin page
//shows them.
//
//These exact strings are what the API stores and filters on, so they have
//to match the enum on the server's LessonMaterial model. Adding a subject
//here and on the model is all it takes for it to be uploadable from the
//Subject Lessons page and visible on the matching student page.
export const LESSON_SUBJECTS = [
  "English",
  "Math",
  "Natural Sciences"
];

//A unit and a lesson are each a whole number from 1 up to these values.
//They have to match MAX_UNIT and MAX_LESSON in the server's materials
//controller, which is where the rule is actually enforced; these drive the
//form's min/max and the messages shown before a request is ever sent.
export const MAX_UNIT = 99;
export const MAX_LESSON = 99;

//The student shell names its subjects differently: LearnPage and
//SubjectPage use "Mathematics" and "Science" because that is what a
//student reads on the page. The API name behind each page is looked up
//here rather than renaming those routes, for both the lesson library
//below and the grade columns further down.
const LIBRARY_SUBJECT_BY_PAGE_SUBJECT = {
  English: "English",
  Mathematics: "Math",
  Science: "Natural Sciences"
};

//The library subject a student page should load. An unknown name is
//returned unchanged, so an unexpected route simply asks for a subject
//that has no PDFs yet instead of silently showing another subject's.
export function librarySubjectFor(pageSubject) {
  return (
    LIBRARY_SUBJECT_BY_PAGE_SUBJECT[pageSubject] ||
    pageSubject
  );
}

//The subjects the API actually grades are named differently again: the
//grade columns are Math, Literature and Science (see shared/xp.js on the
//server), while the student shell shows Mathematics, Science and English.
//Two of them pair exactly, and the English page is the one marked under
//Literature, which is the only language subject this app grades.
const GRADE_KEY_BY_PAGE_SUBJECT = {
  Mathematics: "Math",
  Science: "Science",
  English: "Literature"
};

//The grade a student page is marked under, or null when the page is not a
//graded subject. Null reads as "not graded", so an unexpected route shows
//no mark rather than borrowing another subject's grades.
export function gradeKeyForPageSubject(pageSubject) {
  return GRADE_KEY_BY_PAGE_SUBJECT[pageSubject] || null;
}
