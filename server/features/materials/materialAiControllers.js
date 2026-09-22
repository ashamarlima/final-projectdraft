//The lesson AI assistant: chat, summary and flashcards grounded in the
//text of one lesson PDF.
//
//The text was read once at upload time and stored on the material, so
//these endpoints never touch storage or parse a PDF again. The same
//shared/ai.js helpers the notes assistant uses are reused here, which is
//why there is only one place that knows how to talk to Gemini.

const Chat = require('../chat/Chat');

const ai = require('../../shared/ai');

const {
    findAccessibleMaterialById
} = require('./materialControllers');

const MAX_QUESTION_LENGTH = 1000;

function currentUserId(req) {
    return req.user?._id || req.user?.id;
}

//the lesson's text, or '' when the PDF held none
function lessonText(material) {
    return String(material?.extractedText || '').trim();
}

//Resolve the lesson named by the URL, scoped to what this user may see (a
//student only ever reaches their own grade), and answer the request itself
//when it cannot be used. Returns null once a response has been sent.
async function loadLesson(req, res) {
    let material;

    try {
        material = await findAccessibleMaterialById(
            req,
            req.params.id
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

    //an image-only PDF has no text, so the assistant has nothing to read.
    //Saying so is more useful than a generic failure.
    if (!lessonText(material)) {
        res.status(400).json({
            message:
                'This lesson has no readable text for the AI assistant'
        });

        return null;
    }

    return material;
}

//upstream AI failures are reported as 502; a missing API key keeps its
//own (500) status
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

//summary -> bullet points, for a quick recap of the lesson
exports.generateSummary = async (req, res) => {
    const material = await loadLesson(req, res);

    if (!material) {
        return;
    }

    try {
        const summary = await ai.generateSummary(
            lessonText(material)
        );

        return res.status(200).json({
            message: 'Summary generated',
            summary
        });

    } catch (error) {
        return sendAiError(
            res,
            'Lesson summary',
            error
        );
    }
};

//question -> answer, grounded in this lesson
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

        const material = await loadLesson(req, res);

        if (!material) {
            return;
        }

        const answer = await ai.askQuestion(
            lessonText(material),
            question
        );

        //saving the history must not cost the student the answer
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
            materialId: material._id
        });

    } catch (error) {
        return sendAiError(
            res,
            'Lesson question',
            error
        );
    }
};

//flashcards -> [{ question, answer }]
exports.generateFlashcards = async (req, res) => {
    const material = await loadLesson(req, res);

    if (!material) {
        return;
    }

    try {
        const flashcards = await ai.generateFlashcards(
            lessonText(material)
        );

        return res.status(200).json({
            message: 'Flashcards generated',
            flashcards
        });

    } catch (error) {
        return sendAiError(
            res,
            'Lesson flashcards',
            error
        );
    }
};
