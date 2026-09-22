const Note = require('./Note');
const Chat = require('../chat/Chat');
const ai = require('../../shared/ai');

const MAX_QUESTION_LENGTH = 1000;

function currentUserId(req) {
    return req.user?._id || req.user?.id;
}

//resolve the note referenced by the request body, scoped to the
//logged-in user, and answer the request with 400/404 when it is
//missing. Returns null when a response was already sent.
async function loadNoteFromBody(req, res) {
    const { noteId } = req.body;

    if (!noteId) {
        res.status(400).json({
            message: 'noteId is required'
        });

        return null;
    }

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

    return note;
}

//upstream AI failures are reported as 502; a missing API key keeps
//its own (500) status
function sendAiError(res, label, error) {
    console.error(`${label} error:`, error);

    return res
        .status(error.status || 502)
        .json({
            message:
                'The AI assistant is currently unavailable',

            error: error.message
        });
}

//summary -> bullet points
exports.generateSummary = async (req, res) => {
    const note = await loadNoteFromBody(req, res);

    if (!note) {
        return;
    }

    try {
        const summary = await ai.generateSummary(
            note.extractedText
        );

        return res.status(200).json({
            message: 'Summary generated',
            summary
        });

    } catch (error) {
        return sendAiError(
            res,
            'Summary',
            error
        );
    }
};

//question -> answer, optionally grounded in a note
exports.askQuestion = async (req, res) => {
    try {
        const question = (
            req.body.question || ''
        ).trim();

        if (!question) {
            return res.status(400).json({
                message: 'A question is required'
            });
        }

        if (question.length > MAX_QUESTION_LENGTH) {
            return res.status(400).json({
                message:
                    `Your question must be less than ${MAX_QUESTION_LENGTH} characters`
            });
        }

        //context is optional: without a note the assistant falls
        //back to general knowledge
        let context = '';
        let noteId = null;

        if (req.body.noteId) {
            const note = await loadNoteFromBody(
                req,
                res
            );

            if (!note) {
                return;
            }

            context = note.extractedText;
            noteId = note._id;
        }

        const answer = await ai.askQuestion(
            context,
            question
        );

        //saving history must not cost the student the answer
        try {
            await Chat.create({
                user: currentUserId(req),
                question,
                answer
            });

        } catch (error) {
            console.error(
                'Unable to save chat history:',
                error
            );
        }

        return res.status(200).json({
            message: 'Answer generated',
            answer,
            noteId
        });

    } catch (error) {
        return sendAiError(
            res,
            'Question',
            error
        );
    }
};

//flashcards -> [{ question, answer }]
exports.generateFlashcards = async (req, res) => {
    const note = await loadNoteFromBody(req, res);

    if (!note) {
        return;
    }

    try {
        const flashcards =
            await ai.generateFlashcards(
                note.extractedText
            );

        return res.status(200).json({
            message: 'Flashcards generated',
            flashcards
        });

    } catch (error) {
        return sendAiError(
            res,
            'Flashcards',
            error
        );
    }
};

//Quiz generation moved to features/quizzes: an attempt is stored and
//graded on the server there, because it awards XP. The AI helper itself
//(shared/ai.js) is unchanged and is reused by that controller.
