//Tests that the throttles are attached to the routes they are meant to
//protect.
//
//shared/rateLimit.test.js proves a throttle works; this proves the routes
//use one. That is the part that fails silently -- a limiter that exists but
//was never mounted behaves exactly like no limiter at all, and nothing else
//in the suite would notice.
//
//The limits are read when rateLimit.js loads, so small ones are set before
//it is required. The models are stubbed because only the middleware in
//front of the controllers matters here: a request that reaches a controller
//is already past the throttle, and its answer is not the subject. Run with:
//npm test

process.env.AI_RATE_LIMIT = '2';
process.env.LOGIN_RATE_LIMIT = '2';

const {
    test,
    before,
    after
} = require('node:test');

const assert =
    require('node:assert/strict');

const path =
    require('node:path');

const jwt =
    require('jsonwebtoken');

process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    'rate-limit-wiring-secret';

const SERVER_ROOT =
    path.join(__dirname, '..');

function stubModule(relativeFile, value) {
    const resolved =
        require.resolve(
            path.join(SERVER_ROOT, relativeFile)
        );

    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports: value
    };
}

const STUDENT_ID =
    'aaaaaaaaaaaaaaaaaaaaaaaa';

const MATERIAL_ID =
    'dddddddddddddddddddddddd';

//only what protect() reads: a token has to resolve to an active student
stubModule('features/users/userModels.js', {
    async findById(id) {
        return String(id) === STUDENT_ID
            ? {
                _id: STUDENT_ID,
                name: 'Sam Student',
                status: 'active',
                role: 'student',
                classroom: '9'
            }
            : null;
    },

    //the login route asks for the password alongside the user; answering
    //null makes it a plain 401 rather than an unrelated crash
    findOne: () => ({
        select: () => Promise.resolve(null)
    })
});

//no lesson exists, so the AI controllers answer 404 once they are reached
stubModule('features/materials/LessonMaterial.js', {
    async findOne() {
        return null;
    }
});

//loaded after the stubs, so it wires the stubbed models
const app = require('../app');

const studentToken = () =>
    jwt.sign({ id: STUDENT_ID }, process.env.JWT_SECRET);

let server;
let baseUrl;

before(async () => {
    await new Promise((resolve, reject) => {
        server = app.listen(0, resolve);

        server.on('error', reject);
    });

    baseUrl =
        `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve) =>
        server.close(resolve)
    );
});

test('the lesson AI routes are throttled', async () => {
    const url =
        `${baseUrl}/api/v1/materials/${MATERIAL_ID}/summary`;

    const responses = [];

    for (let attempt = 0; attempt < 3; attempt++) {
        responses.push(
            await fetch(url, {
                method: 'POST',

                headers: {
                    Authorization:
                        `Bearer ${studentToken()}`
                }
            })
        );
    }

    //The first two get through to the controller (which has no such
    //lesson) and the third is refused by the throttle alone, which is what
    //proves the limiter is on the route.
    assert.notEqual(responses[0].status, 429);
    assert.notEqual(responses[1].status, 429);

    assert.equal(responses[2].status, 429);

    //and the refusal is JSON, like every other answer this API gives
    const body = await responses[2].json();

    assert.match(
        String(body.message),
        /too many requests/i
    );
});

test('login is throttled', async () => {
    const url = `${baseUrl}/api/v1/users/login`;

    const statuses = [];

    for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(url, {
            method: 'POST',

            headers: {
                'Content-Type': 'application/json'
            },

            body: JSON.stringify({
                email: 'nobody@example.com',
                password: 'not-the-password'
            })
        });

        statuses.push(response.status);
    }

    //a wrong password is a 401, and the third attempt never gets as far as
    //being checked -- which is the point: a password list is expensive for
    //us as well as for the attacker
    assert.equal(statuses[0], 401);
    assert.equal(statuses[1], 401);
    assert.equal(statuses[2], 429);
});
