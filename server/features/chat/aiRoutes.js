const express = require("express");

const aiController =
    require("./aiController");

const {
    protect,
    allowRoles
} = require("../../shared/authMiddleware");

const router = express.Router();

//student AI chat

router.post(
    "/student-chat",
    protect,
    allowRoles("student"),
    aiController.studentChat
);

module.exports = router;