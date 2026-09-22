const express = require('express');

const noteAiController = require('./noteAiControllers');

const {
    protect,
    allowRoles
} = require('../../shared/authMiddleware');

const router = express.Router();


//summary of a note
router.post(
    '/summary',
    protect,
    allowRoles('student'),
    noteAiController.generateSummary
);


//ask a question (noteId optional)
router.post(
    '/ask',
    protect,
    allowRoles('student'),
    noteAiController.askQuestion
);


//flashcards from a note
router.post(
    '/flashcards',
    protect,
    allowRoles('student'),
    noteAiController.generateFlashcards
);


//Quizzes used to be generated here. They now live under /api/v1/quizzes,
//because an attempt is stored and graded on the server so that it can
//award XP (see features/quizzes).


module.exports = router;
