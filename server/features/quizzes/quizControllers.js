const QuizAttempt = require('./QuizAttempt');

const Note = require('../notes/Note');

const User = require('../users/userModels');

const ai = require('../../shared/ai');

const {
    quizXp
} = require('../../shared/xp');

const {
    findAccessibleMaterialById
} = require('../materials/materialControllers');

function currentUserId(req) {
    return req.user?._id || req.user?.id;
}

//the questions as the browser may see them: with the answers stripped,
//because the score has to be decided by the server
function publicQuestions(attempt) {
    return attempt.questions.map((question) => ({
        question: question.question,
        options: question.options
    }));
}

//an AI failure is reported as 502 (a missing API key keeps its own 500),
//matching the notes assistant
function sendAiError(res, error) {
    console.error('Quiz generation error:', error);

    return res
        .status(error.status || 502)
        .json({
            message:
                'The AI assistant is currently unavailable',

            error: error.message
        });
}

//resolve one of the student's own notes into the text, the field the
//attempt stores and the fields the response names. Answers the request and
//returns null when the note cannot be used.
async function loadNoteSource(req, res, noteId) {
    let note;

    try {
        note = await Note.findOne({
            _id: noteId,
            user: currentUserId(req)
        });

    } catch {
        res.status(400).json({
            message: 'That note id is not valid'
        });

        return null;
    }

    if (!note) {
        res.status(404).json({
            message: 'Note not found'
        });

        return null;
    }

    return {
        text: note.extractedText,
        title: note.title,
        fields: { note: note._id },
        response: {
            note: note._id,
            noteTitle: note.title
        }
    };
}

//resolve a lesson the student is allowed to see (the lookup is
//grade-scoped, so a student can only build a quiz for their own grade) and
//answer the request when it cannot be used.
async function loadLessonSource(req, res) {
    let material;

    try {
        material = await findAccessibleMaterialById(
            req,
            req.body.materialId
        );

    } catch {
        res.status(400).json({
            message: 'That lesson id is not valid'
        });

        return null;
    }

    if (!material) {
        res.status(404).json({
            message: 'Lesson not found'
        });

        return null;
    }

    //a lesson whose PDF held no readable text has nothing to build a quiz
    //from, which is worth saying plainly
    const text = String(
        material.extractedText || ''
    ).trim();

    if (!text) {
        res.status(400).json({
            message:
                'This lesson has no readable text for the AI assistant'
        });

        return null;
    }

    return {
        text,
        title: material.title,
        fields: { material: material._id },
        response: {
            material: material._id,
            materialTitle: material.title
        }
    };
}

//Generate a quiz from one of the student's own notes, or from a lesson
//PDF, and store it so the answers stay on the server until the attempt is
//submitted.
exports.createQuizAttempt = async (req, res) => {
    try {
        const { noteId, materialId } = req.body;

        //the message keeps naming noteId: that is the original endpoint,
        //and a request with neither id is a caller mistake either way
        if (!noteId && !materialId) {
            return res.status(400).json({
                message: 'noteId is required'
            });
        }

        const source = materialId
            ? await loadLessonSource(req, res)
            : await loadNoteSource(req, res, noteId);

        if (!source) {
            return;
        }

        let questions;

        try {
            questions = await ai.generateQuiz(
                source.text
            );

        } catch (error) {
            return sendAiError(res, error);
        }

        const attempt = await QuizAttempt.create({
            user: currentUserId(req),

            ...source.fields,

            //kept so the history view can name the quiz without a lookup
            sourceTitle: source.title,

            questions
        });

        return res.status(201).json({
            message: 'Quiz generated',

            attempt: {
                _id: attempt._id,

                ...source.response,

                total: questions.length,
                questions: publicQuestions(attempt)
            }
        });

    } catch (error) {
        console.error(
            'Create quiz attempt error:',
            error
        );

        return res.status(500).json({
            message: 'Unable to build that quiz'
        });
    }
};

//grade the submitted answers and credit only the XP that has not already
//been earned for this note or lesson
exports.submitQuizAttempt = async (req, res) => {
    try {
        const { answers } = req.body;

        if (!Array.isArray(answers)) {
            return res.status(400).json({
                message:
                    'An array of answers is required'
            });
        }

        let attempt;

        try {
            attempt = await QuizAttempt.findOne({
                _id: req.params.id,
                user: currentUserId(req)
            });

        } catch {
            return res.status(400).json({
                message: 'That quiz id is not valid'
            });
        }

        if (!attempt) {
            return res.status(404).json({
                message: 'Quiz not found'
            });
        }

        //one graded attempt per generated quiz, so replaying the same
        //quiz id can never pay out twice
        if (attempt.submittedAt) {
            return res.status(409).json({
                message:
                    'That quiz has already been submitted'
            });
        }

        const studentId = currentUserId(req);

        //the answers that were stored with the quiz decide the score,
        //never anything the request claims
        const results = attempt.questions.map(
            (question, index) => {
                const given =
                    typeof answers[index] === 'string'
                        ? answers[index]
                        : null;

                return {
                    correct:
                        given !== null &&
                        given ===
                            question.correctAnswer,

                    given,

                    correctAnswer:
                        question.correctAnswer
                };
            }
        );

        const correct = results.filter(
            (result) => result.correct
        ).length;

        const earned = quizXp(correct);

        //The quota is per source: a lesson's quiz and a note's quiz are
        //scored separately, so an earlier lesson attempt can never cap a
        //note attempt. Within a source, retaking only pays the
        //difference over the best result so far.
        const sourceFilter = attempt.material
            ? { material: attempt.material }
            : { note: attempt.note };

        const best = await QuizAttempt.findOne({
            _id: { $ne: attempt._id },
            user: studentId,

            ...sourceFilter,

            submittedAt: { $ne: null }
        }).sort({ xpAwarded: -1 });

        const bestSoFar = Number(best?.xpAwarded) || 0;

        const awarded = Math.max(
            0,
            earned - bestSoFar
        );

        attempt.correct = correct;
        attempt.xpAwarded = earned;
        attempt.submittedAt = new Date();

        await attempt.save();

        //failing to credit XP must not fail the submission: the score is
        //already recorded
        if (awarded > 0) {
            try {
                await User.findByIdAndUpdate(
                    studentId,
                    {
                        $inc: { xp: awarded }
                    },
                    {
                        new: true
                    }
                );

            } catch (error) {
                console.error(
                    'Unable to award quiz XP:',
                    error
                );
            }
        }

        return res.status(200).json({
            message: 'Quiz submitted',
            correct,
            total: attempt.questions.length,
            xpAwarded: awarded,
            results
        });

    } catch (error) {
        console.error(
            'Submit quiz attempt error:',
            error
        );

        return res.status(500).json({
            message: 'Unable to submit that quiz'
        });
    }
};

//the student's graded attempts, newest first, for the history list.
//Unsubmitted attempts are left out: they have no score yet.
//
//Only the note is populated: a lesson's title is already stored on the
//attempt as sourceTitle, so the history needs no second lookup.
exports.listQuizAttempts = async (req, res) => {
    try {
        const attempts = await QuizAttempt.find({
            user: currentUserId(req),
            submittedAt: { $ne: null }
        })
            .sort({ submittedAt: -1 })
            .populate('note', 'title');

        return res.status(200).json({
            attempts: attempts.map((attempt) => {
                //a lesson quiz names the lesson, a note quiz the note
                const isLesson = Boolean(
                    attempt.material
                );

                return {
                    _id: attempt._id,

                    noteId:
                        attempt.note?._id || null,

                    materialId:
                        attempt.material || null,

                    noteTitle: isLesson
                        ? ''
                        : attempt.note?.title ||
                          'Deleted note',

                    materialTitle: isLesson
                        ? attempt.sourceTitle ||
                          'Deleted lesson'
                        : '',

                    correct: attempt.correct,
                    total: attempt.questions.length,
                    xpAwarded: attempt.xpAwarded,
                    submittedAt: attempt.submittedAt
                };
            })
        });

    } catch (error) {
        console.error(
            'List quiz attempts error:',
            error
        );

        return res.status(500).json({
            message: 'Unable to load your quiz results'
        });
    }
};
