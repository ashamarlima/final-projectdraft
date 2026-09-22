//Endpoint tests for the lesson AI assistant and lesson quizzes:
//   POST /api/v1/materials/:id/summary
//   POST /api/v1/materials/:id/ask
//   POST /api/v1/materials/:id/flashcards
//   POST /api/v1/quizzes            (a quiz built from a lesson)
//   POST /api/v1/quizzes/:id/submit (graded on the server, awards XP)
//
//The real Express app, its auth middleware, the materials/quiz controllers
//and the central error handler all run, against stubbed User,
//LessonMaterial, Chat and QuizAttempt models and a stubbed Gemini fetch. No
//database, API key or network access is needed. Run with: npm test

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
    'lesson-ai-test-secret';

//the assistant reads this lazily, so any value works; the Gemini fetch is
//stubbed below instead
process.env.GEMINI_API_KEY =
    process.env.GEMINI_API_KEY || 'test-key';

const SERVER_ROOT =
    path.join(__dirname, '..', '..');

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

const OTHER_STUDENT_ID =
    'bbbbbbbbbbbbbbbbbbbbbbbb';

const TEACHER_ID =
    'cccccccccccccccccccccccc';

const MATERIAL_ID =
    'dddddddddddddddddddddddd';

const OTHER_MATERIAL_ID =
    'eeeeeeeeeeeeeeeeeeeeeeee';

const NOTE_ID =
    'ffffffffffffffffffffffff';

const isObjectId = (value) =>
    /^[0-9a-fA-F]{24}$/.test(String(value));

//------------------------------------------------------------
//users
//------------------------------------------------------------

const baseUsers = {
    [STUDENT_ID]: {
        _id: STUDENT_ID,
        name: 'Sam Student',
        status: 'active',
        role: 'student',
        classroom: '9'
    },
    [OTHER_STUDENT_ID]: {
        _id: OTHER_STUDENT_ID,
        name: 'Ola Other',
        status: 'active',
        role: 'student',
        classroom: '10'
    },
    [TEACHER_ID]: {
        _id: TEACHER_ID,
        name: 'Tina Teacher',
        status: 'active',
        role: 'teacher',
        classroom: '9'
    }
};

const fakeUsers = {
    //XP is credited with a targeted $inc, so record each award
    xpIncrements: [],

    async findById(id) {
        return baseUsers[id] || null;
    },

    async findByIdAndUpdate(id, update) {
        this.xpIncrements.push({ id, update });

        return baseUsers[id] || null;
    }
};

stubModule('features/users/userModels.js', fakeUsers);

//------------------------------------------------------------
//LessonMaterial
//------------------------------------------------------------

const fakeMaterials = {
    materials: [],

    //reject malformed ids the way Mongoose would, and apply the grade
    //filter the controller adds for a student
    findOne(filter = {}) {
        if (
            filter._id !== undefined &&
            !isObjectId(filter._id)
        ) {
            const error = new Error(
                'Cast to ObjectId failed'
            );

            error.name = 'CastError';

            return Promise.reject(error);
        }

        const match =
            this.materials.find(
                (material) =>
                    String(material._id) ===
                        String(filter._id) &&
                    (filter.grade === undefined ||
                        String(material.grade) ===
                            String(filter.grade))
            ) || null;

        return Promise.resolve(match);
    }
};

stubModule(
    'features/materials/LessonMaterial.js',
    fakeMaterials
);

//------------------------------------------------------------
//Chat history
//------------------------------------------------------------

const fakeChat = {
    created: [],

    async create(payload) {
        this.created.push(payload);

        return payload;
    }
};

stubModule('features/chat/Chat.js', fakeChat);

//------------------------------------------------------------
//QuizAttempt
//------------------------------------------------------------

const fakeQuizAttempt = {
    attempts: [],
    createCalls: [],
    saveCalls: [],
    sequence: 0,

    async create(payload) {
        this.createCalls.push(payload);

        const attempt = {
            _id: `quiz-${++this.sequence}`,
            submittedAt: null,
            correct: null,
            xpAwarded: 0,
            ...payload
        };

        this.attachSave(attempt);
        this.attempts.push(attempt);

        return attempt;
    },

    attachSave(attempt) {
        attempt.save = async () => {
            this.saveCalls.push(attempt);

            return attempt;
        };
    },

    matches(query) {
        return this.attempts.filter((attempt) =>
            Object.entries(query).every(
                ([key, expected]) => {
                    const actual = attempt[key];

                    //the controllers only use $ne, and only against a
                    //value that means "everything except this"
                    if (
                        expected &&
                        typeof expected === 'object' &&
                        !Array.isArray(expected) &&
                        !(expected instanceof Date)
                    ) {
                        if ('$ne' in expected) {
                            return (
                                String(actual) !==
                                String(expected.$ne)
                            );
                        }

                        return false;
                    }

                    return (
                        String(actual) ===
                        String(expected)
                    );
                }
            )
        );
    },

    sorted(docs, spec) {
        const [key] = Object.keys(spec);

        const direction = spec[key] < 0 ? -1 : 1;

        return [...docs].sort((first, second) => {
            if (first[key] > second[key]) {
                return direction;
            }

            if (first[key] < second[key]) {
                return -direction;
            }

            return 0;
        });
    },

    findOne(query) {
        const matches = () => this.matches(query);

        return {
            sort: (spec) =>
                Promise.resolve(
                    this.sorted(matches(), spec)[0] ||
                        null
                ),

            then: (resolve, reject) =>
                Promise.resolve(
                    matches()[0] || null
                ).then(resolve, reject)
        };
    }
};

stubModule(
    'features/quizzes/QuizAttempt.js',
    fakeQuizAttempt
);

//------------------------------------------------------------
//Gemini stub
//------------------------------------------------------------

const originalFetch = globalThis.fetch;

let geminiText = 'A short lesson summary.';

async function stubFetch(url, options) {
    if (
        String(url).includes(
            'generativelanguage.googleapis.com'
        )
    ) {
        return {
            ok: true,
            status: 200,
            json: async () => ({
                candidates: [
                    {
                        content: {
                            parts: [{ text: geminiText }]
                        }
                    }
                ]
            })
        };
    }

    //the tests' own HTTP requests still reach the server
    return originalFetch(url, options);
}

const QUIZ_JSON = JSON.stringify([
    {
        question: 'Lesson question 1',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A'
    },
    {
        question: 'Lesson question 2',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'B'
    }
]);

//the real app, with the stubs above in place
const app = require('../../app');

//------------------------------------------------------------
//server lifecycle
//------------------------------------------------------------

let server;
let baseUrl;

before(async () => {
    globalThis.fetch = stubFetch;

    await new Promise((resolve, reject) => {
        server = app.listen(0, resolve);
        server.on('error', reject);
    });

    baseUrl =
        `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    globalThis.fetch = originalFetch;

    await new Promise((resolve) =>
        server.close(resolve)
    );
});

//------------------------------------------------------------
//fixtures and helpers
//------------------------------------------------------------

const MATERIALS = '/api/v1/materials';
const QUIZZES = '/api/v1/quizzes';

function seedLesson(overrides = {}) {
    const material = {
        _id: MATERIAL_ID,
        subject: 'Natural Sciences',
        grade: '9',
        unit: 1,
        lesson: 1,
        title: 'Photosynthesis',
        extractedText:
            'Photosynthesis turns light into energy.',
        hasText: true,
        ...overrides
    };

    fakeMaterials.materials = [material];

    return material;
}

beforeEach(() => {
    geminiText = 'A short lesson summary.';

    fakeMaterials.materials = [];
    fakeChat.created = [];
    fakeUsers.xpIncrements = [];

    fakeQuizAttempt.attempts = [];
    fakeQuizAttempt.createCalls = [];
    fakeQuizAttempt.saveCalls = [];
    fakeQuizAttempt.sequence = 0;

    seedLesson();
});

const tokenFor = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET);

const studentToken = () => tokenFor(STUDENT_ID);

async function request(method, url, body, token) {
    const headers = {};

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let payload;

    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';

        payload = JSON.stringify(body);
    }

    const response = await fetch(
        `${baseUrl}${url}`,
        { method, headers, body: payload }
    );

    const data =
        await response.json().catch(() => null);

    return { status: response.status, data };
}

const postJson = (url, body, token) =>
    request('POST', url, body, token);

//------------------------------------------------------------
//authorization
//------------------------------------------------------------

test('the lesson assistant requires a token', async () => {
    const result = await postJson(
        `${MATERIALS}/${MATERIAL_ID}/summary`,
        undefined,
        null
    );

    assert.equal(result.status, 401);
});

test('the lesson assistant is student-only', async () => {
    for (const path of [
        'summary',
        'ask',
        'flashcards'
    ]) {
        const result = await postJson(
            `${MATERIALS}/${MATERIAL_ID}/${path}`,
            path === 'ask'
                ? { question: 'Why?' }
                : undefined,
            tokenFor(TEACHER_ID)
        );

        assert.equal(result.status, 403);
    }
});

//------------------------------------------------------------
//grade scoping
//------------------------------------------------------------

test('a student cannot reach another grade lesson', async () => {
    seedLesson({
        _id: OTHER_MATERIAL_ID,
        grade: '10'
    });

    const summary = await postJson(
        `${MATERIALS}/${OTHER_MATERIAL_ID}/summary`,
        undefined,
        studentToken()
    );

    assert.equal(summary.status, 404);
    assert.equal(
        summary.data.message,
        'Lesson not found'
    );

    const quiz = await postJson(
        QUIZZES,
        { materialId: OTHER_MATERIAL_ID },
        studentToken()
    );

    assert.equal(quiz.status, 404);
});

test('a malformed lesson id is a 400', async () => {
    const result = await postJson(
        `${MATERIALS}/not-an-id/summary`,
        undefined,
        studentToken()
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'That lesson id is not valid'
    );
});

//------------------------------------------------------------
//lesson text
//------------------------------------------------------------

test('a lesson with no readable text cannot use the assistant', async () => {
    seedLesson({
        extractedText: '',
        hasText: false
    });

    const summary = await postJson(
        `${MATERIALS}/${MATERIAL_ID}/summary`,
        undefined,
        studentToken()
    );

    assert.equal(summary.status, 400);
    assert.equal(
        summary.data.message,
        'This lesson has no readable text for the AI assistant'
    );

    //...and no quiz can be built from it either
    const quiz = await postJson(
        QUIZZES,
        { materialId: MATERIAL_ID },
        studentToken()
    );

    assert.equal(quiz.status, 400);

    assert.equal(
        fakeQuizAttempt.createCalls.length,
        0
    );
});

//------------------------------------------------------------
//assistant endpoints
//------------------------------------------------------------

test('a summary is generated from the lesson', async () => {
    const result = await postJson(
        `${MATERIALS}/${MATERIAL_ID}/summary`,
        undefined,
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.summary, geminiText);
});

test('flashcards come back as question/answer pairs', async () => {
    geminiText = JSON.stringify([
        { question: 'What is photosynthesis?', answer: 'Turning light into energy.' }
    ]);

    const result = await postJson(
        `${MATERIALS}/${MATERIAL_ID}/flashcards`,
        undefined,
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.flashcards.length, 1);
    assert.equal(
        result.data.flashcards[0].question,
        'What is photosynthesis?'
    );
});

test('a question is answered and its history saved', async () => {
    geminiText = 'Plants use light to make food.';

    const result = await postJson(
        `${MATERIALS}/${MATERIAL_ID}/ask`,
        { question: 'How do plants eat?' },
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.answer, geminiText);
    assert.equal(result.data.materialId, MATERIAL_ID);

    assert.equal(fakeChat.created.length, 1);
    assert.equal(fakeChat.created[0].user, STUDENT_ID);
    assert.equal(
        fakeChat.created[0].question,
        'How do plants eat?'
    );
});

test('an empty question is rejected', async () => {
    const result = await postJson(
        `${MATERIALS}/${MATERIAL_ID}/ask`,
        { question: '   ' },
        studentToken()
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'A question is required'
    );

    assert.equal(fakeChat.created.length, 0);
});

//------------------------------------------------------------
//lesson quizzes
//------------------------------------------------------------

test('a quiz is built from a lesson and stores the answers server-side', async () => {
    geminiText = QUIZ_JSON;

    const result = await postJson(
        QUIZZES,
        { materialId: MATERIAL_ID },
        studentToken()
    );

    assert.equal(result.status, 201);

    const { attempt } = result.data;

    assert.equal(attempt.total, 2);
    assert.equal(attempt.materialTitle, 'Photosynthesis');

    //the answers stay on the server
    assert.ok(
        attempt.questions.every(
            (question) =>
                question.correctAnswer === undefined
        )
    );

    const stored = fakeQuizAttempt.createCalls[0];

    assert.equal(stored.user, STUDENT_ID);
    assert.equal(
        String(stored.material),
        MATERIAL_ID
    );

    assert.equal(
        stored.note,
        undefined
    );
});

test('submitting a lesson quiz awards XP for each correct answer', async () => {
    geminiText = QUIZ_JSON;

    await postJson(
        QUIZZES,
        { materialId: MATERIAL_ID },
        studentToken()
    );

    const result = await postJson(
        `${QUIZZES}/quiz-1/submit`,
        { answers: ['A', 'B'] },
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.correct, 2);
    assert.equal(result.data.xpAwarded, 20);

    assert.deepEqual(
        fakeUsers.xpIncrements[0].update,
        { $inc: { xp: 20 } }
    );
});

test('a note attempt never caps the XP a lesson quiz can earn', async () => {
    geminiText = QUIZ_JSON;

    await postJson(
        QUIZZES,
        { materialId: MATERIAL_ID },
        studentToken()
    );

    //a perfect earlier attempt on a *note* is a different source, so it
    //must not cap this lesson's quiz
    fakeQuizAttempt.attempts.push({
        _id: 'quiz-old-note',
        user: STUDENT_ID,
        note: NOTE_ID,
        questions: [],
        submittedAt: new Date('2026-01-01T00:00:00Z'),
        correct: 2,
        xpAwarded: 20
    });

    const result = await postJson(
        `${QUIZZES}/quiz-1/submit`,
        { answers: ['A', 'B'] },
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.xpAwarded, 20);
});

test('retaking the same lesson quiz only pays the difference', async () => {
    geminiText = QUIZ_JSON;

    await postJson(
        QUIZZES,
        { materialId: MATERIAL_ID },
        studentToken()
    );

    //an earlier attempt on the same lesson already paid the full 20
    fakeQuizAttempt.attempts.push({
        _id: 'quiz-old-lesson',
        user: STUDENT_ID,
        material: MATERIAL_ID,
        questions: [],
        submittedAt: new Date('2026-01-01T00:00:00Z'),
        correct: 2,
        xpAwarded: 20
    });

    const result = await postJson(
        `${QUIZZES}/quiz-1/submit`,
        { answers: ['A', 'B'] },
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.xpAwarded, 0);
    assert.equal(fakeUsers.xpIncrements.length, 0);
});
