//Endpoint tests for the login cookie (POST /api/v1/users/login and
//POST /api/v1/users/logout).
//
//The real routes, the real auth middleware and the real bcrypt hashing
//run against a stubbed User model, so no database is needed. Run with:
//npm test

const {
    test,
    before,
    after
} = require('node:test');

const assert =
    require('node:assert/strict');

const path =
    require('node:path');

const express =
    require('express');

const cookieParser =
    require('cookie-parser');

const jwt =
    require('jsonwebtoken');

const bcrypt =
    require('bcryptjs');

process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    'login-auth-test-secret';

//make sure the cookie attributes do not depend on the machine running
//the suite
delete process.env.NODE_ENV;
delete process.env.JWT_EXPIRES_IN;

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

const ACTIVE_ID =
    'aaaaaaaaaaaaaaaaaaaaaaaa';

const INACTIVE_ID =
    'bbbbbbbbbbbbbbbbbbbbbbbb';

const PASSWORD = 'correct-horse-battery';

const activeUser = {
    _id: ACTIVE_ID,
    name: 'System Admin',
    email: 'admin@example.com',
    phone: '0000000000',
    status: 'active',
    classroom: '9',
    role: 'admin',
    Math: null,
    Literature: null,
    Science: null,
    xp: 150,
    password: ''
};

const inactiveUser = {
    ...activeUser,
    _id: INACTIVE_ID,
    email: 'inactive@example.com',
    status: 'inactive'
};

const usersById = {
    [ACTIVE_ID]: activeUser,
    [INACTIVE_ID]: inactiveUser
};

//the login query is `User.findOne(...).select('+password')`
function loginQuery(user) {
    return {
        select: () =>
            Promise.resolve(user)
    };
}

const fakeUsers = {
    findOne(filter) {
        const byEmail = {
            [activeUser.email]:
                activeUser,

            [inactiveUser.email]:
                inactiveUser
        };

        return loginQuery(
            byEmail[filter.email] || null
        );
    },

    findById(id) {
        return Promise.resolve(
            usersById[String(id)] || null
        );
    }
};

stubModule(
    'features/users/userModels.js',
    fakeUsers
);

//kept out of the way, like the other endpoint suites do
stubModule('features/users/Class.js', {});

const router =
    require('./userRoutes');

function buildApp() {
    const app = express();

    app.use(express.json());
    app.use(cookieParser());

    app.use(
        '/api/v1/users',
        router
    );

    return app;
}

let server;
let baseUrl;

before(async () => {
    //one real hash, so bcrypt.compare is genuinely exercised
    activeUser.password =
        await bcrypt.hash(PASSWORD, 12);

    inactiveUser.password =
        activeUser.password;

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

//the response's Set-Cookie header, and the value to send back as a
//Cookie header
function setCookieHeader(response) {
    return (
        response.headers.get('set-cookie') || ''
    );
}

function cookieValue(response) {
    return (
        setCookieHeader(response).split(';')[0] ||
        ''
    );
}

async function login(
    body = {
        email: activeUser.email,
        password: PASSWORD
    }
) {
    const response = await fetch(
        `${baseUrl}/api/v1/users/login`,
        {
            method: 'POST',

            headers: {
                'Content-Type':
                    'application/json'
            },

            body: JSON.stringify(body)
        }
    );

    return {
        status: response.status,
        data: await response
            .json()
            .catch(() => null),
        response
    };
}

async function getMe(headers = {}) {
    const response = await fetch(
        `${baseUrl}/api/v1/users/me`,
        { headers }
    );

    return {
        status: response.status,
        data: await response
            .json()
            .catch(() => null)
    };
}

//login -----------------------------------------------------

test(
    'login sets an httpOnly session cookie and returns no token in the body',
    async () => {
        const result = await login();

        assert.equal(result.status, 200);
        assert.equal(
            result.data.user.email,
            activeUser.email
        );

        //the level is still derived from XP on the way out
        assert.equal(result.data.user.level, 2);
        assert.equal(result.data.user.xp, 150);

        //a token in the body would defeat the whole point of the
        //httpOnly cookie
        assert.equal(result.data.token, undefined);

        const setCookie =
            setCookieHeader(result.response);

        assert.match(setCookie, /^token=/);
        assert.match(setCookie, /HttpOnly/i);
        assert.match(setCookie, /SameSite/i);
        assert.match(setCookie, /Path=\//i);

        //the cookie and the token inside it expire together (1d)
        assert.match(setCookie, /Max-Age=86400/i);
    }
);

test(
    'COOKIE_SAME_SITE=none marks the cookie SameSite=None and Secure',
    async () => {
        const previous =
            process.env.COOKIE_SAME_SITE;

        process.env.COOKIE_SAME_SITE = 'none';

        try {
            const result = await login();

            const setCookie =
                setCookieHeader(result.response);

            assert.match(
                setCookie,
                /SameSite=None/i
            );

            //browsers drop a SameSite=None cookie that is not Secure
            assert.match(setCookie, /Secure/i);

        } finally {
            if (previous === undefined) {
                delete process.env
                    .COOKIE_SAME_SITE;
            } else {
                process.env.COOKIE_SAME_SITE =
                    previous;
            }
        }
    }
);

test(
    'login rejects a wrong password without setting a cookie',
    async () => {
        const result = await login({
            email: activeUser.email,
            password: 'not-the-password'
        });

        assert.equal(result.status, 401);
        assert.equal(
            result.data.message,
            'Invalid email or password'
        );

        assert.equal(
            setCookieHeader(result.response),
            ''
        );
    }
);

test(
    'login does not reveal whether the email exists',
    async () => {
        const result = await login({
            email: 'nobody@example.com',
            password: PASSWORD
        });

        assert.equal(result.status, 401);
        assert.equal(
            result.data.message,
            'Invalid email or password'
        );
    }
);

test(
    'login rejects an inactive account without setting a cookie',
    async () => {
        const result = await login({
            email: inactiveUser.email,
            password: PASSWORD
        });

        assert.equal(result.status, 403);
        assert.equal(
            result.data.message,
            'Your account is inactive'
        );

        assert.equal(
            setCookieHeader(result.response),
            ''
        );
    }
);

test(
    'login requires an email and a password',
    async () => {
        const result = await login({
            email: activeUser.email
        });

        assert.equal(result.status, 400);
        assert.equal(
            result.data.message,
            'Email and password are required'
        );
    }
);

//session ---------------------------------------------------

test(
    'the session cookie authenticates a request with no Authorization header',
    async () => {
        const signIn = await login();

        const result = await getMe({
            Cookie: cookieValue(signIn.response)
        });

        assert.equal(result.status, 200);
        assert.equal(
            result.data.user.email,
            activeUser.email
        );
    }
);

test(
    'a request with neither a cookie nor an Authorization header is rejected',
    async () => {
        const result = await getMe();

        assert.equal(result.status, 401);
        assert.equal(
            result.data.message,
            'Authentication token is required'
        );
    }
);

test(
    'a tampered cookie is rejected',
    async () => {
        const signIn = await login();

        const [name] =
            cookieValue(signIn.response).split('=');

        const result = await getMe({
            Cookie: `${name}=not.a.real.token`
        });

        assert.equal(result.status, 401);
        assert.equal(
            result.data.message,
            'Invalid or expired token'
        );
    }
);

test(
    'the Authorization header still works for non-browser clients',
    async () => {
        //the cookie is httpOnly, so a script client cannot borrow it:
        //it signs its own token the same way the login route does
        const token = jwt.sign(
            { id: ACTIVE_ID },
            process.env.JWT_SECRET
        );

        const result = await getMe({
            Authorization: `Bearer ${token}`
        });

        assert.equal(result.status, 200);
        assert.equal(
            result.data.user.email,
            activeUser.email
        );
    }
);

//logout ----------------------------------------------------

test(
    'logout clears the session cookie',
    async () => {
        const signIn = await login();

        const response = await fetch(
            `${baseUrl}/api/v1/users/logout`,
            {
                method: 'POST',

                headers: {
                    Cookie: cookieValue(
                        signIn.response
                    )
                }
            }
        );

        const data = await response
            .json()
            .catch(() => null);

        assert.equal(response.status, 200);
        assert.equal(
            data.message,
            'Logged out successfully'
        );

        const setCookie =
            setCookieHeader(response);

        //an empty value with an expiry in the past is how a
        //cookie is deleted
        assert.match(setCookie, /^token=;/);
        assert.match(
            setCookie,
            /Expires=Thu, 01 Jan 1970/i
        );

        assert.match(setCookie, /HttpOnly/i);
    }
);

test(
    'logout works without a session, so an expired cookie can be cleared',
    async () => {
        const response = await fetch(
            `${baseUrl}/api/v1/users/logout`,
            { method: 'POST' }
        );

        assert.equal(response.status, 200);

        assert.match(
            setCookieHeader(response),
            /^token=;/
        );
    }
);
