//Tests for the request throttles in shared/rateLimit.js.
//
//The limits are read when the module loads, so this file sets small ones
//before requiring it. Each test file runs in its own process, which is
//also why the throttle state here cannot leak into the other suites.
//
//The throttle itself is the subject, so a tiny app stands in for the real
//routes: no database and no user model are involved. Run with: npm test

process.env.LOGIN_RATE_LIMIT = '3';
process.env.AI_RATE_LIMIT = '2';

//make sure the machine running the suite cannot change the outcome
delete process.env.RATE_LIMIT_DISABLED;

const {
    test,
    before,
    after
} = require('node:test');

const assert =
    require('node:assert/strict');

const express =
    require('express');

const {
    loginLimiter,
    aiLimiter
} = require('./rateLimit');

//The AI routes are mounted behind protect() in the real app, and the
//throttle keys on the user it leaves behind. This stands in for that
//middleware, so the limiter sees the same shape it does in production.
function fakeProtect(req, res, next) {
    req.user = { _id: req.headers['x-user'] };

    next();
}

function buildApp() {
    const app = express();

    app.post(
        '/login',
        loginLimiter,
        (req, res) => res.json({ ok: true })
    );

    app.post(
        '/ai',
        fakeProtect,
        aiLimiter,
        (req, res) => res.json({ ok: true })
    );

    return app;
}

let server;
let baseUrl;

before(async () => {
    const app = buildApp();

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

async function post(
    path,
    headers = {}
) {
    const response = await fetch(
        `${baseUrl}${path}`,
        { method: 'POST', headers }
    );

    return {
        status: response.status,
        data: await response
            .json()
            .catch(() => null)
    };
}

//A throttle that has been switched off must let everything through, so it
//is checked first: the login budget below is deliberately used up.
test('a disabled throttle lets every request through', async () => {
    process.env.RATE_LIMIT_DISABLED = 'true';

    try {
        for (
            let attempt = 0;
            attempt < 5;
            attempt++
        ) {
            const result = await post('/login');

            assert.equal(
                result.status,
                200,
                'a disabled throttle still answered ' +
                    `${result.status} on attempt ${attempt + 1}`
            );
        }
    } finally {
        delete process.env.RATE_LIMIT_DISABLED;
    }
});

test('login is throttled once the budget is spent', async () => {
    //the limit this file set is 3
    for (let attempt = 0; attempt < 3; attempt++) {
        const result = await post('/login');

        assert.equal(result.status, 200);
    }

    const throttled = await post('/login');

    assert.equal(throttled.status, 429);

    //the app answers JSON everywhere, so a throttle has to as well
    assert.match(
        String(throttled.data?.message),
        /too many requests/i
    );
});

test('the AI budget is counted per student', async () => {
    const first = { 'x-user': 'student-one' };
    const second = { 'x-user': 'student-two' };

    //the limit this file set is 2, spent by the first student alone
    assert.equal(
        (await post('/ai', first)).status,
        200
    );

    assert.equal(
        (await post('/ai', first)).status,
        200
    );

    assert.equal(
        (await post('/ai', first)).status,
        429
    );

    //a second student has their own budget: counting per address would
    //have locked this one out too, which is what a shared computer room
    //must not suffer
    assert.equal(
        (await post('/ai', second)).status,
        200
    );
});
