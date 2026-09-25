const express = require('express');

const materialController = require('./materialControllers');

const materialAiController = require('./materialAiControllers');

const {
    protect,
    allowRoles
} = require('../../shared/authMiddleware');

const {
    aiLimiter
} = require('../../shared/rateLimit');

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


//Read one lesson again for the AI assistant (admin only). Used when the
//vision read at upload time could not finish -- the page is re-read from
//the stored PDF, so a lesson never has to be re-uploaded to get its
//assistant back.
router.post(
    '/:id/read',
    protect,
    allowRoles('admin'),
    materialController.rereadMaterialText
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
//
//Each of the three is one paid Gemini call, so each is throttled per
//student (the limiter sits behind protect() to key on the user rather
//than on a shared address).
router.post(
    '/:id/summary',
    protect,
    allowRoles('student'),
    aiLimiter,
    materialAiController.generateSummary
);


router.post(
    '/:id/ask',
    protect,
    allowRoles('student'),
    aiLimiter,
    materialAiController.askQuestion
);


router.post(
    '/:id/flashcards',
    protect,
    allowRoles('student'),
    aiLimiter,
    materialAiController.generateFlashcards
);


//the metadata for one lesson, used by the lesson's own page
router.get(
    '/:id',
    protect,
    allowRoles('student', 'teacher', 'admin'),
    materialController.getMaterialById
);


//The order of the PDFs inside one lesson. It has to stay above the
//'PUT /:id' route below, or 'reorder' would be read as an id. (The GET
//routes above it are unaffected: Express matches on method as well as
//path, so a GET /:id never claims a PUT /reorder.)
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
