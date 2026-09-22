const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student_management',
            required: true,
            index: true
        },
        title: {
            type: String,
            required: true,
            trim: true
        },
        extractedText: {
            type: String,
            required: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Note', noteSchema);
