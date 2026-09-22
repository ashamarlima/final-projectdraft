const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    grade: {
        type: String,
        required: true,
        enum: ["12", "11", "10", "9"],
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student_management',
        required: true,
    },
    students: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student_management',
    }],
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, { timestamps: true });

module.exports = mongoose.model('Class', classSchema);