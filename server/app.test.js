//Tests for app.js's own middleware: the security headers, and the two of
//helmet's defaults that had to be relaxed for this app to work.
//
//Only a route that answers is needed, and an unauthenticated GET
///users/me does that with a 401 -- so nothing is stubbed and no database is
//involved. Run with: npm test

const {
    test,
    before,
    after
} = require('node:test');

const assert =
    require('node:assert/strict');

//The content security policy reflects this, so it has to be set before
//app.js is loaded and reads it.
const CLIENT_ORIGIN = 'https://app.example.com';

process.env.CLIENT_URL = CLIENT_ORIGIN;

process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'app-test-secret';

const app = require('./app');

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

function get(path) {
    return fetch(`${baseUrl}${path}`);
}

test('every response carries the security headers', async () => {
    const response = await get('/api/v1/users/me');

    //the route needs a token, which is all this test needs it to do
    assert.equal(response.status, 401);

    assert.equal(
        response.headers.get('x-content-type-options'),
        'nosniff'
    );

    assert.ok(
        response.headers.get(
            'strict-transport-security'
        )
    );

    //helmet's default is 'same-origin', which would stop a client on
    //another origin reading any of these responses
    assert.equal(
        response.headers.get(
            'cross-origin-resource-policy'
        ),
        'cross-origin'
    );

    //Framing is decided in the policy below instead: X-Frame-Options
    //cannot name an origin (ALLOW-FROM is dead), so leaving it set at
    //'sameorigin' would block the configured client origin.
    assert.equal(
        response.headers.get('x-frame-options'),
        null
    );

    //Express advertises itself unless it is told not to
    assert.equal(
        response.headers.get('x-powered-by'),
        null
    );
});

test('a lesson PDF may be framed by the configured client origin', async () => {
    const response = await get('/api/v1/users/me');

    const policy =
        response.headers.get(
            'content-security-policy'
        ) || '';

    //The viewer shows a lesson by pointing an iframe at our own signed
    ///file url, and the client is allowed to sit on another origin.
    assert.match(
        policy,
        /frame-ancestors 'self' https:\/\/app\.example\.com/
    );

    //and the rest of helmet's defaults are still applied
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /object-src 'none'/);
});
