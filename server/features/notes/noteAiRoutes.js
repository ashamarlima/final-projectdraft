const express = require('express');

const noteAiController = require('./noteAiControllers');

const {
    protect,
    allowRoles
} = require('../../shared/authMiddleware');

const {
    aiLimiter
} = require('../../shared/rateLimit');

const router = express.Router();


//Every route here is one paid Gemini call, so each is throttled per
//student. The limiter sits behind protect() so it keys on the user rather
//than on an address that a whole computer room may share.


//summary of a note
router.post(
    '/summary',
    protect,
    allowRoles('student'),
    aiLimiter,
    noteAiController.generateSummary
);


//ask a question (noteId optional)
router.post(
    '/ask',
    protect,
    allowRoles('student'),
    aiLimiter,
    noteAiController.askQuestion
);


//flashcards from a note
router.post(
    '/flashcards',
    protect,
    allowRoles('student'),
    aiLimiter,
    noteAiController.generateFlashcards
);


//Quizzes used to be generated here. They now live under /api/v1/quizzes,
//because an attempt is stored and graded on the server so that it can
//award XP (see features/quizzes).


module.exports = router;
