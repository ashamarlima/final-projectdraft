const express = require('express');

const materialController = require('./materialControllers');

const materialAiController = require('./materialAiControllers');

const {
    protect,
    allowRoles
} = require('../../shared/authMiddleware');

const {
    materialUpload
} = require('../../shared/uploadMiddleware');

const router = express.Router();


//Signature-protected file delivery, used by the local driver's signed
//urls. It has no Bearer check on purpose: the browser loads this from an
//iframe, and an iframe cannot send an Authorization header, so the
//credential travels in the query string instead. Must stay above the
//'/:id' routes.
router.get(
    '/file',
    materialController.serveMaterialFile
);


//Students are pinned to their own grade inside the controller; admins and
//teachers may filter by subject, grade and lesson.
router.get(
    '/',
    protect,
    allowRoles('student', 'teacher', 'admin'),
    materialController.listMaterials
);


//only admins manage the library
router.post(
    '/',
    protect,
    allowRoles('admin'),
    materialUpload.single('file'),
    materialController.createMaterial
);


//a short-lived url the browser can open directly
router.get(
    '/:id/view',
    protect,
    allowRoles('student', 'teacher', 'admin'),
    materialController.getMaterialViewUrl
);


//The lesson AI assistant. Student-only, matching the notes assistant: the
//text of the lesson never leaves the server, these endpoints only return
//what the model wrote from it. The lesson is grade-scoped inside the
//controller, so a student can only study their own grade's lessons.
router.post(
    '/:id/summary',
    protect,
    allowRoles('student'),
    materialAiController.generateSummary
);


router.post(
    '/:id/ask',
    protect,
    allowRoles('student'),
    materialAiController.askQuestion
);


router.post(
    '/:id/flashcards',
    protect,
    allowRoles('student'),
    materialAiController.generateFlashcards
);


//the metadata for one lesson, used by the lesson's own page
router.get(
    '/:id',
    protect,
    allowRoles('student', 'teacher', 'admin'),
    materialController.getMaterialById
);


//the order of the PDFs inside one lesson. Must stay above the '/:id'
//routes, or 'reorder' would be read as an id.
router.put(
    '/reorder',
    protect,
    allowRoles('admin'),
    materialController.reorderMaterials
);


router.put(
    '/:id',
    protect,
    allowRoles('admin'),
    materialController.updateMaterial
);


router.delete(
    '/:id',
    protect,
    allowRoles('admin'),
    materialController.deleteMaterial
);


module.exports = router;
