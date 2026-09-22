//Endpoint tests for XP and the grade-level leaderboard:
//   PUT /api/v1/users/:id/grades   (grade XP)
//   GET /api/v1/users/leaderboard  (ranking)
//
//The real Express routes and JWT auth middleware run against a stubbed
//User model, so no database is needed. Run with: npm test

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

process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    'xp-leaderboard-test-secret';

const SERVER_ROOT =
    path.join(__dirname, '..', '..');

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

//real 24-hex ObjectIds, matching what the app stores
const STUDENT_ID =
    'aaaaaaaaaaaaaaaaaaaaaaaa';

const CLASSMATE_ID =
    'bbbbbbbbbbbbbbbbbbbbbbbb';

const TOP_ID =
    'cccccccccccccccccccccccc';

const OTHER_GRADE_ID =
    'dddddddddddddddddddddddd';

const TEACHER_ID =
    'eeeeeeeeeeeeeeeeeeeeeeee';

//the current student's grades are worth 70 + 60 + 80 = 210 XP
const makeUsers = () => [
    {
        _id: STUDENT_ID,
        name: 'Sam Student',
        role: 'student',
        status: 'active',
        classroom: '9',
        xp: 50,
        Math: 70,
        Literature: 60,
        Science: 80
    },
    {
        _id: CLASSMATE_ID,
        name: 'Cara Classmate',
        role: 'student',
        status: 'active',
        classroom: '9',
        xp: 250
    },
    {
        _id: TOP_ID,
        name: 'Tara Top',
        role: 'student',
        status: 'active',
        classroom: '9',
        xp: 900
    },
    {
        _id: OTHER_GRADE_ID,
        name: 'Owen Other',
        role: 'student',
        status: 'active',
        classroom: '10',
        xp: 5000
    },
    {
        _id: TEACHER_ID,
        name: 'Tina Teacher',
        role: 'teacher',
        status: 'active',
        classroom: '9',
        xp: 0
    }
];

//support the small slice of the filter language the app uses
function matchesFilter(user, filter) {
    return Object.entries(filter).every(
        ([key, value]) => {
            if (
                key === 'xp' &&
                value &&
                typeof value === 'object'
            ) {
                return typeof value.$gt ===
                    'number'
                    ? (user.xp || 0) > value.$gt
                    : true;
            }

            return (
                String(user[key]) ===
                String(value)
            );
        }
    );
}

const fakeUsers = {
    users: makeUsers(),
    saved: [],

    findById(id) {
        const user = this.users.find(
            (entry) =>
                String(entry._id) ===
                String(id)
        );

        if (!user) {
            return Promise.resolve(null);
        }

        //mimic a mongoose document
        user.save = async () => {
            this.saved.push(user);

            return user;
        };

        return Promise.resolve(user);
    },

    find(filter = {}) {
        const matches = this.users.filter(
            (user) =>
                matchesFilter(user, filter)
        );

        const query = {
            select: () => query,

            sort: () => {
                matches.sort(
                    (first, second) =>
                        (second.xp || 0) -
                            (first.xp || 0) ||
                        first.name.localeCompare(
                            second.name
                        )
                );

                return Promise.resolve(matches);
            }
        };

        return query;
    },

    countDocuments(filter = {}) {
        return Promise.resolve(
            this.users.filter((user) =>
                matchesFilter(user, filter)
            ).length
        );
    }
};

stubModule(
    'features/users/userModels.js',
    fakeUsers
);

const router =
    require('./userRoutes');

function buildApp() {
    const app = express();

    app.use(express.json());
    app.use(
        '/api/v1/users',
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
    fakeUsers.users = makeUsers();
    fakeUsers.saved = [];
});

const tokenFor = (id) =>
    jwt.sign(
        { id },
        process.env.JWT_SECRET
    );

const studentToken = () =>
    tokenFor(STUDENT_ID);

async function requestJson(
    method,
    url,
    body,
    token
) {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (token) {
        headers.Authorization =
            `Bearer ${token}`;
    }

    const response = await fetch(
        `${baseUrl}${url}`,
        {
            method,
            headers,
            body:
                body === undefined
                    ? undefined
                    : JSON.stringify(body)
        }
    );

    return {
        status: response.status,
        data: await response
            .json()
            .catch(() => null)
    };
}

const getLeaderboard = (token) =>
    requestJson(
        'GET',
        '/api/v1/users/leaderboard',
        undefined,
        token
    );

const putGrades = (id, grades, token) =>
    requestJson(
        'PUT',
        `/api/v1/users/${id}/grades`,
        grades,
        token
    );

//------------------------------------------------------------
//leaderboard
//------------------------------------------------------------

test(
    'the leaderboard requires an Authorization header',
    async () => {
        const result = await getLeaderboard(null);

        assert.equal(result.status, 401);
    }
);

test(
    'the leaderboard is student-only',
    async () => {
        const result = await getLeaderboard(
            tokenFor(TEACHER_ID)
        );

        assert.equal(result.status, 403);
    }
);

test(
    'the leaderboard ranks the requester grade by XP',
    async () => {
        const result = await getLeaderboard(
            studentToken()
        );

        assert.equal(result.status, 200);
        assert.equal(result.data.classroom, '9');

        const entries = result.data.leaderboard;

        //highest XP first, and only students in grade 9
        assert.deepEqual(
            entries.map((entry) => entry.name),
            [
                'Tara Top',
                'Cara Classmate',
                'Sam Student'
            ]
        );

        assert.deepEqual(
            entries.map((entry) => entry.rank),
            [1, 2, 3]
        );

        assert.deepEqual(
            entries.map((entry) => entry.xp),
            [900, 250, 50]
        );

        //a student from another grade must not appear
        assert.ok(
            !entries.some(
                (entry) =>
                    entry.name === 'Owen Other'
            )
        );

        //teachers are not ranked either
        assert.ok(
            !entries.some(
                (entry) =>
                    entry.name === 'Tina Teacher'
            )
        );
    }
);

test(
    'the leaderboard marks the requester and gives their level',
    async () => {
        const result = await getLeaderboard(
            studentToken()
        );

        const entries = result.data.leaderboard;

        const mine = entries.filter(
            (entry) => entry.isCurrentUser
        );

        assert.equal(mine.length, 1);
        assert.equal(mine[0].name, 'Sam Student');

        //levels are derived from XP (100 XP per level)
        assert.equal(mine[0].level, 1);

        const top = entries.find(
            (entry) => entry.name === 'Tara Top'
        );

        assert.equal(top.level, 10);
    }
);

//------------------------------------------------------------
//grade XP
//------------------------------------------------------------

test(
    'raising a grade awards the increase in XP',
    async () => {
        //Math goes from 70 to 90, so the grades are worth 20 more
        const result = await putGrades(
            STUDENT_ID,
            { Math: 90 },
            tokenFor(TEACHER_ID)
        );

        assert.equal(
            result.status,
            200,
            JSON.stringify(result.data)
        );

        assert.equal(result.data.xpGained, 20);

        //50 XP already earned, plus the 20 from the improvement
        assert.equal(result.data.student.xp, 70);

        assert.equal(fakeUsers.saved.length, 1);
        assert.equal(fakeUsers.saved[0].xp, 70);
        assert.equal(fakeUsers.saved[0].Math, 90);
    }
);

test(
    're-saving the same grades awards nothing',
    async () => {
        const result = await putGrades(
            STUDENT_ID,
            {
                Math: 70,
                Literature: 60,
                Science: 80
            },
            tokenFor(TEACHER_ID)
        );

        assert.equal(result.status, 200);
        assert.equal(result.data.xpGained, 0);
        assert.equal(result.data.student.xp, 50);

        assert.equal(fakeUsers.saved[0].xp, 50);
    }
);

test(
    'lowering a grade never takes XP away',
    async () => {
        const result = await putGrades(
            STUDENT_ID,
            { Math: 40 },
            tokenFor(TEACHER_ID)
        );

        assert.equal(result.status, 200);
        assert.equal(result.data.xpGained, 0);
        assert.equal(result.data.student.xp, 50);
    }
);
