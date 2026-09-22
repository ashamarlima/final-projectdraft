//Endpoint tests for class creation (POST /api/v1/users/classes).
//
//The real Express route and JWT auth middleware run against stubbed
//User and Class models, so no database is needed. Run with: npm test

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
    'class-management-test-secret';

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

//real 24-hex ObjectIds, because the controller rejects
//malformed ids before querying the database
const ADMIN_ID =
    'aaaaaaaaaaaaaaaaaaaaaaaa';

const TEACHER_ID =
    'bbbbbbbbbbbbbbbbbbbbbbbb';

const STUDENT_ID =
    'cccccccccccccccccccccccc';

//well formed but not present in the "database"
const MISSING_ID =
    'dddddddddddddddddddddddd';

const baseUsers = {
    [ADMIN_ID]: {
        _id: ADMIN_ID,
        name: 'System Admin',
        status: 'active',
        role: 'admin'
    },
    [TEACHER_ID]: {
        _id: TEACHER_ID,
        name: 'Tina Teacher',
        status: 'active',
        role: 'teacher'
    },
    [STUDENT_ID]: {
        _id: STUDENT_ID,
        name: 'Sam Student',
        status: 'active',
        role: 'student'
    }
};

const fakeUsers = {
    findById(id) {
        return Promise.resolve(
            baseUsers[id] || null
        );
    }
};

const fakeClassModel = {
    createCalls: [],

    async create(payload) {
        this.createCalls.push(payload);

        return {
            _id: 'class-1',
            ...payload
        };
    }
};

stubModule(
    'features/users/userModels.js',
    fakeUsers
);

stubModule(
    'features/users/Class.js',
    fakeClassModel
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
    fakeClassModel.createCalls = [];
});

const tokenFor = (id) =>
    jwt.sign(
        { id },
        process.env.JWT_SECRET
    );

const adminToken = () =>
    tokenFor(ADMIN_ID);

async function createClass(
    body,
    token = adminToken()
) {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (token) {
        headers.Authorization =
            `Bearer ${token}`;
    }

    const response = await fetch(
        `${baseUrl}/api/v1/users/classes`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
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

const validBody = () => ({
    name: 'Class 9A',
    grade: '9',
    teacher: TEACHER_ID
});

//authorization ---------------------------------------------

test(
    'create class requires an Authorization header',
    async () => {
        const result = await createClass(
            validBody(),
            null
        );

        assert.equal(result.status, 401);
        assert.equal(
            result.data.message,
            'Authentication token is required'
        );

        assert.equal(
            fakeClassModel.createCalls.length,
            0
        );
    }
);

test(
    'create class is forbidden for teachers',
    async () => {
        const result = await createClass(
            validBody(),
            tokenFor(TEACHER_ID)
        );

        assert.equal(result.status, 403);
        assert.equal(
            result.data.message,
            "Role 'teacher' is not allowed to perform this action"
        );

        assert.equal(
            fakeClassModel.createCalls.length,
            0
        );
    }
);

//validation ------------------------------------------------

test(
    'create class requires name, grade and teacher',
    async () => {
        const result = await createClass({
            grade: '9',
            teacher: TEACHER_ID
        });

        assert.equal(result.status, 400);
        assert.equal(
            result.data.message,
            'Please provide name, grade, and teacher'
        );

        assert.equal(
            fakeClassModel.createCalls.length,
            0
        );
    }
);

test(
    'create class rejects a malformed teacher id',
    async () => {
        const result = await createClass({
            ...validBody(),
            teacher: 'not-an-object-id'
        });

        assert.equal(result.status, 400);
        assert.equal(
            result.data.message,
            'The assigned teacher id is not valid'
        );

        assert.equal(
            fakeClassModel.createCalls.length,
            0
        );
    }
);

test(
    'create class returns 404 when the teacher does not exist',
    async () => {
        const result = await createClass({
            ...validBody(),
            teacher: MISSING_ID
        });

        assert.equal(result.status, 404);
        assert.equal(
            result.data.message,
            'Teacher not found'
        );

        assert.equal(
            fakeClassModel.createCalls.length,
            0
        );
    }
);

test(
    'create class rejects an assigned user who is not a teacher',
    async () => {
        const result = await createClass({
            ...validBody(),
            teacher: STUDENT_ID
        });

        assert.equal(result.status, 400);
        assert.equal(
            result.data.message,
            'The assigned user must have the teacher role'
        );

        assert.equal(
            fakeClassModel.createCalls.length,
            0
        );
    }
);

//success ---------------------------------------------------

test(
    'create class stores a class for a valid teacher',
    async () => {
        const result = await createClass(
            validBody()
        );

        assert.equal(result.status, 201);
        assert.equal(
            result.data.message,
            'Class created successfully'
        );

        const created =
            fakeClassModel.createCalls[0];

        assert.deepEqual(created, {
            name: 'Class 9A',
            grade: '9',
            teacher: TEACHER_ID
        });
    }
);
