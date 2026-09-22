//Endpoint tests for the video-interaction routes
//(POST / and PUT /:id/duration).
//
//The real Express routes and JWT auth middleware are used, while the
//two Mongoose models are swapped for lightweight stubs, so the tests
//run fast and need no database. Run with: npm test

const {
    test,
    before,
    after,
    beforeEach
} = require('node:test');

const assert =
    require('node:assert/strict');

const path =
    require('node:path');

const jwt =
    require('jsonwebtoken');

const express =
    require('express');

//make sure a JWT secret exists before the auth middleware runs
process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    'video-interactions-test-secret';

const SERVER_ROOT =
    path.join(__dirname, '..', '..');

//replace a module in the require cache so later requires of it get
//the stub instead of the real (database-bound) mongoose model
function stubModule(
    relativeFile,
    value
) {
    const resolved =
        require.resolve(
            path.join(
                SERVER_ROOT,
                relativeFile
            )
        );

    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports: value
    };
}

//the user returned by the auth middleware when it looks up the token
const fakeUsers = {
    current: {
        _id: 'student-1',
        name: 'Test Student',
        email: 'student@example.com',
        phone: '0000000000',
        status: 'active',
        classroom: '9',
        role: 'student'
    },

    async findById(id) {
        const user = this.current;

        return (
            user &&
            String(user._id) === String(id)
        )
            ? user
            : null;
    },

    //XP is credited with a targeted $inc, so record each award
    xpIncrements: [],

    async findByIdAndUpdate(id, update) {
        this.xpIncrements.push({ id, update });

        return this.current;
    }
};

const fakeVideoInteraction = {
    createCalls: [],
    findOneCalls: [],
    saveCalls: [],

    //interactions the "database" holds. findOne scopes by both _id
    //and studentId, which is the ownership check the controller
    //relies on.
    interactions: [],

    async create(payload) {
        this.createCalls.push(payload);

        return {
            _id: 'vi-1',
            ...payload
        };
    },

    findOne(query) {
        this.findOneCalls.push(query);

        const result = this.interactions.find(
            (interaction) =>
                String(interaction._id) ===
                    String(query._id) &&
                String(interaction.studentId) ===
                    String(query.studentId)
        );

        if (!result) {
            return Promise.resolve(null);
        }

        //mimic a mongoose document: save() persists in place
        result.save = async () => {
            this.saveCalls.push(result);

            return result;
        };

        return Promise.resolve(result);
    }
};

stubModule(
    'features/users/userModels.js',
    fakeUsers
);

stubModule(
    'features/videos/VideoInteraction.js',
    fakeVideoInteraction
);

const router =
    require('./VideoInteractionRoutes');

function buildApp() {
    const app = express();

    app.use(express.json());
    app.use(
        '/api/v1/video-interactions',
        router
    );

    return app;
}

let server;
let baseUrl;

before(async () => {
    const app = buildApp();

    await new Promise(
        (resolve, reject) => {
            server = app.listen(0, resolve);
            server.on('error', reject);
        }
    );

    baseUrl =
        `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve) =>
        server.close(resolve)
    );
});

beforeEach(() => {
    fakeUsers.current = {
        _id: 'student-1',
        name: 'Test Student',
        email: 'student@example.com',
        phone: '0000000000',
        status: 'active',
        classroom: '9',
        role: 'student'
    };

    fakeVideoInteraction.createCalls = [];
    fakeVideoInteraction.findOneCalls = [];
    fakeVideoInteraction.saveCalls = [];

    fakeUsers.xpIncrements = [];

    fakeVideoInteraction.interactions = [
        {
            _id: 'vi-1',
            studentId: 'student-1',
            eventType: 'click',
            videoTitle: 'Math lessons',
            VideoURL:
                'https://www.youtube.com/watch?v=abc123',
            videoId: 'abc123',
            subject: 'Math',
            score: 70,
            updatedAt: new Date(),
            durationSeconds: 0,
            xpAwarded: 0
        }
    ];
});

//the interaction the stubbed database holds (reseeded before each test)
const storedInteraction = () =>
    fakeVideoInteraction.interactions[0];

//pretend the last report on that interaction landed this many seconds
//ago, which is what lets watch time have grown since then
const reportedSecondsAgo = (seconds) => {
    storedInteraction().updatedAt = new Date(
        Date.now() - seconds * 1000
    );
};

const tokenFor = (id) =>
    jwt.sign(
        { id },
        process.env.JWT_SECRET
    );

const studentToken = () =>
    tokenFor('student-1');

function headers(token) {
    const result = {
        'Content-Type':
            'application/json'
    };

    if (token) {
        result.Authorization =
            `Bearer ${token}`;
    }

    return result;
}

async function requestJson(
    method,
    url,
    body,
    token
) {
    const response = await fetch(
        `${baseUrl}${url}`,
        {
            method,
            headers: headers(token),
            body:
                body === undefined
                    ? undefined
                    : JSON.stringify(body)
        }
    );

    const data =
        await response.json().catch(() =>
            null
        );

    return {
        status: response.status,
        data
    };
}

const postJson = (
    url,
    body,
    token
) =>
    requestJson(
        'POST',
        url,
        body,
        token
    );

const putJson = (
    url,
    body,
    token
) =>
    requestJson(
        'PUT',
        url,
        body,
        token
    );

const INTERACTIONS =
    '/api/v1/video-interactions';

//authorization ---------------------------------------------

test(
    'create requires an Authorization header',
    async () => {
        const result = await postJson(
            INTERACTIONS,
            {
                videoTitle: 'Math lessons',
                videoUrl:
                    'https://www.youtube.com/watch?v=abc123',
                videoId: 'abc123'
            },
            null
        );

        assert.equal(result.status, 401);
        assert.equal(
            result.data.message,
            'Authentication token is required'
        );
        assert.equal(
            fakeVideoInteraction.createCalls.length,
            0
        );
    }
);

test(
    'create rejects an invalid token',
    async () => {
        const result = await postJson(
            INTERACTIONS,
            {},
            'not-a-real-jwt'
        );

        assert.equal(result.status, 401);
        assert.equal(
            result.data.message,
            'Invalid or expired token'
        );
    }
);

test(
    'create rejects a token for a deleted user',
    async () => {
        fakeUsers.current = null;

        const result = await postJson(
            INTERACTIONS,
            {},
            studentToken()
        );

        assert.equal(result.status, 401);
        assert.equal(
            result.data.message,
            'User no longer exists'
        );
    }
);

test(
    'create rejects an inactive account',
    async () => {
        fakeUsers.current.status =
            'inactive';

        const result = await postJson(
            INTERACTIONS,
            {},
            studentToken()
        );

        assert.equal(result.status, 403);
        assert.equal(
            result.data.message,
            'Your account is inactive'
        );
    }
);

test(
    'create is forbidden for teachers',
    async () => {
        fakeUsers.current.role =
            'teacher';

        const result = await postJson(
            INTERACTIONS,
            {
                videoTitle: 'Math lessons',
                videoUrl:
                    'https://www.youtube.com/watch?v=abc123',
                videoId: 'abc123'
            },
            studentToken()
        );

        assert.equal(result.status, 403);
        assert.equal(
            result.data.message,
            "Role 'teacher' is not allowed to perform this action"
        );
    }
);

//create ----------------------------------------------------

test(
    'create records a click with defaults',
    async () => {
        const result = await postJson(
            INTERACTIONS,
            {
                videoTitle: 'Math lessons',
                videoUrl:
                    'https://www.youtube.com/watch?v=abc123',
                videoId: 'abc123',
                subject: 'Math',
                score: 70
            },
            studentToken()
        );

        assert.equal(result.status, 201);
        assert.equal(
            result.data.message,
            'Video interaction recorded'
        );

        const created =
            fakeVideoInteraction.createCalls[0];

        assert.equal(
            created.studentId,
            'student-1'
        );

        assert.equal(
            created.eventType,
            'click'
        );

        assert.equal(
            created.durationSeconds,
            0
        );

        //client field videoUrl is stored as VideoURL
        assert.equal(
            created.VideoURL,
            'https://www.youtube.com/watch?v=abc123'
        );

        assert.equal(
            created.videoId,
            'abc123'
        );
    }
);

test(
    'create keeps explicit event details and duration',
    async () => {
        const result = await postJson(
            INTERACTIONS,
            {
                videoTitle: 'Science lessons',
                videoUrl:
                    'https://www.youtube.com/watch?v=def456',
                videoId: 'def456',
                eventType: 'watch',
                subject: 'Science',
                score: 60,
                durationSeconds: 120
            },
            studentToken()
        );

        assert.equal(result.status, 201);

        const created =
            fakeVideoInteraction.createCalls[0];

        assert.equal(
            created.eventType,
            'watch'
        );

        assert.equal(
            created.subject,
            'Science'
        );

        assert.equal(
            created.score,
            60
        );

        assert.equal(
            created.durationSeconds,
            120
        );
    }
);

test(
    'create validates required fields',
    async () => {
        const result = await postJson(
            INTERACTIONS,
            {
                //missing videoTitle
                videoUrl:
                    'https://www.youtube.com/watch?v=abc123',
                videoId: 'abc123'
            },
            studentToken()
        );

        assert.equal(result.status, 400);
        assert.equal(
            result.data.message,
            'Student, video title, video URL, and video ID are required'
        );

        assert.equal(
            fakeVideoInteraction.createCalls.length,
            0
        );
    }
);

test(
    'create requires a subject and a score',
    async () => {
        const result = await postJson(
            INTERACTIONS,
            {
                videoTitle: 'Math lessons',
                videoUrl:
                    'https://www.youtube.com/watch?v=abc123',
                videoId: 'abc123'
            },
            studentToken()
        );

        assert.equal(result.status, 400);
        assert.equal(
            result.data.message,
            'Video subject and score are required'
        );

        assert.equal(
            fakeVideoInteraction.createCalls.length,
            0
        );
    }
);

test(
    'create rejects a non-numeric score',
    async () => {
        const result = await postJson(
            INTERACTIONS,
            {
                videoTitle: 'Math lessons',
                videoUrl:
                    'https://www.youtube.com/watch?v=abc123',
                videoId: 'abc123',
                subject: 'Math',
                score: 'not-a-number'
            },
            studentToken()
        );

        assert.equal(result.status, 400);
        assert.equal(
            result.data.message,
            'The video score must be a number'
        );

        assert.equal(
            fakeVideoInteraction.createCalls.length,
            0
        );
    }
);

test(
    'create rejects an unknown event type',
    async () => {
        const result = await postJson(
            INTERACTIONS,
            {
                videoTitle: 'Math lessons',
                videoUrl:
                    'https://www.youtube.com/watch?v=abc123',
                videoId: 'abc123',
                subject: 'Math',
                score: 70,
                eventType: 'skip'
            },
            studentToken()
        );

        assert.equal(result.status, 400);
        assert.ok(
            result.data.message.includes(
                'eventType must be one of'
            )
        );

        assert.equal(
            fakeVideoInteraction.createCalls.length,
            0
        );
    }
);

//update duration -------------------------------------------

test(
    'update duration is forbidden for teachers',
    async () => {
        fakeUsers.current.role =
            'teacher';

        const result = await putJson(
            `${INTERACTIONS}/vi-1/duration`,
            {
                durationSeconds: 120
            },
            studentToken()
        );

        assert.equal(result.status, 403);
        assert.equal(
            fakeVideoInteraction.findOneCalls.length,
            0
        );
    }
);

test(
    'update duration saves the rounded duration',
    async () => {
        //the previous report was a minute ago, so 43 seconds of watch
        //time is well within what the clock allows
        reportedSecondsAgo(60);

        const result = await putJson(
            `${INTERACTIONS}/vi-1/duration`,
            {
                durationSeconds: 42.6
            },
            studentToken()
        );

        assert.equal(result.status, 200);
        assert.equal(
            result.data.message,
            'Video duration updated'
        );

        //the lookup must scope to both the interaction id
        //and the logged-in student (ownership check)
        assert.deepEqual(
            fakeVideoInteraction.findOneCalls[0],
            {
                _id: 'vi-1',
                studentId: 'student-1'
            }
        );

        const saved =
            fakeVideoInteraction.saveCalls[0];

        assert.equal(
            saved.durationSeconds,
            43
        );

        //under a minute of watch time is worth no XP
        assert.equal(saved.xpAwarded, 0);
        assert.equal(
            fakeUsers.xpIncrements.length,
            0
        );
    }
);

test(
    'watch time awards XP for every full minute',
    async () => {
        //five minutes of real time passed before the report
        reportedSecondsAgo(300);

        const result = await putJson(
            `${INTERACTIONS}/vi-1/duration`,
            {
                durationSeconds: 300
            },
            studentToken()
        );

        assert.equal(result.status, 200);

        //5 full minutes at 10 XP each
        assert.equal(result.data.xpAwarded, 50);

        assert.equal(
            fakeVideoInteraction.saveCalls[0]
                .durationSeconds,
            300
        );

        assert.equal(
            fakeVideoInteraction.saveCalls[0]
                .xpAwarded,
            50
        );

        const increment =
            fakeUsers.xpIncrements[0];

        assert.equal(increment.id, 'student-1');

        assert.deepEqual(increment.update, {
            $inc: { xp: 50 }
        });
    }
);

test(
    're-reporting watch time never awards the same minute twice',
    async () => {
        reportedSecondsAgo(300);

        await putJson(
            `${INTERACTIONS}/vi-1/duration`,
            {
                durationSeconds: 300
            },
            studentToken()
        );

        //the follow-up report lands 30 seconds later
        reportedSecondsAgo(30);

        //330s is still only 5 full minutes
        const result = await putJson(
            `${INTERACTIONS}/vi-1/duration`,
            {
                durationSeconds: 330
            },
            studentToken()
        );

        assert.equal(result.status, 200);
        assert.equal(result.data.xpAwarded, 0);

        assert.equal(
            fakeUsers.xpIncrements.length,
            1
        );

        assert.equal(
            fakeVideoInteraction.saveCalls[1]
                .durationSeconds,
            330
        );
    }
);

test(
    'a report cannot claim more watch time than has really passed',
    async () => {
        //the interaction was reported on a moment ago
        reportedSecondsAgo(0);

        const result = await putJson(
            `${INTERACTIONS}/vi-1/duration`,
            {
                durationSeconds: 3600
            },
            studentToken()
        );

        assert.equal(result.status, 200);

        //an hour of watch time cannot be claimed seconds after the
        //click, so the stored total stays inside the grace period and
        //nothing is paid for it
        assert.equal(result.data.xpAwarded, 0);

        assert.ok(
            fakeVideoInteraction.saveCalls[0]
                .durationSeconds < 60,
            'the invented hour must be clamped'
        );

        assert.equal(
            fakeUsers.xpIncrements.length,
            0
        );
    }
);

test(
    'watch time cannot grow faster than playback',
    async () => {
        //only a minute of real time has passed
        reportedSecondsAgo(60);

        const result = await putJson(
            `${INTERACTIONS}/vi-1/duration`,
            {
                //ten minutes claimed in one minute of real time
                durationSeconds: 600
            },
            studentToken()
        );

        assert.equal(result.status, 200);

        const saved =
            fakeVideoInteraction.saveCalls[0]
                .durationSeconds;

        //a minute is worth at most two minutes of playback (2x speed)
        //plus the grace period
        assert.ok(
            saved >= 120 && saved <= 180,
            `stored ${saved}`
        );

        //two full minutes at 10 XP each
        assert.equal(result.data.xpAwarded, 20);
    }
);

test(
    'a smaller total lowers nothing and pays nothing',
    async () => {
        storedInteraction().durationSeconds = 300;
        storedInteraction().xpAwarded = 50;

        reportedSecondsAgo(10);

        const result = await putJson(
            `${INTERACTIONS}/vi-1/duration`,
            {
                durationSeconds: 120
            },
            studentToken()
        );

        assert.equal(result.status, 200);
        assert.equal(result.data.xpAwarded, 0);

        assert.equal(
            fakeVideoInteraction.saveCalls[0]
                .durationSeconds,
            300
        );

        assert.equal(
            fakeUsers.xpIncrements.length,
            0
        );
    }
);

test(
    'a seeded watch-time total cannot be cashed in as XP',
    async () => {
        //a crafted request stored a large watch time without any XP
        //having been paid for it
        storedInteraction().durationSeconds = 30000;
        storedInteraction().xpAwarded = 0;

        reportedSecondsAgo(5);

        const result = await putJson(
            `${INTERACTIONS}/vi-1/duration`,
            {
                durationSeconds: 30060
            },
            studentToken()
        );

        assert.equal(result.status, 200);

        //only the increase the clock allows since the last report can
        //pay out, so the seeded total is worth nothing
        assert.equal(result.data.xpAwarded, 0);

        assert.equal(
            fakeUsers.xpIncrements.length,
            0
        );
    }
);

test(
    'watch time per interaction is capped',
    async () => {
        //a whole day claimed since the interaction was created
        reportedSecondsAgo(24 * 60 * 60);

        const result = await putJson(
            `${INTERACTIONS}/vi-1/duration`,
            {
                durationSeconds:
                    10 * 24 * 60 * 60
            },
            studentToken()
        );

        assert.equal(result.status, 200);

        assert.equal(
            fakeVideoInteraction.saveCalls[0]
                .durationSeconds,
            12 * 60 * 60
        );
    }
);

test(
    'update duration validates the value',
    async () => {
        const invalidBodies = [
            { durationSeconds: 'abc' },
            { durationSeconds: -5 },
            { durationSeconds: '1.2.3' },
            {} //missing field becomes NaN
        ];

        for (const body of invalidBodies) {
            const result = await putJson(
                `${INTERACTIONS}/vi-1/duration`,
                body,
                studentToken()
            );

            assert.equal(
                result.status,
                400,
                `body ${JSON.stringify(body)}`
            );

            assert.equal(
                result.data.message,
                'A valid duration is required'
            );

            assert.equal(
                fakeVideoInteraction.findOneCalls.length,
                0
            );
        }
    }
);

test(
    'update duration returns 404 for an unknown interaction',
    async () => {
        fakeVideoInteraction.interactions = [];

        const result = await putJson(
            `${INTERACTIONS}/missing-id/duration`,
            {
                durationSeconds: 30
            },
            studentToken()
        );

        assert.equal(result.status, 404);
        assert.equal(
            result.data.message,
            'Video interaction not found'
        );
    }
);

test(
    'a student cannot update another student\'s interaction',
    async () => {
        //the interaction belongs to student-2
        fakeVideoInteraction.interactions = [
            {
                _id: 'vi-1',
                studentId: 'student-2',
                durationSeconds: 0,
                xpAwarded: 0
            }
        ];

        const result = await putJson(
            `${INTERACTIONS}/vi-1/duration`,
            {
                durationSeconds: 300
            },
            studentToken()
        );

        assert.equal(result.status, 404);

        //the controller scopes the lookup to the requester, so the
        //other student's record is never read or modified
        assert.equal(
            fakeVideoInteraction.findOneCalls[0]
                .studentId,
            'student-1'
        );

        assert.equal(
            fakeVideoInteraction.saveCalls.length,
            0
        );

        assert.equal(
            fakeUsers.xpIncrements.length,
            0
        );
    }
);
