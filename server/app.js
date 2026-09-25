const express = require('express'); 
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const app = express();

//Standard security headers, applied before anything else so no response
//escapes them.
//
//Two of helmet's defaults are relaxed here on purpose:
//
//  * crossOriginResourcePolicy -- the client is allowed to sit on another
//    origin (see CLIENT_URL and COOKIE_SAME_SITE). The default would be
//    'same-origin', which stops that browser reading any of our responses.
//
//  * framing -- a lesson PDF is shown by pointing an iframe at our own
//    signed /file url. 'self' alone would block that whenever the client
//    is on another origin, so the configured client origin is allowed
//    alongside it. X-Frame-Options cannot name an origin (ALLOW-FROM is
//    dead), so frameguard is switched off and the policy lives in CSP.
app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: true,

            directives: {
                'frame-ancestors': [
                    "'self'",

                    process.env.CLIENT_URL ||
                        'http://localhost:5173'
                ]
            }
        },

        crossOriginResourcePolicy: {
            policy: 'cross-origin'
        },

        frameguard: false
    })
);
const userRoutes = require('./features/users/userRoutes');
const aiRoutes =
    require("./features/chat/aiRoutes");
const videoInteractionRoutes = require('./features/videos/VideoInteractionRoutes');
const noteRoutes = require('./features/notes/noteRoutes');
const noteAiRoutes = require('./features/notes/noteAiRoutes');
const materialRoutes = require('./features/materials/materialRoutes');
const quizRoutes = require('./features/quizzes/quizRoutes');

//Behind a reverse proxy (nginx, a PaaS router) the client address arrives
//in X-Forwarded-For. The login throttle counts per client address, so
//without this every request would look like it came from the proxy and one
//attacker could lock the whole school out of logging in. Set TRUST_PROXY
//to the number of proxies in front of the app (a plain count, e.g. 1) or
//to an Express preset such as 'loopback'.
if (process.env.TRUST_PROXY) {
    const value = process.env.TRUST_PROXY;

    app.set(
        'trust proxy',
        /^\d+$/.test(value) ? Number(value) : value
    );
}

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
//
//A response body says what failed, never how. The error's own message is
//logged, and only an error that carries an explicit 4xx status (one we
//threw for the caller) is repeated back. A 5xx stays generic, because a
//Mongo or storage message can name collections, index names and paths.
//The controllers below follow the same rule in their own catch blocks:
//console.error the error, answer with a fixed message. The AI endpoints
//are the deliberate exception -- an upstream provider message (a quota
//error, say) is passed through, because the caller can act on it.
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