const express = require('express');

const quizController = require('./quizControllers');

const {
    protect,
    allowRoles
} = require('../../shared/authMiddleware');

const {
    aiLimiter
} = require('../../shared/rateLimit');

const router = express.Router();


//Quizzes belong to one student: generating, answering and reviewing are
//all scoped to the requester inside the controller.
//
//Generating one is a paid Gemini call, so it is throttled per student.
//Answering and reviewing are not: they only read and grade what was
//already generated.
router.post(
    '/',
    protect,
    allowRoles('student'),
    aiLimiter,
    quizController.createQuizAttempt
);


//the student's past results, newest first
router.get(
    '/',
    protect,
    allowRoles('student'),
    quizController.listQuizAttempts
);


//answers are graded on the server; the request never carries a score
router.post(
    '/:id/submit',
    protect,
    allowRoles('student'),
    quizController.submitQuizAttempt
);


module.exports = router;
