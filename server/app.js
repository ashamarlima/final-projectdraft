const express = require('express'); 
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();
const userRoutes = require('./features/users/userRoutes');
const aiRoutes =
    require("./features/chat/aiRoutes");
const videoInteractionRoutes = require('./features/videos/VideoInteractionRoutes');
const noteRoutes = require('./features/notes/noteRoutes');
const noteAiRoutes = require('./features/notes/noteAiRoutes');
const materialRoutes = require('./features/materials/materialRoutes');
const quizRoutes = require('./features/quizzes/quizRoutes');

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/v1/ai', aiRoutes);
// This handles the prefix. 
app.use('/api/v1/users', userRoutes); 



app.use('/api/v1/video-interactions', videoInteractionRoutes);
app.use('/api/v1/notes', noteRoutes);
app.use('/api/v1/notes-ai', noteAiRoutes);
app.use('/api/v1/materials', materialRoutes);
app.use('/api/v1/quizzes', quizRoutes);


//central error handler: turns upload (multer) failures and any
//unexpected error into JSON instead of Express's HTML page
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    if (err?.name === 'MulterError') {
        //the limit differs per uploader, so the message stays generic
        const message =
            err.code === 'LIMIT_FILE_SIZE'
                ? 'The uploaded file is too large'
                : err.message;

        return res.status(400).json({ message });
    }

    //errors thrown with an explicit 4xx status (e.g. the upload
    //file-type filter) are safe to show as-is
    if (err?.status && err.status < 500) {
        return res
            .status(err.status)
            .json({ message: err.message });
    }

    console.error('Unhandled error:', err);

    return res.status(500).json({
        message: 'Internal server error'
    });
});

module.exports = app;