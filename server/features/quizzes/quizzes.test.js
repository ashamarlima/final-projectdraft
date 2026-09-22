//Endpoint tests for quiz attempts:
//   POST /api/v1/quizzes            (generate a quiz and store it)
//   POST /api/v1/quizzes/:id/submit (grade the answers, award XP)
//   GET  /api/v1/quizzes            (past results)
//
//The real Express app, its auth middleware and the controllers run
//against stubbed User/Note/QuizAttempt models and a stubbed Gemini fetch,
//so no database, API key or network access is needed. Run with: npm test

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

//make sure a JWT secret exists before the auth middleware runs
process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    'quizzes-test-secret';

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

const STUDENT_ID =
    'aaaaaaaaaaaaaaaaaaaaaaaa';

const OTHER_STUDENT_ID =
    'bbbbbbbbbbbbbbbbbbbbbbbb';

const NOTE_ID =
    'cccccccccccccccccccccccc';

const isObjectId = (value) =>
    /^[0-9a-fA-F]{24}$/.test(
        String(value)
    );

//------------------------------------------------------------
//model stubs
//------------------------------------------------------------

const fakeUsers = {
    current: null,

    //XP is credited with a targeted $inc, so record each award
    xpIncrements: [],

    findById(id) {
        const user = this.current;

        return Promise.resolve(
            user &&
                String(user._id) === String(id)
                ? user
                : null
        );
    },

    async findByIdAndUpdate(id, update) {
        this.xpIncrements.push({ id, update });

        return this.current;
    }
};

const fakeNote = {
    notes: [],

    //reject malformed ids the way Mongoose would, and scope by owner
    findOne(query) {
        if (!isObjectId(query._id)) {
            const error = new Error(
                'Cast to ObjectId failed'
            );

            error.name = 'CastError';

            return Promise.reject(error);
        }

        const match =
            this.notes.find(
                (note) =>
                    String(note._id) ===
                        String(query._id) &&
                    String(note.user) ===
                        String(query.user)
            ) || null;

        return Promise.resolve(match);
    }
};

//A small stand-in for the QuizAttempt model: just the query shapes the
//controller uses, in memory.
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

    //mimic a mongoose document: save() persists in place
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

                    //the controllers only use $ne, and only with a
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

        const direction =
            spec[key] < 0 ? -1 : 1;

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

    //findOne(query) and findOne(query).sort(spec) both resolve to a
    //single document, like the mongoose Query does
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
    },

    //find(query).sort(spec).populate('note', 'title')
    find(query) {
        const matches = () => this.matches(query);

        return {
            sort: (spec) => {
                const sorted = this.sorted(
                    matches(),
                    spec
                );

                return {
                    populate: () =>
                        Promise.resolve(
                            sorted.map((attempt) =>
                                this.populateNote(
                                    attempt
                                )
                            )
                        ),

                    then: (resolve, reject) =>
                        Promise.resolve(
                            sorted
                        ).then(resolve, reject)
                };
            }
        };
    },

    //swap the note id for the fields the history view reads
    populateNote(attempt) {
        const note = fakeNote.notes.find(
            (candidate) =>
                String(candidate._id) ===
                String(attempt.note)
        );

        return {
            ...attempt,

            note: note
                ? {
                    _id: note._id,
                    title: note.title
                }
                : null
        };
    }
};

stubModule(
    'features/users/userModels.js',
    fakeUsers
);

stubModule('features/notes/Note.js', fakeNote);

stubModule(
    'features/quizzes/QuizAttempt.js',
    fakeQuizAttempt
);

//the real app: real routes, middleware and error handling
const app = require('../../app');

//------------------------------------------------------------
//Gemini stub
//------------------------------------------------------------

const originalFetch = globalThis.fetch;

let geminiResponse;

async function stubFetch(url, options) {
    if (
        String(url).includes(
            'generativelanguage.googleapis.com'
        )
    ) {
        return {
            ok: geminiResponse.ok,
            status: geminiResponse.status,
            json: async () =>
                geminiResponse.jsonData
        };
    }

    //the tests' own HTTP requests still reach the server
    return originalFetch(url, options);
}

const okText = (text) => ({
    ok: true,
    status: 200,
    jsonData: {
        candidates: [
            {
                content: {
                    parts: [{ text }]
                }
            }
        ]
    }
});

//two questions, whose answers the server must keep to itself
const QUIZ_JSON = JSON.stringify([
    {
        question: 'Question 1',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A'
    },
    {
        question: 'Question 2',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'B'
    }
]);

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
//fixtures
//------------------------------------------------------------

function seedStudent() {
    fakeUsers.current = {
        _id: STUDENT_ID,
        name: 'Sam Student',
        status: 'active',
        role: 'student'
    };
}

function seedNote(overrides = {}) {
    const note = {
        _id: NOTE_ID,
        user: STUDENT_ID,
        title: 'Biology',
        extractedText:
            'Photosynthesis turns light into energy.',
        ...overrides
    };

    fakeNote.notes = [note];

    return note;
}

//a stored quiz, unanswered unless overridden
function seedAttempt(overrides = {}) {
    const attempt = {
        _id: 'quiz-1',
        user: STUDENT_ID,
        note: NOTE_ID,

        questions: [
            {
                question: 'Question 1',
                options: ['A', 'B', 'C', 'D'],
                correctAnswer: 'A'
            },
            {
                question: 'Question 2',
                options: ['A', 'B', 'C', 'D'],
                correctAnswer: 'B'
            }
        ],

        submittedAt: null,
        correct: null,
        xpAwarded: 0,

        ...overrides
    };

    fakeQuizAttempt.attachSave(attempt);

    fakeQuizAttempt.attempts = [attempt];

    return attempt;
}

beforeEach(() => {
    seedStudent();
    seedNote();

    fakeQuizAttempt.attempts = [];
    fakeQuizAttempt.createCalls = [];
    fakeQuizAttempt.saveCalls = [];
    fakeQuizAttempt.sequence = 0;

    fakeUsers.xpIncrements = [];

    process.env.GEMINI_API_KEY = 'test-key';

    geminiResponse = okText(QUIZ_JSON);
});

//------------------------------------------------------------
//helpers
//------------------------------------------------------------

const tokenFor = (id) =>
    jwt.sign(
        { id },
        process.env.JWT_SECRET
    );

const studentToken = () =>
    tokenFor(STUDENT_ID);

async function request(method, url, body, token) {
    const headers = {};

    if (token) {
        headers.Authorization =
            `Bearer ${token}`;
    }

    let payload;

    if (body !== undefined) {
        headers['Content-Type'] =
            'application/json';

        payload = JSON.stringify(body);
    }

    const response = await fetch(
        `${baseUrl}${url}`,
        {
            method,
            headers,
            body: payload
        }
    );

    const data =
        await response.json().catch(() =>
            null
        );

    return { status: response.status, data };
}

const postJson = (url, body, token) =>
    request('POST', url, body, token);

const getJson = (url, token) =>
    request('GET', url, undefined, token);

const QUIZZES = '/api/v1/quizzes';

const submit = (id, answers, token = studentToken()) =>
    postJson(
        `${QUIZZES}/${id}/submit`,
        { answers },
        token
    );

//------------------------------------------------------------
//authorization
//------------------------------------------------------------

test('generating a quiz requires a token', async () => {
    const result = await postJson(
        QUIZZES,
        { noteId: NOTE_ID },
        null
    );

    assert.equal(result.status, 401);
});

test('quizzes are student-only', async () => {
    fakeUsers.current.role = 'teacher';

    const list = await getJson(
        QUIZZES,
        studentToken()
    );

    assert.equal(list.status, 403);

    const create = await postJson(
        QUIZZES,
        { noteId: NOTE_ID },
        studentToken()
    );

    assert.equal(create.status, 403);
});

//------------------------------------------------------------
//generating
//------------------------------------------------------------

test('generating a quiz requires a noteId', async () => {
    const result = await postJson(
        QUIZZES,
        {},
        studentToken()
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'noteId is required'
    );

    assert.equal(
        fakeQuizAttempt.createCalls.length,
        0
    );
});

test('generating a quiz rejects a malformed noteId', async () => {
    const result = await postJson(
        QUIZZES,
        { noteId: 'not-an-id' },
        studentToken()
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'That note id is not valid'
    );
});

test('a quiz cannot be built from another student\'s note', async () => {
    seedNote({ user: OTHER_STUDENT_ID });

    const result = await postJson(
        QUIZZES,
        { noteId: NOTE_ID },
        studentToken()
    );

    assert.equal(result.status, 404);
    assert.equal(
        result.data.message,
        'Note not found'
    );

    assert.equal(
        fakeQuizAttempt.createCalls.length,
        0
    );
});

test('the generated quiz never exposes the correct answers', async () => {
    const result = await postJson(
        QUIZZES,
        { noteId: NOTE_ID },
        studentToken()
    );

    assert.equal(result.status, 201);

    const { attempt } = result.data;

    assert.equal(attempt.total, 2);
    assert.equal(attempt.noteTitle, 'Biology');

    const [first] = attempt.questions;

    assert.equal(first.question, 'Question 1');
    assert.equal(first.options.length, 4);

    //the answers stay on the server: a browser that could read them
    //could post a perfect score without answering anything
    assert.equal(first.correctAnswer, undefined);

    assert.ok(
        attempt.questions.every(
            (question) =>
                question.correctAnswer === undefined
        )
    );
});

test('the generated quiz stores the answers server-side', async () => {
    await postJson(
        QUIZZES,
        { noteId: NOTE_ID },
        studentToken()
    );

    const stored =
        fakeQuizAttempt.createCalls[0];

    assert.equal(stored.user, STUDENT_ID);
    assert.equal(String(stored.note), NOTE_ID);
    assert.equal(stored.questions.length, 2);
    assert.equal(
        stored.questions[0].correctAnswer,
        'A'
    );
    assert.equal(
        stored.questions[1].correctAnswer,
        'B'
    );
});

//------------------------------------------------------------
//grading
//------------------------------------------------------------

test('the server grades the answers and ignores a claimed score', async () => {
    seedAttempt();

    //one right, one wrong, plus a score the client invented
    const result = await postJson(
        `${QUIZZES}/quiz-1/submit`,
        {
            answers: ['A', 'C'],
            correct: 99,
            total: 2
        },
        studentToken()
    );

    assert.equal(result.status, 200);

    //the graded value, not the 99 that was sent
    assert.equal(result.data.correct, 1);
    assert.equal(result.data.total, 2);
    assert.equal(result.data.xpAwarded, 10);

    assert.equal(
        result.data.results[0].correct,
        true
    );

    assert.equal(
        result.data.results[0].correctAnswer,
        'A'
    );

    assert.equal(
        result.data.results[1].correct,
        false
    );

    assert.equal(
        fakeQuizAttempt.saveCalls[0].correct,
        1
    );
});

test('a perfect attempt awards XP per correct answer', async () => {
    seedAttempt();

    const result = await submit('quiz-1', [
        'A',
        'B'
    ]);

    assert.equal(result.status, 200);
    assert.equal(result.data.correct, 2);
    assert.equal(result.data.xpAwarded, 20);

    assert.equal(
        fakeQuizAttempt.saveCalls[0].xpAwarded,
        20
    );

    const increment =
        fakeUsers.xpIncrements[0];

    assert.equal(increment.id, STUDENT_ID);

    assert.deepEqual(increment.update, {
        $inc: { xp: 20 }
    });
});

test('an unanswered question is simply wrong', async () => {
    seedAttempt();

    const result = await postJson(
        `${QUIZZES}/quiz-1/submit`,
        { answers: ['A'] },
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.correct, 1);
    assert.equal(result.data.results[1].given, null);
    assert.equal(result.data.results[1].correct, false);
});

test('retaking a quiz never pays the same XP twice', async () => {
    seedAttempt();

    //an earlier perfect attempt on the same note already paid 20
    fakeQuizAttempt.attempts.push({
        _id: 'quiz-old',
        user: STUDENT_ID,
        note: NOTE_ID,
        questions: [],
        submittedAt: new Date('2026-01-01T00:00:00Z'),
        correct: 2,
        xpAwarded: 20
    });

    const result = await submit('quiz-1', [
        'A',
        'B'
    ]);

    assert.equal(result.status, 200);
    assert.equal(result.data.correct, 2);
    assert.equal(result.data.xpAwarded, 0);

    //the attempt is still recorded, it just earns nothing
    assert.equal(
        fakeQuizAttempt.saveCalls[0].xpAwarded,
        20
    );

    assert.equal(
        fakeUsers.xpIncrements.length,
        0
    );
});

test('a better retake pays only the difference', async () => {
    seedAttempt();

    fakeQuizAttempt.attempts.push({
        _id: 'quiz-old',
        user: STUDENT_ID,
        note: NOTE_ID,
        questions: [],
        submittedAt: new Date('2026-01-01T00:00:00Z'),
        correct: 1,
        xpAwarded: 10
    });

    const result = await submit('quiz-1', [
        'A',
        'B'
    ]);

    assert.equal(result.data.xpAwarded, 10);

    assert.deepEqual(
        fakeUsers.xpIncrements[0].update,
        { $inc: { xp: 10 } }
    );
});

test('another note\'s result does not cap this one', async () => {
    seedAttempt();

    //a different note, so it has no bearing on this quiz
    fakeQuizAttempt.attempts.push({
        _id: 'quiz-other-note',
        user: STUDENT_ID,
        note: 'dddddddddddddddddddddddd',
        questions: [],
        submittedAt: new Date('2026-01-01T00:00:00Z'),
        correct: 2,
        xpAwarded: 20
    });

    const result = await submit('quiz-1', [
        'A',
        'B'
    ]);

    assert.equal(result.data.xpAwarded, 20);
});

test('the same quiz cannot be submitted twice', async () => {
    seedAttempt({
        submittedAt: new Date('2026-01-01T00:00:00Z'),
        correct: 2,
        xpAwarded: 20
    });

    const result = await submit('quiz-1', [
        'A',
        'B'
    ]);

    assert.equal(result.status, 409);
    assert.equal(
        result.data.message,
        'That quiz has already been submitted'
    );

    assert.equal(
        fakeUsers.xpIncrements.length,
        0
    );
});

test('submitting requires an answers array', async () => {
    seedAttempt();

    const result = await postJson(
        `${QUIZZES}/quiz-1/submit`,
        { answers: 'A,B' },
        studentToken()
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'An array of answers is required'
    );

    assert.equal(
        fakeQuizAttempt.saveCalls.length,
        0
    );
});

test('a student cannot submit another student\'s quiz', async () => {
    seedAttempt({ user: OTHER_STUDENT_ID });

    const result = await submit('quiz-1', [
        'A',
        'B'
    ]);

    assert.equal(result.status, 404);
    assert.equal(
        result.data.message,
        'Quiz not found'
    );

    assert.equal(
        fakeQuizAttempt.saveCalls.length,
        0
    );

    assert.equal(
        fakeUsers.xpIncrements.length,
        0
    );
});

test('submitting an unknown quiz is a 404', async () => {
    const result = await submit('missing', [
        'A'
    ]);

    assert.equal(result.status, 404);
});

//------------------------------------------------------------
//history
//------------------------------------------------------------

test('history lists only the student\'s own graded attempts', async () => {
    fakeQuizAttempt.attempts = [
        {
            _id: 'quiz-new',
            user: STUDENT_ID,
            note: NOTE_ID,
            questions: [{}, {}],
            submittedAt: new Date('2026-03-01T00:00:00Z'),
            correct: 2,
            xpAwarded: 20
        },
        {
            _id: 'quiz-old',
            user: STUDENT_ID,
            note: NOTE_ID,
            questions: [{}],
            submittedAt: new Date('2026-02-01T00:00:00Z'),
            correct: 0,
            xpAwarded: 0
        },
        {
            _id: 'quiz-pending',
            user: STUDENT_ID,
            note: NOTE_ID,
            questions: [{}],
            submittedAt: null,
            correct: null,
            xpAwarded: 0
        },
        {
            _id: 'quiz-theirs',
            user: OTHER_STUDENT_ID,
            note: NOTE_ID,
            questions: [{}],
            submittedAt: new Date('2026-04-01T00:00:00Z'),
            correct: 1,
            xpAwarded: 10
        }
    ];

    const result = await getJson(
        QUIZZES,
        studentToken()
    );

    assert.equal(result.status, 200);

    //the other student's attempt and the unanswered one are absent
    assert.equal(result.data.attempts.length, 2);

    const [newest, oldest] = result.data.attempts;

    assert.equal(newest._id, 'quiz-new');
    assert.equal(newest.noteTitle, 'Biology');
    assert.equal(newest.correct, 2);
    assert.equal(newest.total, 2);
    assert.equal(newest.xpAwarded, 20);

    assert.equal(oldest._id, 'quiz-old');
    assert.equal(oldest.total, 1);
});

test('history requires a token', async () => {
    const result = await getJson(QUIZZES, null);

    assert.equal(result.status, 401);
});

//------------------------------------------------------------
//AI failure handling
//------------------------------------------------------------

test('an upstream AI failure is reported as 502', async () => {
    geminiResponse = {
        ok: false,
        status: 429,
        jsonData: {
            error: { message: 'quota exceeded' }
        }
    };

    const result = await postJson(
        QUIZZES,
        { noteId: NOTE_ID },
        studentToken()
    );

    assert.equal(result.status, 502);
    assert.equal(result.data.error, 'quota exceeded');

    assert.equal(
        fakeQuizAttempt.createCalls.length,
        0
    );
});

test('a missing API key keeps its 500 status', async () => {
    const saved = process.env.GEMINI_API_KEY;

    delete process.env.GEMINI_API_KEY;

    try {
        const result = await postJson(
            QUIZZES,
            { noteId: NOTE_ID },
            studentToken()
        );

        assert.equal(result.status, 500);
        assert.equal(
            result.data.error,
            'GEMINI_API_KEY is missing from the .env file'
        );
    } finally {
        process.env.GEMINI_API_KEY = saved;
    }
});
