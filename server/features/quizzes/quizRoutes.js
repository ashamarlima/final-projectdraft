const express = require('express');

const quizController = require('./quizControllers');

const {
    protect,
    allowRoles
} = require('../../shared/authMiddleware');

const router = express.Router();


//Quizzes belong to one student: generating, answering and reviewing are
//all scoped to the requester inside the controller.
router.post(
    '/',
    protect,
    allowRoles('student'),
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
