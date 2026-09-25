const mongoose = require('mongoose');

const { levelForXp } = require('../../shared/xp');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    password: {
        type: String,
        required: true,
        trim: true,
        select: false,
    },
    email: {
        type: String,
        required: true,
        trim: true,
        unique: true,

        //An address is the same account however it was typed, so emails
        //are stored lowercased. Mongoose runs this setter when a query
        //filter is cast as well as when a document is written, so the
        //login lookup matches 'Admin@Gmail.com' against 'admin@gmail.com'
        //without every caller remembering to lowercase it first.
        //
        //Rows written before this was set still hold whatever case the
        //admin typed; scripts/normalizeUserEmails.js lowercases those.
        lowercase: true,
    },
    phone: {
        type: String,
        required: true,
        trim: true,
    },
    status: {
        type: String,
        default: "active",
        enum: ["active", "inactive"]
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    classroom: {
        type: String,
        default: "9",
        enum: ["12", "11", "10", "9"]
    },
    role: {
        type: String,
        default: "student",
        enum: ["student", "teacher", "admin"]
    },
    Math: {
        type: Number,
        default: null,
        min: 0,
        max: 100
    },
    Literature: {
        type: Number,
        default: null,
        min: 0,
        max: 100
    },
    Science: {
        type: Number,
        default: null,
        min: 0,
        max: 100
    },
    xp: {
        type: Number,
        default: 0,
        min: 0
    }
});

//the level is derived from the stored xp rather than kept in its own
//column, so the two can never disagree
userSchema.virtual('level').get(function () {
    return levelForXp(this.xp);
});

//expose the level to every JSON response (req.user, /users/me, ...)
userSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Student_management', userSchema);