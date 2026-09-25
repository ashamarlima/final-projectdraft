//XP and levelling rules.
//
//XP is stored on the user document and only ever goes up. The level is
//derived from it (see the virtual on models/userModels.js), so the two
//can never drift apart.
//
//This module is deliberately dependency-free: models/userModels.js
//requires it, so requiring a model from here would create a cycle.

//XP needed to move up one level
const XP_PER_LEVEL = 100;

//watch time -> XP
const XP_PER_WATCHED_MINUTE = 10;

//a correctly answered quiz question -> XP
const XP_PER_CORRECT_ANSWER = 10;

//subjects that can be graded
const SUBJECTS = ["Math", "Literature", "Science"];

const levelForXp = (xp) =>
    Math.floor(Math.max(0, Number(xp) || 0) / XP_PER_LEVEL) + 1;

//grades contribute their own value as XP (0-100 per subject), which
//makes grade XP idempotent: re-saving the same grades gains nothing
//and only an improvement is awarded
const gradeXp = (grades = {}) =>
    SUBJECTS.reduce((total, subject) => {
        const value = Number(grades[subject]);

        if (!Number.isFinite(value)) {
            return total;
        }

        return total + Math.min(Math.max(value, 0), 100);
    }, 0);

//XP for time actually spent watching a recommended video
const watchedXp = (seconds) =>
    Math.floor(Math.max(0, Number(seconds) || 0) / 60) *
    XP_PER_WATCHED_MINUTE;

//XP a quiz attempt is worth. `correct` is the number of questions the
//server itself graded as right, so the value can never come from the
//browser. Only the improvement over the student's best previous attempt
//on the same note is credited (see the quizzes controller), which makes
//retaking a quiz idempotent rather than farmable.
const quizXp = (correct) =>
    Math.max(0, Math.floor(Number(correct) || 0)) *
    XP_PER_CORRECT_ANSWER;

module.exports = {
    levelForXp,
    gradeXp,
    watchedXp,
    quizXp
};
