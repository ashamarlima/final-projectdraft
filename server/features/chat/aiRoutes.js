const express = require("express");

const aiController =
    require("./aiController");

const {
    protect,
    allowRoles
} = require("../../shared/authMiddleware");

const {
    aiLimiter
} = require("../../shared/rateLimit");

const router = express.Router();

//student AI chat

//One message is one paid Gemini call, so the route is throttled per
//student. The limiter sits behind protect() so it keys on the user rather
//than on an address a whole computer room may share.
router.post(
    "/student-chat",
    protect,
    allowRoles("student"),
    aiLimiter,
    aiController.studentChat
);

module.exports = router;