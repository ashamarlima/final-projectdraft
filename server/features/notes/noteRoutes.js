const express = require('express');

const noteController = require('./noteControllers');

const {
    protect,
    allowRoles
} = require('../../shared/authMiddleware');

const {
    noteUpload
} = require('../../shared/uploadMiddleware');

const router = express.Router();


//students upload their own notes (PDF or text)
router.post(
    '/upload',
    protect,
    allowRoles('student'),
    noteUpload.single('file'),
    noteController.uploadNote
);


//students list their own notes
router.get(
    '/',
    protect,
    allowRoles('student'),
    noteController.getNotes
);


//single note, for the /notes/:id page
router.get(
    '/:id',
    protect,
    allowRoles('student'),
    noteController.getNoteById
);
router.delete(
    '/:id',
    protect,
    allowRoles('student'),
    noteController.deleteNote
);


module.exports = router;
