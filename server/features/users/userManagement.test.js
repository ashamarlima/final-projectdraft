//Endpoint tests for user management:
//   PUT /api/v1/users/:id          (update validation)
//   GET /api/v1/users              (pagination guards)
//   GET /api/v1/users/search/:term (pagination guards)
//
//The real routes, the real auth middleware and the real controllers run
//against a stubbed User model, so no database is needed. The stub mirrors
//the parts of the model the controllers rely on: schema.path(...) enums,
//findByIdAndUpdate (with the chained .select('-password')), and the
//chainable find().sort().skip().limit(). It also records what the
//controller asked for, which is how the pagination guards are asserted.
//
//Run with: npm test

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

process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    'user-management-test-secret';

const SERVER_ROOT =
    path.join(__dirname, '..', '..');

function stubModule(relativeFile, value) {
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

const ADMIN_ID =
    'aaaaaaaaaaaaaaaaaaaaaaaa';

const TEACHER_ID =
    'bbbbbbbbbbbbbbbbbbbbbbbb';

const adminUser = {
    _id: ADMIN_ID,
    name: 'System Admin',
    email: 'admin@example.com',
    phone: '0000000000',
    status: 'active',
    classroom: '9',
    role: 'admin',
    xp: 0
};

const teacherUser = {
    _id: TEACHER_ID,
    name: 'A Teacher',
    email: 'teacher@example.com',
    phone: '1111111111',
    status: 'active',
    classroom: '9',
    role: 'teacher',
    xp: 0
};

const usersById = {
    [ADMIN_ID]: adminUser,
    [TEACHER_ID]: teacherUser
};

const isObjectId = (value) =>
    /^[0-9a-fA-F]{24}$/.test(String(value));

//what the controller passed to the model, so the guards can be checked
const calls = {
    update: null,
    skip: null,
    limit: null
};

//the real model rejects an id it cannot cast, which is what the
//controller's CastError branch is for
function castError() {
    const error = new Error(
        `Cast to ObjectId failed for value "${'x'}"`
    );

    error.name = 'CastError';

    return error;
}

//a query object that is chainable the way the controllers use it and
//thenable, so `await` resolves it
function listQuery() {
    const query = {
        sort: () => query,

        skip: (value) => {
            calls.skip = value;

            return query;
        },

        limit: (value) => {
            calls.limit = value;

            return query;
        },

        then: (resolve, reject) =>
            Promise.resolve([]).then(
                resolve,
                reject
            )
    };

    return query;
}

const fakeUsers = {
    //mirrors the real model, because the controllers validate against
    //these enums
    schema: {
        path: (name) => ({
            enumValues:
                name === 'classroom'
                    ? ['12', '11', '10', '9']
                    : name === 'role'
                        ? [
                            'student',
                            'teacher',
                            'admin'
                        ]
                        : name === 'status'
                            ? [
                                'active',
                                'inactive'
                            ]
                            : []
        })
    },

    //the auth middleware loads the requester by id
    findById(id) {
        return Promise.resolve(
            usersById[String(id)] || null
        );
    },

    //only used for the duplicate email/phone lookups here
    findOne() {
        return Promise.resolve(null);
    },

    find() {
        return listQuery();
    },

    countDocuments() {
        return Promise.resolve(0);
    },

    findByIdAndUpdate(id, update) {
        if (!isObjectId(id)) {
            throw castError();
        }

        calls.update = update;

        return {
            select: () =>
                Promise.resolve({
                    ...usersById[String(id)],
                    ...update
                })
        };
    }
};

stubModule(
    'features/users/userModels.js',
    fakeUsers
);

//kept out of the way, like the other endpoint suites do
stubModule('features/users/Class.js', {});

//the real app, with the stub above in place
const app = require('../../app');

let server;
let baseUrl;

function tokenFor(id, role) {
    return jwt.sign(
        { id, role },
        process.env.JWT_SECRET
    );
}

const adminToken = () => tokenFor(ADMIN_ID);

async function putUser(id, body, token = adminToken()) {
    const response = await fetch(
        `${baseUrl}/api/v1/users/${id}`,
        {
            method: 'PUT',

            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },

            body: JSON.stringify(body)
        }
    );

    const data = await response
        .json()
        .catch(() => null);

    return {
        status: response.status,
        data
    };
}

async function getUsers(query = '') {
    const response = await fetch(
        `${baseUrl}/api/v1/users${query}`,
        {
            headers: {
                Authorization: `Bearer ${adminToken()}`
            }
        }
    );

    const data = await response
        .json()
        .catch(() => null);

    return {
        status: response.status,
        data
    };
}

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

beforeEach(() => {
    calls.update = null;
    calls.skip = null;
    calls.limit = null;
});

//update validation -----------------------------------------

test(
    'update rejects a classroom outside the schema enum',
    async () => {
        const result = await putUser(TEACHER_ID, {
            name: 'A Teacher',
            email: teacherUser.email,
            phone: teacherUser.phone,
            classroom: '8',
            role: 'teacher'
        });

        assert.equal(result.status, 400);

        assert.equal(
            result.data.message,
            'Classroom must be one of: 12, 11, 10, 9'
        );

        //the request never reached the database
        assert.equal(calls.update, null);
    }
);

test(
    'update rejects a role outside the schema enum',
    async () => {
        const result = await putUser(TEACHER_ID, {
            role: 'principal'
        });

        assert.equal(result.status, 400);

        assert.equal(
            result.data.message,
            'Role must be one of: student, teacher, admin'
        );

        assert.equal(calls.update, null);
    }
);

test(
    'update rejects a status outside the schema enum',
    async () => {
        const result = await putUser(TEACHER_ID, {
            status: 'suspended'
        });

        assert.equal(result.status, 400);

        assert.equal(
            result.data.message,
            'Status must be one of: active, inactive'
        );

        assert.equal(calls.update, null);
    }
);

test(
    'update rejects a required field sent empty',
    async () => {
        const result = await putUser(TEACHER_ID, {
            name: '   '
        });

        assert.equal(result.status, 400);

        assert.equal(
            result.data.message,
            'name cannot be empty'
        );

        assert.equal(calls.update, null);
    }
);

test(
    'update rejects a malformed user id as a client error',
    async () => {
        const result = await putUser('not-a-real-id', {
            name: 'A Teacher'
        });

        assert.equal(result.status, 400);

        assert.equal(
            result.data.message,
            'That user id is not valid'
        );
    }
);

test(
    'update accepts a valid change and forwards it',
    async () => {
        const result = await putUser(TEACHER_ID, {
            name: 'A Teacher',
            email: teacherUser.email,
            phone: teacherUser.phone,
            status: 'active',
            classroom: '10',
            role: 'teacher'
        });

        assert.equal(result.status, 200);

        assert.equal(
            result.data.message,
            'User updated successfully'
        );

        //the classroom survives the cast checks and reaches the model
        assert.equal(calls.update.classroom, '10');
        assert.equal(calls.update.role, 'teacher');
    }
);

test(
    'update leaves fields it was not given untouched',
    async () => {
        const result = await putUser(TEACHER_ID, {
            name: 'Renamed Teacher'
        });

        assert.equal(result.status, 200);

        assert.equal(
            calls.update.name,
            'Renamed Teacher'
        );

        //Mongoose drops undefined values from an update, so a partial
        //body cannot blank out the other fields
        assert.equal(
            calls.update.classroom,
            undefined
        );

        assert.equal(calls.update.role, undefined);
        assert.equal(calls.update.status, undefined);
    }
);

//pagination guards -----------------------------------------

test(
    'the user list caps the page size',
    async () => {
        const result = await getUsers(
            '?limit=1000000'
        );

        assert.equal(result.status, 200);
        assert.equal(calls.limit, 100);
        assert.equal(calls.skip, 0);
    }
);

test(
    'the user list defaults to one page of ten',
    async () => {
        const result = await getUsers();

        assert.equal(result.status, 200);
        assert.equal(calls.limit, 10);
        assert.equal(calls.skip, 0);
    }
);

test(
    'the user list refuses a negative page',
    async () => {
        const result = await getUsers('?page=-5');

        assert.equal(result.status, 200);

        //a negative skip would make the database reject the query
        assert.equal(calls.skip, 0);
        assert.equal(result.data.currentPage, 1);
    }
);

test(
    'the user list ignores a page that is not a number',
    async () => {
        const result = await getUsers(
            '?page=abc&limit=abc'
        );

        assert.equal(result.status, 200);
        assert.equal(calls.skip, 0);
        assert.equal(calls.limit, 10);
    }
);

test(
    'search caps the page size the same way',
    async () => {
        const response = await fetch(
            `${baseUrl}/api/v1/users/search/teacher?limit=5000&page=2`,
            {
                headers: {
                    Authorization: `Bearer ${adminToken()}`
                }
            }
        );

        const data = await response
            .json()
            .catch(() => null);

        assert.equal(response.status, 200);
        assert.equal(calls.limit, 100);

        //page 2 of 100 is a skip of 100, not 5000
        assert.equal(calls.skip, 100);
        assert.equal(data.currentPage, 2);
    }
);
