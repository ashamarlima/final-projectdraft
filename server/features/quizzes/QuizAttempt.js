const mongoose = require('mongoose');

//A generated multiple-choice quiz, and the student's result once they
//answer it.
//
//The questions keep their correct answers here and the answers are never
//serialised before the attempt has been submitted, so the score is always
//computed on the server. A client cannot post a score it invented, which
//is what makes the XP award below meaningful.
const quizAttemptSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student_management',
            required: true,
            index: true
        },

        //A quiz is built from exactly one source: the student's own note,
        //or a lesson PDF from the library. Which one is set decides where
        //the "best attempt so far" XP quota is measured, so that a note's
        //quiz and a lesson's quiz never cap each other.
        note: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Note',
            default: null,
            index: true
        },
        material: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'LessonMaterial',
            default: null,
            index: true
        },

        //the source's title when the quiz was built, so the history view
        //can name it without a second lookup
        sourceTitle: {
            type: String,
            default: '',
            trim: true
        },

        //the generated quiz, kept so the same questions can be graded
        questions: [
            {
                question: {
                    type: String,
                    required: true
                },
                options: {
                    type: [String],
                    default: []
                },
                correctAnswer: {
                    type: String,
                    required: true
                }
            }
        ],

        //null until the attempt is answered
        submittedAt: {
            type: Date,
            default: null
        },

        //questions the server graded as correct
        correct: {
            type: Number,
            default: null,
            min: 0
        },

        //what this attempt is worth in XP. The quota for a note is the
        //best of a student's attempts, so only the increase is ever
        //credited to the account (see the quizzes controller); the field
        //is stored unmodified so that best is easy to read back.
        xpAwarded: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    { timestamps: true }
);

//the history view is "my submitted attempts, newest first"
quizAttemptSchema.index({ user: 1, submittedAt: -1 });

//the XP rule looks for the best earlier attempt on the same note, and the
//same for a lesson
quizAttemptSchema.index({ user: 1, note: 1, xpAwarded: -1 });
quizAttemptSchema.index({
    user: 1,
    material: 1,
    xpAwarded: -1
});

//a quiz must belong to a note or to a lesson, never both and never neither
quizAttemptSchema.path('note').validate(
    function (value) {
        return (
            Boolean(value) !== Boolean(this.material)
        );
    },
    'A quiz attempt must belong to either a note or a lesson'
);

module.exports = mongoose.model(
    'QuizAttempt',
    quizAttemptSchema
);
