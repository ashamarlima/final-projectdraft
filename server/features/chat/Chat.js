const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student_management',
            required: true,
            index: true
        },
        question: {
            type: String,
            required: true,
            trim: true
        },
        answer: {
            type: String,
            required: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Chat', chatSchema);
