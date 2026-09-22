const express = require('express');

const VideoInteractionController =
    require('./VideoInteractionControllers');

const {
    protect,
    allowRoles
} = require('../../shared/authMiddleware');

const router = express.Router();


// students can record when they click a recommended video
router.post(
    '/',
    protect,
    allowRoles('student'),
    VideoInteractionController.createVideoInteraction
);


// student can update video watched duration
router.put(
    '/:id/duration',
    protect,
    allowRoles('student'),
    VideoInteractionController.updateVideoDuration
);


module.exports = router;