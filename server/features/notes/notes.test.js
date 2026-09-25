//Endpoint tests for the notes study assistant:
//   POST /api/v1/notes/upload, GET /api/v1/notes
//   POST /api/v1/notes-ai/{summary,ask,flashcards,quiz}
//
//The real Express app (including its error handler and the JWT auth
//middleware) runs against stubbed User/Note/Chat models, and the
//Gemini HTTP call is replaced by a stub fetch, so no database, API
//key or network access is needed. Run with: npm test

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
    'notes-test-secret';

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

const OTHER_NOTE_ID =
    'dddddddddddddddddddddddd';

const NOTE_TEXT =
    'Photosynthesis turns light into energy.';

const isObjectId = (value) =>
    /^[0-9a-fA-F]{24}$/.test(
        String(value)
    );

//------------------------------------------------------------
//model stubs
//------------------------------------------------------------

const fakeUsers = {
    current: null,

    findById(id) {
        const user = this.current;

        return Promise.resolve(
            user &&
                String(user._id) === String(id)
                ? user
                : null
        );
    }
};

const fakeNote = {
    notes: [],
    createCalls: [],

    async create(payload) {
        this.createCalls.push(payload);

        return {
            _id: NOTE_ID,
            createdAt: new Date(
                '2026-01-01T00:00:00.000Z'
            ),
            ...payload
        };
    },

    //Note.find({ user }).sort({ createdAt: -1 })
    find(query) {
        const matches = this.notes.filter(
            (note) =>
                String(note.user) ===
                String(query.user)
        );

        return {
            sort: () =>
                Promise.resolve(matches)
        };
    },

    //reject malformed ids the way Mongoose would
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

const fakeChat = {
    createCalls: [],

    async create(payload) {
        this.createCalls.push(payload);

        return {
            _id: 'chat-1',
            ...payload
        };
    }
};

stubModule(
    'features/users/userModels.js',
    fakeUsers
);

stubModule('features/notes/Note.js', fakeNote);

stubModule('features/chat/Chat.js', fakeChat);

//the real app: real routes, middleware and error handling
const app = require('../../app');

//------------------------------------------------------------
//Gemini stub
//------------------------------------------------------------

const originalFetch = globalThis.fetch;

let geminiResponse;
let geminiRequests = [];

async function stubFetch(url, options) {
    if (
        String(url).includes(
            'generativelanguage.googleapis.com'
        )
    ) {
        geminiRequests.push({ url, options });

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
        extractedText: NOTE_TEXT,
        createdAt: new Date(
            '2026-01-01T00:00:00.000Z'
        ),
        ...overrides
    };

    fakeNote.notes = [note];

    return note;
}

beforeEach(() => {
    seedStudent();
    seedNote();

    process.env.GEMINI_API_KEY = 'test-key';

    fakeNote.createCalls = [];
    fakeChat.createCalls = [];

    geminiRequests = [];

    geminiResponse = okText('Response text');
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

const NOTES = '/api/v1/notes';
const NOTES_AI = '/api/v1/notes-ai';

const geminiPrompt = () =>
    JSON.parse(
        geminiRequests[0].options.body
    ).contents[0].parts[0].text;

//------------------------------------------------------------
//authorization
//------------------------------------------------------------

test('upload requires an Authorization header', async () => {
    const response = await fetch(
        `${baseUrl}${NOTES}/upload`,
        { method: 'POST' }
    );

    assert.equal(response.status, 401);
});

test('listing notes requires an Authorization header', async () => {
    const result = await getJson(NOTES, null);

    assert.equal(result.status, 401);
    assert.equal(
        result.data.message,
        'Authentication token is required'
    );
});

test('the notes assistant is student-only', async () => {
    fakeUsers.current.role = 'teacher';

    const list = await getJson(
        NOTES,
        tokenFor(STUDENT_ID)
    );

    assert.equal(list.status, 403);

    const summary = await postJson(
        `${NOTES_AI}/summary`,
        { noteId: NOTE_ID },
        tokenFor(STUDENT_ID)
    );

    assert.equal(summary.status, 403);
});

//------------------------------------------------------------
//upload
//------------------------------------------------------------

function textUpload(text, { title, filename } = {}) {
    const form = new FormData();

    if (title !== undefined) {
        form.append('title', title);
    }

    form.append(
        'file',
        new Blob([Buffer.from(text)], {
            type: 'text/plain'
        }),
        filename || 'note.txt'
    );

    return form;
}

async function upload(form, token = studentToken()) {
    const headers = {};

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    //let fetch set the multipart boundary itself
    const response = await fetch(
        `${baseUrl}${NOTES}/upload`,
        {
            method: 'POST',
            headers,
            body: form
        }
    );

    return {
        status: response.status,
        data: await response
            .json()
            .catch(() => null)
    };
}

test('upload extracts text and stores the note', async () => {
    seedNote();

    const result = await upload(
        textUpload(NOTE_TEXT, {
            title: 'Cell Biology'
        })
    );

    assert.equal(result.status, 201);
    assert.equal(
        result.data.message,
        'Note uploaded successfully'
    );

    assert.equal(
        result.data.note.title,
        'Cell Biology'
    );

    //the list response never includes the full text
    assert.equal(
        result.data.note.extractedText,
        undefined
    );

    const stored = fakeNote.createCalls[0];

    assert.equal(stored.user, STUDENT_ID);
    assert.equal(stored.title, 'Cell Biology');
    assert.equal(stored.extractedText, NOTE_TEXT);
});

test('upload falls back to the file name as the title', async () => {
    const result = await upload(
        textUpload(NOTE_TEXT, {
            filename: 'chapter-3.txt'
        })
    );

    assert.equal(result.status, 201);
    assert.equal(
        fakeNote.createCalls[0].title,
        'chapter-3.txt'
    );
});

test('upload rejects an empty file', async () => {
    const result = await upload(
        textUpload('', { title: 'Empty' })
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'No readable text could be extracted from that file'
    );

    assert.equal(fakeNote.createCalls.length, 0);
});

test('upload rejects a missing file', async () => {
    const form = new FormData();

    form.append('title', 'No file');

    const result = await upload(form);

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'Please upload a PDF, image or plain text file'
    );
});

test('upload rejects a file type it does not accept at all', async () => {
    const form = new FormData();

    form.append(
        'file',
        new Blob(
            [Buffer.from('an archive, of some sort')],
            { type: 'application/zip' }
        ),
        'notes.zip'
    );

    const result = await upload(form);

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'Only PDF, plain text and image files are supported'
    );

    assert.equal(fakeNote.createCalls.length, 0);
});

test('upload rejects a file that only claims to be an image', async () => {
    //The browser reports image/png, so the filter lets it through. It has
    //to be rejected on its bytes rather than decoded as if it were text,
    //which would store rubbish as the note.
    const form = new FormData();

    form.append(
        'file',
        new Blob([Buffer.from('png data')], {
            type: 'image/png'
        }),
        'picture.png'
    );

    const result = await upload(form);

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'That image could not be read. It may be corrupt, or renamed from another format.'
    );

    assert.equal(fakeNote.createCalls.length, 0);
});

test(
    'ask rejects an empty noteId instead of answering without it',
    async () => {
        //a caller that meant to send a note and lost the id must not be
        //quietly answered from general knowledge
        const result = await request(
            'POST',
            '/api/v1/notes-ai/ask',
            {
                question: 'What is photosynthesis?',
                noteId: ''
            },
            studentToken()
        );

        assert.equal(result.status, 400);

        assert.equal(
            result.data.message,
            'That note id is not valid'
        );

        //and no model call was made at all
        assert.equal(geminiRequests.length, 0);
    }
);

//------------------------------------------------------------
//an uploaded image is read by the vision model
//------------------------------------------------------------

//a real 2x2 PNG, so the image branch is exercised on actual bytes
const PNG_BYTES = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
    'base64'
);

const TRANSCRIBED_TEXT =
    'Mitosis: prophase, metaphase, anaphase, telophase.';

test('upload reads an image with the vision model', async () => {
    geminiResponse = okText(
        TRANSCRIBED_TEXT
    );

    const form = new FormData();

    form.append(
        'title',
        'Handwritten biology notes'
    );

    form.append(
        'file',
        new Blob([PNG_BYTES], {
            type: 'image/png'
        }),
        'page.png'
    );

    const result = await upload(form);

    assert.equal(result.status, 201);

    //the note holds the transcription, which is what the assistant then
    //answers from
    assert.equal(
        result.data.note.preview,
        TRANSCRIBED_TEXT
    );

    assert.equal(
        fakeNote.createCalls[0].extractedText,
        TRANSCRIBED_TEXT
    );

    assert.equal(
        fakeNote.createCalls[0].title,
        'Handwritten biology notes'
    );

    //the image travelled with the prompt, as a JPEG the model accepts
    assert.equal(geminiRequests.length, 1);

    const body = JSON.parse(
        geminiRequests[0].options.body
    );

    const parts = body.contents[0].parts;

    const imagePart = parts.find(
        (part) => part.inlineData
    );

    assert.equal(
        imagePart.inlineData.mimeType,
        'image/jpeg'
    );

    assert.ok(imagePart.inlineData.data.length > 0);

    //and the instruction to transcribe travelled as the text part
    assert.ok(
        parts.some((part) =>
            String(part.text || '').includes(
                'Transcribe this page'
            )
        )
    );
});

test(
    'a failed vision read is reported rather than stored as an empty note',
    async () => {
        //unlike a lesson material, a note is only its text: storing one
        //with nothing in it would be useless, so this fails loudly
        geminiResponse = {
            ok: false,
            status: 429,
            jsonData: {
                error: {
                    message: 'quota exceeded'
                }
            }
        };

        const form = new FormData();

        form.append(
            'file',
            new Blob([PNG_BYTES], {
                type: 'image/png'
            }),
            'page.png'
        );

        const result = await upload(form);

        assert.equal(result.status, 502);

        assert.equal(
            result.data.message,
            'The AI assistant could not read that image'
        );

        assert.equal(fakeNote.createCalls.length, 0);
    }
);

//------------------------------------------------------------
//pdf parsing failures
//------------------------------------------------------------

function pdfUpload(bytes, filename = 'note.pdf') {
    const form = new FormData();

    form.append(
        'file',
        new Blob([Buffer.from(bytes)], {
            type: 'application/pdf'
        }),
        filename
    );

    return form;
}

test('upload reports a corrupt or renamed PDF clearly', async () => {
    const result = await upload(
        pdfUpload('%PDF-1.4 this is not really a pdf')
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'That file is not a valid PDF. It may be corrupt, or renamed from another format.'
    );

    //the parser failed, so nothing is stored
    assert.equal(fakeNote.createCalls.length, 0);
});

//build a minimal single-page PDF so the real pdf-parse path is used
function buildPdf(contentStream) {
    const bodies = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
            '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        null,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [];

    for (let i = 0; i < bodies.length; i++) {
        offsets[i] = Buffer.byteLength(pdf, 'latin1');

        if (i === 3) {
            pdf +=
                '4 0 obj\n' +
                `<< /Length ${Buffer.byteLength(contentStream, 'latin1')} >>\n` +
                'stream\n' +
                contentStream +
                '\nendstream\nendobj\n';
        } else {
            pdf += `${i + 1} 0 obj\n${bodies[i]}\nendobj\n`;
        }
    }

    const xref = Buffer.byteLength(pdf, 'latin1');

    pdf += 'xref\n0 6\n0000000000 65535 f \n';

    for (let i = 0; i < 5; i++) {
        pdf +=
            String(offsets[i]).padStart(10, '0') +
            ' 00000 n \n';
    }

    pdf +=
        'trailer\n<< /Size 6 /Root 1 0 R >>\n' +
        `startxref\n${xref}\n%%EOF\n`;

    return Buffer.from(pdf, 'latin1');
}

test('upload extracts text from a real PDF without page markers', async () => {
    const pdf = buildPdf(
        'BT /F1 24 Tf 72 700 Td (Cell Biology) Tj ET'
    );

    const result = await upload(pdfUpload(pdf, 'biology.pdf'));

    assert.equal(result.status, 201);

    const stored = fakeNote.createCalls[0];

    assert.ok(stored.extractedText.includes('Cell Biology'));

    //the pdf-parse page separator must not be stored as note text
    assert.ok(!stored.extractedText.includes('-- 1 of'));
});

test('upload rejects an image-only PDF as unreadable', async () => {
    const result = await upload(
        pdfUpload(buildPdf(''), 'scan.pdf')
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'No readable text could be extracted from that file'
    );

    assert.equal(fakeNote.createCalls.length, 0);
});

//------------------------------------------------------------
//listing
//------------------------------------------------------------

test('listing returns only the student\'s own notes', async () => {
    fakeNote.notes = [
        {
            _id: NOTE_ID,
            user: STUDENT_ID,
            title: 'Mine',
            extractedText: NOTE_TEXT,
            createdAt: new Date(
                '2026-02-01T00:00:00.000Z'
            )
        },
        {
            _id: OTHER_NOTE_ID,
            user: OTHER_STUDENT_ID,
            title: 'Theirs',
            extractedText: 'secret',
            createdAt: new Date(
                '2026-03-01T00:00:00.000Z'
            )
        }
    ];

    const result = await getJson(
        NOTES,
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.notes.length, 1);

    const [note] = result.data.notes;

    assert.equal(note.title, 'Mine');
    assert.equal(note.characters, NOTE_TEXT.length);
    assert.equal(note.preview, NOTE_TEXT);

    //full text stays on the server
    assert.equal(note.extractedText, undefined);
});

//------------------------------------------------------------
//single note (/notes/:id)
//------------------------------------------------------------

test('a note can be fetched by id', async () => {
    const result = await getJson(
        `${NOTES}/${NOTE_ID}`,
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.note._id, NOTE_ID);
    assert.equal(result.data.note.title, 'Biology');

    //only the preview is exposed
    assert.equal(
        result.data.note.extractedText,
        undefined
    );
});

test('another student\'s note is not readable by id', async () => {
    seedNote({ user: OTHER_STUDENT_ID });

    const result = await getJson(
        `${NOTES}/${NOTE_ID}`,
        studentToken()
    );

    assert.equal(result.status, 404);
    assert.equal(
        result.data.message,
        'Note not found'
    );
});

test('fetching a note with a malformed id is a 400', async () => {
    const result = await getJson(
        `${NOTES}/not-an-id`,
        studentToken()
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'That note id is not valid'
    );
});

test('fetching a note requires a token', async () => {
    const result = await getJson(
        `${NOTES}/${NOTE_ID}`,
        null
    );

    assert.equal(result.status, 401);
});

//------------------------------------------------------------
//summary
//------------------------------------------------------------

test('summary requires a noteId', async () => {
    const result = await postJson(
        `${NOTES_AI}/summary`,
        {},
        studentToken()
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'noteId is required'
    );

    assert.equal(geminiRequests.length, 0);
});

test('summary rejects a malformed noteId', async () => {
    const result = await postJson(
        `${NOTES_AI}/summary`,
        { noteId: 'not-an-id' },
        studentToken()
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'That note id is not valid'
    );
});

test('summary cannot read another student\'s note', async () => {
    seedNote({ user: OTHER_STUDENT_ID });

    const result = await postJson(
        `${NOTES_AI}/summary`,
        { noteId: NOTE_ID },
        studentToken()
    );

    assert.equal(result.status, 404);
    assert.equal(
        result.data.message,
        'Note not found'
    );

    assert.equal(geminiRequests.length, 0);
});

test('summary returns the generated bullet points', async () => {
    geminiResponse = okText(
        '- Light is absorbed\n- Energy is stored'
    );

    const result = await postJson(
        `${NOTES_AI}/summary`,
        { noteId: NOTE_ID },
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(
        result.data.summary,
        '- Light is absorbed\n- Energy is stored'
    );

    //the note text is what was sent as context
    assert.ok(
        geminiPrompt().includes(NOTE_TEXT)
    );
});

//------------------------------------------------------------
//ask
//------------------------------------------------------------

test('ask requires a question', async () => {
    const result = await postJson(
        `${NOTES_AI}/ask`,
        { noteId: NOTE_ID, question: '   ' },
        studentToken()
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'A question is required'
    );
});

test('ask rejects an over-long question', async () => {
    const result = await postJson(
        `${NOTES_AI}/ask`,
        {
            question: 'x'.repeat(1001)
        },
        studentToken()
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'Your question must be less than 1000 characters'
    );
});

test('ask answers from the note and saves history', async () => {
    geminiResponse = okText(
        'It converts light into energy.'
    );

    const result = await postJson(
        `${NOTES_AI}/ask`,
        {
            noteId: NOTE_ID,
            question: 'What does photosynthesis do?'
        },
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(
        result.data.answer,
        'It converts light into energy.'
    );

    assert.equal(result.data.noteId, NOTE_ID);

    const prompt = geminiPrompt();

    assert.ok(prompt.includes(NOTE_TEXT));
    assert.ok(
        prompt.includes(
            'What does photosynthesis do?'
        )
    );

    const saved = fakeChat.createCalls[0];

    assert.equal(saved.user, STUDENT_ID);
    assert.equal(
        saved.question,
        'What does photosynthesis do?'
    );

    assert.equal(
        saved.answer,
        'It converts light into energy.'
    );
});

test('ask without a noteId falls back to general knowledge', async () => {
    const result = await postJson(
        `${NOTES_AI}/ask`,
        { question: 'What is gravity?' },
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.noteId, null);

    const prompt = geminiPrompt();

    //no note context was supplied
    assert.ok(!prompt.includes(NOTE_TEXT));
    assert.ok(
        prompt.includes('What is gravity?')
    );

    assert.equal(
        fakeChat.createCalls.length,
        1
    );
});

//------------------------------------------------------------
//flashcards
//------------------------------------------------------------

test('flashcards return a parsed question/answer array', async () => {
    geminiResponse = okText(
        JSON.stringify([
            {
                question: 'What is light?',
                answer: 'A form of energy'
            }
        ])
    );

    const result = await postJson(
        `${NOTES_AI}/flashcards`,
        { noteId: NOTE_ID },
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.deepEqual(result.data.flashcards, [
        {
            question: 'What is light?',
            answer: 'A form of energy'
        }
    ]);
});

test('flashcards tolerate ```json fenced responses', async () => {
    geminiResponse = okText(
        '```json\n[{"question":"Q","answer":"A"}]\n```'
    );

    const result = await postJson(
        `${NOTES_AI}/flashcards`,
        { noteId: NOTE_ID },
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.deepEqual(result.data.flashcards, [
        { question: 'Q', answer: 'A' }
    ]);
});

test('flashcards report invalid JSON as an AI failure', async () => {
    geminiResponse = okText('sorry, I cannot do that');

    const result = await postJson(
        `${NOTES_AI}/flashcards`,
        { noteId: NOTE_ID },
        studentToken()
    );

    assert.equal(result.status, 502);
    assert.equal(
        result.data.error,
        'The AI returned invalid JSON'
    );
});

//Quizzes are generated, graded and paid out under features/quizzes, so
//their endpoint tests live in features/quizzes/quizzes.test.js.

//------------------------------------------------------------
//AI failure handling
//------------------------------------------------------------

test('upstream Gemini errors are reported as 502', async () => {
    geminiResponse = {
        ok: false,
        status: 429,
        jsonData: {
            error: { message: 'quota exceeded' }
        }
    };

    const result = await postJson(
        `${NOTES_AI}/summary`,
        { noteId: NOTE_ID },
        studentToken()
    );

    assert.equal(result.status, 502);
    assert.equal(result.data.error, 'quota exceeded');
});

test('a missing API key keeps its 500 status', async () => {
    const saved = process.env.GEMINI_API_KEY;

    delete process.env.GEMINI_API_KEY;

    try {
        const result = await postJson(
            `${NOTES_AI}/summary`,
            { noteId: NOTE_ID },
            studentToken()
        );

        assert.equal(result.status, 500);
        assert.equal(
            result.data.error,
            'GEMINI_API_KEY is missing from the .env file'
        );

        assert.equal(geminiRequests.length, 0);
    } finally {
        process.env.GEMINI_API_KEY = saved;
    }
});
