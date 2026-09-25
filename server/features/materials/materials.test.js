//Endpoint tests for the lesson PDF materials:
//   POST   /api/v1/materials          (admin upload)
//   GET    /api/v1/materials          (list, grade-scoped for students)
//   GET    /api/v1/materials/:id/view (signed url)
//   PUT    /api/v1/materials/:id      (metadata update)
//   DELETE /api/v1/materials/:id
//   GET    /api/v1/materials/file     (signature-protected delivery)
//
//The real Express app runs, including its error handler and the real multer
//uploader, while the User, LessonMaterial and storage modules are replaced
//with stubs. That means no database, no bucket and no filesystem are
//touched. Run with: npm test

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

const { Readable } =
    require('node:stream');

const jwt =
    require('jsonwebtoken');

//used to build a WEBP from the PNG fixture, so the test proves the real
//conversion path rather than a format pdf-lib happens to accept
const sharp = require('sharp');

process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    'materials-test-secret';

//the local driver signs urls with this (it falls back to JWT_SECRET)
process.env.STORAGE_SIGNING_SECRET =
    process.env.STORAGE_SIGNING_SECRET ||
    process.env.JWT_SECRET;

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

//------------------------------------------------------------
//users
//------------------------------------------------------------

const ADMIN_ID =
    'aaaaaaaaaaaaaaaaaaaaaaaa';

const TEACHER_ID =
    'bbbbbbbbbbbbbbbbbbbbbbbb';

const STUDENT_ID =
    'cccccccccccccccccccccccc';

const OTHER_STUDENT_ID =
    'dddddddddddddddddddddddd';

const baseUsers = {
    [ADMIN_ID]: {
        _id: ADMIN_ID,
        name: 'System Admin',
        status: 'active',
        role: 'admin',
        classroom: '9'
    },
    [TEACHER_ID]: {
        _id: TEACHER_ID,
        name: 'Tina Teacher',
        status: 'active',
        role: 'teacher',
        classroom: '9'
    },
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
    }
};

const fakeUsers = {
    async findById(id) {
        return baseUsers[id] || null;
    }
};

stubModule(
    'features/users/userModels.js',
    fakeUsers
);

//------------------------------------------------------------
//storage
//------------------------------------------------------------

const storageCalls = {
    put: [],
    remove: [],
    view: [],
    read: []
};

//set to make the bucket fail, to prove uploads roll back
let putFailure = null;

//what a read hands back
let readBytes = Buffer.from('%PDF-1.4 streamed');

function fakeDriver() {
    return {
        provider: 'supabase',

        async putObject(args) {
            if (putFailure) {
                throw putFailure;
            }

            storageCalls.put.push(args);

            return {
                key: args.key,
                sizeBytes: args.body.length
            };
        },

        async deleteObject(args) {
            storageCalls.remove.push(args);
        },

        async createViewUrl(args) {
            storageCalls.view.push(args);

            return {
                url: `https://project.supabase.co/storage/v1/object/sign/lesson-materials/${args.key}?token=abc`,
                expiresIn: args.expiresIn,
                provider: 'supabase'
            };
        },

        async createReadStream(args) {
            storageCalls.read.push(args);

            //a test can swap this for an oversized object, to prove the
            //re-read refuses one the model could not take
            return {
                stream: Readable.from(readBytes),
                sizeBytes: readBytes.length
            };
        }
    };
}

//The real module is spread in so its own helpers (readObjectBuffer, used
//by the re-read endpoint) are exercised for real -- the driver they are
//handed is the fake above.
const realStorage = require('../../shared/storage');

stubModule('shared/storage/index.js', {
    ...realStorage,
    getStorageDriver: fakeDriver
});

//------------------------------------------------------------
//LessonMaterial
//------------------------------------------------------------

const objectId = (suffix) =>
    `${String(suffix).padStart(24, '0')}`;

//Apply a mongoose-style sort object, using only the keys the controllers
//ask for. Rows without the value sort last, which is what keeps rows
//written before position existed in their upload order.
function sortDocuments(documents, spec = {}) {
    const entries = Object.entries(spec);

    if (entries.length === 0) {
        return [...documents];
    }

    return [...documents].sort((first, second) => {
        for (const [key, direction] of entries) {
            const left = first[key];
            const right = second[key];

            if (left === right) {
                continue;
            }

            if (left === undefined || left === null) {
                return 1;
            }

            if (right === undefined || right === null) {
                return -1;
            }

            const comparison =
                left instanceof Date
                    ? left - right
                    : Number(left) - Number(right);

            if (comparison !== 0) {
                return direction < 0
                    ? -comparison
                    : comparison;
            }
        }

        return 0;
    });
}

const fakeMaterials = {
    documents: [],
    createCalls: [],
    createFailure: null,

    reset() {
        this.documents = [];
        this.createCalls = [];
        this.createFailure = null;
    },

    matches(document, filter) {
        return Object.entries(filter).every(
            ([key, value]) =>
                String(document[key]) ===
                String(value)
        );
    },

    //the controller saves documents when it reorders them, so every
    //document leaving the fake gets the same save/deleteOne as the model
    decorate(document) {
        if (!document) {
            return null;
        }

        document.save = async () => document;

        document.deleteOne = async () => {
            this.documents = this.documents.filter(
                (entry) => entry !== document
            );
        };

        return document;
    },

    async create(payload) {
        this.createCalls.push(payload);

        //One failure, or a queue of them. A queue is what lets a test
        //simulate the first attempt losing the position race and the next
        //one winning it.
        const failure = Array.isArray(
            this.createFailure
        )
            ? this.createFailure.shift()
            : this.createFailure;

        if (failure) {
            throw failure;
        }

        const document = {
            _id: objectId(this.documents.length + 1),
            createdAt: new Date(
                '2026-01-01T00:00:00.000Z'
            ),
            ...payload
        };

        this.documents.push(document);

        return this.decorate(document);
    },

    //a thenable, like a mongoose query, so `await find(...)` and
    //`find(...).sort(...)` both work
    find(filter = {}) {
        const run = (spec) =>
            sortDocuments(
                this.documents.filter((document) =>
                    this.matches(document, filter)
                ),
                spec
            ).map((document) =>
                this.decorate(document)
            );

        const query = Promise.resolve(run());

        query.sort = (spec) =>
            Promise.resolve(run(spec));

        return query;
    },

    findOne(filter = {}) {
        const run = (spec) =>
            this.decorate(
                sortDocuments(
                    this.documents.filter(
                        (document) =>
                            this.matches(
                                document,
                                filter
                            )
                    ),
                    spec
                )[0] || null
            );

        const query = Promise.resolve(run());

        //the controller sorts when it wants the last position in a
        //lesson, so the spec has to be honoured here
        query.sort = (spec) =>
            Promise.resolve(run(spec));

        return query;
    },

    findById(id) {
        //Mongoose rejects an id that cannot be an ObjectId with a
        //CastError, which is what the controllers turn into a 400. Without
        //this the 400 path could only be assumed, never exercised.
        if (!/^[0-9a-f]{24}$/i.test(String(id))) {
            return Promise.reject(
                Object.assign(
                    new Error('Cast to ObjectId failed'),
                    { name: 'CastError' }
                )
            );
        }

        return Promise.resolve(
            this.decorate(
                this.documents.find(
                    (entry) =>
                        String(entry._id) ===
                        String(id)
                ) || null
            )
        );
    },

    //mirrors the real model, because the controllers validate the upload
    //against these enums
    schema: {
        path: (name) => ({
            enumValues:
                name === 'grade'
                    ? ['12', '11', '10', '9']
                    : name === 'subject'
                        ? [
                            'English',
                            'Math',
                            'Natural Sciences'
                        ]
                        : []
        })
    }
};

stubModule(
    'features/materials/LessonMaterial.js',
    fakeMaterials
);

//------------------------------------------------------------
//Gemini (the vision read)
//------------------------------------------------------------

//A real image is read by the vision model, which would need the network.
//Stubbing just that one function keeps the upload tests offline, and
//records what the controller asked the model to read.
const realAi = require('../../shared/ai');

const transcribeCalls = [];
const documentCalls = [];

let transcribeFailure = null;
let documentFailure = null;

const TRANSCRIBED_TEXT =
    'Photosynthesis converts light into chemical energy.';

stubModule('shared/ai.js', {
    ...realAi,

    async transcribeImage(image) {
        transcribeCalls.push(image);

        if (transcribeFailure) {
            throw transcribeFailure;
        }

        return TRANSCRIBED_TEXT;
    },

    //reading a stored lesson again for the AI assistant
    async transcribeDocument(document) {
        documentCalls.push(document);

        if (documentFailure) {
            throw documentFailure;
        }

        return TRANSCRIBED_TEXT;
    }
});

//the real app, with the stubs above in place
const app = require('../../app');

const {
    createSignature
} = require('../../shared/storage/signUrl');

//------------------------------------------------------------
//server lifecycle
//------------------------------------------------------------

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

beforeEach(() => {
    fakeMaterials.reset();

    storageCalls.put = [];
    storageCalls.remove = [];
    storageCalls.view = [];
    storageCalls.read = [];

    putFailure = null;

    readBytes = Buffer.from('%PDF-1.4 streamed');

    transcribeCalls.length = 0;
    documentCalls.length = 0;

    transcribeFailure = null;
    documentFailure = null;
});

//------------------------------------------------------------
//helpers
//------------------------------------------------------------

const tokenFor = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET);

const adminToken = () => tokenFor(ADMIN_ID);
const studentToken = () => tokenFor(STUDENT_ID);

const MATERIALS = '/api/v1/materials';

const PDF_BYTES = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF'
);

function pdfForm(
    {
        bytes = PDF_BYTES,
        type = 'application/pdf',
        filename = 'lesson.pdf',
        ...fields
    } = {}
) {
    const form = new FormData();

    for (const [key, value] of Object.entries(fields)) {
        form.append(key, String(value));
    }

    form.append(
        'file',
        new Blob([bytes], { type }),
        filename
    );

    return form;
}

//Real image bytes, so sharp and pdf-lib do their actual work rather than
//being mocked out: a 2x2 PNG.
const PNG_BYTES = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
    'base64'
);

//the same form builder, for an upload that arrives as a picture rather
//than as a PDF
function imageForm({
    type = 'image/png',
    filename = 'page.png',
    ...options
} = {}) {
    return pdfForm({
        bytes: PNG_BYTES,
        type,
        filename,
        ...options
    });
}

//a PNG whose magic bytes are right and whose body is not
const CORRUPT_IMAGE = Buffer.concat([
    PNG_BYTES.subarray(0, 8),
    Buffer.from('not really a png, whatever the header says')
]);

async function upload(form, token = adminToken()) {
    const headers = {};

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    //let fetch set the multipart boundary itself
    const response = await fetch(
        `${baseUrl}${MATERIALS}`,
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

async function requestJson(
    method,
    url,
    body,
    token
) {
    const headers = {};

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let payload;

    if (body !== undefined) {
        headers['Content-Type'] =
            'application/json';

        payload = JSON.stringify(body);
    }

    const response = await fetch(
        `${baseUrl}${url}`,
        { method, headers, body: payload }
    );

    return {
        status: response.status,
        data: await response
            .json()
            .catch(() => null)
    };
}

//seed a stored material
function seedMaterial(overrides = {}) {
    const document = {
        _id: objectId(9),
        subject: 'English',
        grade: '9',
        //the model defaults this, so a stored row always carries a unit
        unit: 1,
        lesson: 1,
        title: 'Lesson 1 Worksheet',
        storageKey:
            'materials/english/grade-9/unit-01/lesson-01/abc-lesson.pdf',
        storageProvider: 'supabase',
        bucket: 'lesson-materials',
        mimeType: 'application/pdf',
        sizeBytes: PDF_BYTES.length,
        originalName: 'lesson.pdf',
        position: 0,
        createdAt: new Date(
            '2026-01-01T00:00:00.000Z'
        ),
        ...overrides
    };

    fakeMaterials.documents.push(document);

    return document;
}

//------------------------------------------------------------
//upload: authorization
//------------------------------------------------------------

test('upload requires a token', async () => {
    const result = await upload(
        pdfForm({
            subject: 'English',
            grade: '9',
            lesson: 1,
            title: 'Lesson 1'
        }),
        null
    );

    assert.equal(result.status, 401);
    assert.equal(storageCalls.put.length, 0);
});

test('upload is admin-only', async () => {
    for (const token of [
        studentToken(),
        tokenFor(TEACHER_ID)
    ]) {
        const result = await upload(
            pdfForm({
                subject: 'English',
                grade: '9',
                lesson: 1
            }),
            token
        );

        assert.equal(result.status, 403);
    }

    assert.equal(storageCalls.put.length, 0);
});

//------------------------------------------------------------
//upload: validation
//------------------------------------------------------------

test('upload rejects a file type it does not accept at all', async () => {
    const result = await upload(
        pdfForm({
            bytes: Buffer.from('an archive, of some sort'),
            type: 'application/zip',
            filename: 'notes.zip',
            subject: 'English',
            grade: '9',
            lesson: 1
        })
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'Only PDF and image files are supported'
    );

    assert.equal(storageCalls.put.length, 0);
});

test('upload rejects a file that only claims to be an image', async () => {
    //The browser reports image/png, so the filter lets it through. The
    //bytes are what actually decide, and these are not an image.
    const result = await upload(
        pdfForm({
            bytes: Buffer.from('png data'),
            type: 'image/png',
            filename: 'picture.png',
            subject: 'English',
            grade: '9',
            lesson: 1
        })
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'That file is not a valid PDF or image. It may be corrupt, or renamed from another format.'
    );

    assert.equal(storageCalls.put.length, 0);
});

test('upload rejects a corrupt image', async () => {
    const result = await upload(
        pdfForm({
            bytes: CORRUPT_IMAGE,
            type: 'image/png',
            filename: 'page.png',
            subject: 'English',
            grade: '9',
            lesson: 1
        })
    );

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'That image could not be read. It may be corrupt, or renamed from another format.'
    );

    assert.equal(storageCalls.put.length, 0);
});

//------------------------------------------------------------
//upload: an image becomes a PDF
//------------------------------------------------------------

test('an uploaded image is stored as a PDF', async () => {
    transcribeCalls.length = 0;

    const result = await upload(
        imageForm({
            subject: 'English',
            grade: '9',
            lesson: 1
        })
    );

    assert.equal(result.status, 201);

    //the row describes a PDF, because that is what is stored
    assert.equal(
        result.data.material.mimeType,
        'application/pdf'
    );

    assert.equal(
        result.data.material.originalName,
        'page.pdf'
    );

    //what reached storage is a real PDF, not the PNG
    assert.equal(storageCalls.put.length, 1);

    const stored = storageCalls.put[0];

    assert.equal(
        stored.contentType,
        'application/pdf'
    );

    assert.equal(
        stored.body.subarray(0, 5).toString(),
        '%PDF-'
    );

    assert.ok(stored.key.endsWith('.pdf'));

    //the recorded size is the converted file's, so the library's totals
    //describe what is actually stored
    assert.equal(
        result.data.material.sizeBytes,
        stored.body.length
    );

    //the text came from the vision model, and the row says so
    assert.equal(
        fakeMaterials.createCalls[0].sourceKind,
        'image'
    );

    assert.equal(
        fakeMaterials.createCalls[0].extractedText,
        TRANSCRIBED_TEXT
    );

    assert.ok(
        fakeMaterials.createCalls[0].textExtractedAt
    );
});

test('the image is sent to the model as a compact JPEG', async () => {
    transcribeCalls.length = 0;

    await upload(
        imageForm({
            subject: 'English',
            grade: '9',
            lesson: 1
        })
    );

    assert.equal(transcribeCalls.length, 1);

    //One known format, small enough to send inline: the model never sees
    //the original photo, and never has to cope with WEBP or HEIC.
    assert.equal(
        transcribeCalls[0].mimeType,
        'image/jpeg'
    );

    assert.ok(transcribeCalls[0].data.length > 0);
});

test('a WEBP image converts too', async () => {
    const webp = await sharp(PNG_BYTES)
        .webp()
        .toBuffer();

    const result = await upload(
        pdfForm({
            bytes: webp,
            type: 'image/webp',
            filename: 'scan.webp',
            subject: 'English',
            grade: '9',
            lesson: 1
        })
    );

    //pdf-lib cannot embed WEBP: sharp is what makes this work
    assert.equal(result.status, 201);

    assert.equal(
        storageCalls.put[0].body
            .subarray(0, 5)
            .toString(),
        '%PDF-'
    );

    assert.equal(
        result.data.material.originalName,
        'scan.pdf'
    );
});

test('a photo the AI cannot read still uploads', async () => {
    transcribeFailure = new Error(
        'The AI assistant could not read that image'
    );

    try {
        const result = await upload(
            imageForm({
                subject: 'English',
                grade: '9',
                lesson: 1
            })
        );

        assert.equal(result.status, 201);
        assert.equal(storageCalls.put.length, 1);

        //no text, and no stamp: the lesson still opens, the assistant is
        //simply switched off for it (the same policy an image-only PDF
        //already got)
        assert.equal(
            fakeMaterials.createCalls[0].extractedText,
            ''
        );

        assert.equal(
            fakeMaterials.createCalls[0].textExtractedAt,
            null
        );

        assert.equal(
            fakeMaterials.createCalls[0].sourceKind,
            'image'
        );

    } finally {
        transcribeFailure = null;
    }
});

test('a PDF upload still records itself as a PDF', async () => {
    const result = await upload(
        pdfForm({
            subject: 'English',
            grade: '9',
            lesson: 1
        })
    );

    assert.equal(result.status, 201);

    assert.equal(
        fakeMaterials.createCalls[0].sourceKind,
        'pdf'
    );
});

//------------------------------------------------------------
//upload: what the bytes say
//------------------------------------------------------------

test('upload rejects a file that only claims to be a PDF', async () => {
    const result = await upload(
        pdfForm({
            bytes: Buffer.from(
                'this is plain text wearing a PDF hat'
            ),
            subject: 'English',
            grade: '9',
            lesson: 1
        })
    );

    assert.equal(result.status, 400);    assert.equal(result.data.message,
        'That file is not a valid PDF or image. It may be corrupt, or renamed from another format.'
    );

    assert.equal(storageCalls.put.length, 0);
});

test('upload rejects an unknown grade', async () => {
    const result = await upload(
        pdfForm({
            subject: 'English',
            grade: '7',
            lesson: 1
        })
    );

    assert.equal(result.status, 400);
    assert.ok(
        result.data.message.includes(
            'Grade must be one of'
        )
    );

    assert.equal(storageCalls.put.length, 0);
});

test('upload rejects an invalid lesson number', async () => {
    for (const lesson of ['0', 'abc', '1.5', '100']) {
        const result = await upload(
            pdfForm({
                subject: 'English',
                grade: '9',
                lesson
            })
        );

        assert.equal(
            result.status,
            400,
            `lesson ${lesson}`
        );

        assert.ok(
            result.data.message.includes(
                'Lesson must be a whole number'
            )
        );
    }

    assert.equal(storageCalls.put.length, 0);
});

test('upload rejects a missing file', async () => {
    const form = new FormData();

    form.append('subject', 'English');
    form.append('grade', '9');
    form.append('lesson', '1');

    const result = await upload(form);

    assert.equal(result.status, 400);
    assert.equal(
        result.data.message,
        'Please upload a PDF or image file'
    );
});

//------------------------------------------------------------
//upload: subjects
//------------------------------------------------------------

test('upload accepts every subject in the library', async () => {
    for (const subject of [
        'English',
        'Math',
        'Natural Sciences'
    ]) {
        fakeMaterials.reset();
        storageCalls.put = [];

        const result = await upload(
            pdfForm({
                subject,
                grade: '9',
                lesson: 1
            })
        );

        assert.equal(
            result.status,
            201,
            `${subject} should be uploadable`
        );

        assert.equal(
            fakeMaterials.createCalls[0].subject,
            subject
        );

        assert.equal(
            result.data.material.subject,
            subject
        );

        //the object path is namespaced by subject, so two subjects can
        //hold a lesson 1 without sharing a prefix
        assert.ok(
            storageCalls.put[0].key.startsWith(
                `materials/${subject
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')}/grade-9/unit-01/lesson-01/`
            )
        );
    }
});

test('upload normalises the subject casing', async () => {
    const result = await upload(
        pdfForm({
            subject: 'math',
            grade: '9',
            lesson: 1
        })
    );

    assert.equal(result.status, 201);
    assert.equal(
        fakeMaterials.createCalls[0].subject,
        'Math'
    );
});

test('upload rejects an unknown subject', async () => {
    for (const subject of [
        'Matths',
        'Spanish',
        ''
    ]) {
        const result = await upload(
            pdfForm({
                subject,
                grade: '9',
                lesson: 1
            })
        );

        assert.equal(
            result.status,
            400,
            `subject '${subject}'`
        );

        assert.ok(
            result.data.message.includes(
                'Subject must be one of'
            )
        );
    }

    assert.equal(storageCalls.put.length, 0);
});

//------------------------------------------------------------
//upload: success
//------------------------------------------------------------

test('upload stores the object and the metadata', async () => {
    const result = await upload(
        pdfForm({
            subject: 'English',
            grade: '9',
            lesson: 3,
            title: 'Present Perfect'
        })
    );

    assert.equal(result.status, 201);
    assert.equal(
        result.data.message,
        'PDF uploaded successfully'
    );

    //the object went to storage under a readable, grade/unit/lesson key
    assert.equal(storageCalls.put.length, 1);

    const uploaded = storageCalls.put[0];

    assert.match(
        uploaded.key,
        /^materials\/english\/grade-9\/unit-01\/lesson-03\/[0-9a-f-]{36}-lesson\.pdf$/
    );

    assert.equal(
        uploaded.contentType,
        'application/pdf'
    );

    //and only the location plus metadata went to the database
    const stored = fakeMaterials.createCalls[0];

    assert.equal(stored.subject, 'English');
    assert.equal(stored.grade, '9');
    //no unit was sent, so the material joins the first unit
    assert.equal(stored.unit, 1);
    assert.equal(stored.lesson, 3);
    assert.equal(stored.title, 'Present Perfect');
    assert.equal(stored.storageKey, uploaded.key);
    assert.equal(stored.storageProvider, 'supabase');
    assert.equal(
        stored.sizeBytes,
        PDF_BYTES.length
    );
    assert.equal(stored.originalName, 'lesson.pdf');
    assert.equal(stored.uploadedBy, ADMIN_ID);

    //the response never leaks the storage key or bucket
    assert.equal(
        result.data.material.storageKey,
        undefined
    );

    assert.equal(
        result.data.material.storageProvider,
        undefined
    );

    assert.equal(
        result.data.material.title,
        'Present Perfect'
    );
});

test('upload falls back to the file name for the title', async () => {
    const result = await upload(
        pdfForm({
            filename: 'unit-2-reading.pdf',
            subject: 'English',
            grade: '10',
            lesson: 2
        })
    );

    assert.equal(result.status, 201);
    assert.equal(
        fakeMaterials.createCalls[0].title,
        'unit-2-reading'
    );
});

test('a failed metadata write removes the uploaded object', async () => {
    fakeMaterials.createFailure = new Error(
        'database is down'
    );

    const result = await upload(
        pdfForm({
            subject: 'English',
            grade: '9',
            lesson: 1
        })
    );

    assert.equal(result.status, 500);

    //The store's own message stays in the log: a client is told what
    //failed, never the internals behind it. Nothing in the body may carry
    //the detail, whether under an `error` field or inside a message.
    assert.equal(result.data.error, undefined);

    assert.ok(
        !JSON.stringify(result.data).includes(
            'database is down'
        ),
        'the response body leaked the underlying error message'
    );

    //a failure that is not the position index is not a race, so it is
    //reported instead of being retried
    assert.equal(fakeMaterials.createCalls.length, 1);

    //no orphaned object is left in the bucket
    assert.equal(storageCalls.remove.length, 1);

    assert.equal(
        storageCalls.remove[0].key,
        storageCalls.put[0].key
    );
});

test('a position taken by a racing upload is retried', async () => {
    //another upload took the slot in the moment between reading the last
    //position and writing this row, which is what the unique index
    //reports as a duplicate key
    fakeMaterials.createFailure = [
        Object.assign(
            new Error('E11000 duplicate key error'),
            { code: 11000 }
        )
    ];

    const result = await upload(
        pdfForm({
            subject: 'English',
            grade: '9',
            lesson: 1
        })
    );

    assert.equal(result.status, 201);

    //the slot was asked for again rather than the upload failing
    assert.equal(fakeMaterials.createCalls.length, 2);

    //and the file belonging to the retry is kept, not cleaned up as though
    //the upload had failed
    assert.equal(storageCalls.remove.length, 0);
});

//------------------------------------------------------------
//listing
//------------------------------------------------------------

test('listing pins a student to their own grade', async () => {
    seedMaterial({ _id: objectId(1), grade: '9' });

    seedMaterial({
        _id: objectId(2),
        grade: '10',
        lesson: 1
    });

    //the student asks for grade 10 explicitly: it must be ignored
    const result = await requestJson(
        'GET',
        `${MATERIALS}?subject=English&grade=10`,
        undefined,
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.materials.length, 1);
    assert.equal(result.data.materials[0].grade, '9');
});

test('listing lets an admin filter by grade and lesson', async () => {
    seedMaterial({ _id: objectId(1), grade: '9', lesson: 1 });
    seedMaterial({ _id: objectId(2), grade: '9', lesson: 2 });
    seedMaterial({ _id: objectId(3), grade: '10', lesson: 1 });

    const result = await requestJson(
        'GET',
        `${MATERIALS}?grade=9&lesson=2`,
        undefined,
        adminToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.materials.length, 1);
    assert.equal(result.data.materials[0].lesson, 2);
});

test('listing requires a token', async () => {
    const result = await requestJson(
        'GET',
        MATERIALS,
        undefined,
        null
    );

    assert.equal(result.status, 401);
});

//------------------------------------------------------------
//subjects
//------------------------------------------------------------

test('listing filters by subject', async () => {
    seedMaterial({
        _id: objectId(1),
        subject: 'English',
        grade: '9',
        lesson: 1
    });

    seedMaterial({
        _id: objectId(2),
        subject: 'Math',
        grade: '9',
        lesson: 1
    });

    seedMaterial({
        _id: objectId(3),
        subject: 'Natural Sciences',
        grade: '9',
        lesson: 1
    });

    //a student is still pinned to their own grade, so only the subject
    //separates these three
    const math = await requestJson(
        'GET',
        `${MATERIALS}?subject=Math`,
        undefined,
        studentToken()
    );

    assert.equal(math.status, 200);
    assert.equal(math.data.materials.length, 1);
    assert.equal(
        math.data.materials[0].subject,
        'Math'
    );

    const sciences = await requestJson(
        'GET',
        `${MATERIALS}?subject=Natural Sciences`,
        undefined,
        studentToken()
    );

    assert.equal(sciences.status, 200);
    assert.equal(sciences.data.materials.length, 1);

    assert.equal(
        sciences.data.materials[0]._id,
        objectId(3)
    );
});

test('listing accepts a subject in any casing', async () => {
    seedMaterial({
        _id: objectId(1),
        subject: 'Math',
        grade: '9',
        lesson: 1
    });

    const result = await requestJson(
        'GET',
        `${MATERIALS}?subject=math`,
        undefined,
        adminToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.materials.length, 1);
    assert.equal(result.data.materials[0].subject, 'Math');
});

test('listing rejects an unknown subject', async () => {
    const result = await requestJson(
        'GET',
        `${MATERIALS}?subject=Spanish`,
        undefined,
        adminToken()
    );

    assert.equal(result.status, 400);

    assert.ok(
        result.data.message.includes(
            'Subject must be one of: English, Math, Natural Sciences'
        )
    );
});

test('each subject keeps its own order for the same grade and lesson', async () => {
    seedMaterial({
        _id: objectId(1),
        subject: 'English',
        grade: '9',
        lesson: 1,
        position: 0
    });

    //Math lesson 1 is a different group, so it starts at 0 as well
    const result = await upload(
        pdfForm({
            subject: 'Math',
            grade: '9',
            lesson: 1
        })
    );

    assert.equal(result.status, 201);
    assert.equal(
        fakeMaterials.createCalls[0].position,
        0
    );
});

test('reordering one subject leaves another subject alone', async () => {
    seedMaterial({
        _id: objectId(1),
        subject: 'Math',
        grade: '9',
        lesson: 1,
        position: 0
    });

    seedMaterial({
        _id: objectId(2),
        subject: 'Math',
        grade: '9',
        lesson: 1,
        position: 1
    });

    const english = seedMaterial({
        _id: objectId(3),
        subject: 'English',
        grade: '9',
        lesson: 1,
        position: 0
    });

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/reorder`,
        {
            subject: 'Math',
            grade: '9',
            lesson: 1,
            order: [objectId(2), objectId(1)]
        },
        adminToken()
    );

    assert.equal(result.status, 200);

    const math = fakeMaterials.documents.filter(
        (document) => document.subject === 'Math'
    );

    assert.equal(
        math.find(
            (document) =>
                document._id === objectId(2)
        ).position,
        0
    );

    assert.equal(
        math.find(
            (document) =>
                document._id === objectId(1)
        ).position,
        1
    );

    //the English PDF never entered the Math lesson's permutation
    assert.equal(english.position, 0);
});

//------------------------------------------------------------
//order inside a lesson
//------------------------------------------------------------

test('the first PDF in a lesson starts at position 0', async () => {
    const result = await upload(
        pdfForm({
            subject: 'English',
            grade: '9',
            lesson: 2
        })
    );

    assert.equal(result.status, 201);
    assert.equal(
        fakeMaterials.createCalls[0].position,
        0
    );
});

test('a new upload is appended after the PDFs already in its lesson', async () => {
    seedMaterial({
        _id: objectId(1),
        grade: '9',
        lesson: 1,
        position: 0
    });

    seedMaterial({
        _id: objectId(2),
        grade: '9',
        lesson: 1,
        position: 1
    });

    const result = await upload(
        pdfForm({
            subject: 'English',
            grade: '9',
            lesson: 1,
            title: 'Third'
        })
    );

    assert.equal(result.status, 201);
    assert.equal(
        fakeMaterials.createCalls[0].position,
        2
    );
});

test('listing returns the PDFs in the stored order', async () => {
    //seeded out of order, so only the sort can put them back
    seedMaterial({
        _id: objectId(1),
        lesson: 1,
        position: 1,
        title: 'Second'
    });

    seedMaterial({
        _id: objectId(2),
        lesson: 1,
        position: 0,
        title: 'First'
    });

    const result = await requestJson(
        'GET',
        `${MATERIALS}?subject=English`,
        undefined,
        studentToken()
    );

    assert.equal(result.status, 200);

    assert.deepEqual(
        result.data.materials.map(
            (material) => material.title
        ),
        ['First', 'Second']
    );
});

test('reordering sets the order inside one lesson', async () => {
    const first = seedMaterial({
        _id: objectId(1),
        lesson: 1,
        position: 0,
        title: 'Alpha'
    });

    const second = seedMaterial({
        _id: objectId(2),
        lesson: 1,
        position: 1,
        title: 'Beta'
    });

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/reorder`,
        {
            subject: 'English',
            grade: '9',
            lesson: 1,
            order: [second._id, first._id]
        },
        adminToken()
    );

    assert.equal(result.status, 200);

    assert.deepEqual(
        result.data.materials.map(
            (material) => material.title
        ),
        ['Beta', 'Alpha']
    );

    //and the stored positions follow the new order
    assert.equal(
        fakeMaterials.documents[0].position,
        1
    );

    assert.equal(
        fakeMaterials.documents[1].position,
        0
    );
});

test('reordering only touches its own lesson', async () => {
    const first = seedMaterial({
        _id: objectId(1),
        lesson: 1,
        position: 0
    });

    //a distinctly different position, so a stray write would show up
    const elsewhere = seedMaterial({
        _id: objectId(2),
        lesson: 7,
        position: 5
    });

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/reorder`,
        {
            subject: 'English',
            grade: '9',
            lesson: 1,
            order: [first._id]
        },
        adminToken()
    );

    assert.equal(result.status, 200);

    assert.equal(elsewhere.position, 5);
});

test('reordering is admin-only', async () => {
    const material = seedMaterial({
        _id: objectId(1),
        position: 0
    });

    for (const token of [
        studentToken(),
        tokenFor(TEACHER_ID)
    ]) {
        const result = await requestJson(
            'PUT',
            `${MATERIALS}/reorder`,
            {
                subject: 'English',
                grade: '9',
                lesson: 1,
                order: [material._id]
            },
            token
        );

        assert.equal(result.status, 403);
    }
});

test('reordering rejects a partial list', async () => {
    const first = seedMaterial({
        _id: objectId(1),
        lesson: 1,
        position: 0
    });

    seedMaterial({
        _id: objectId(2),
        lesson: 1,
        position: 1
    });

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/reorder`,
        {
            subject: 'English',
            grade: '9',
            lesson: 1,
            //the second PDF of the lesson is missing
            order: [first._id]
        },
        adminToken()
    );

    assert.equal(result.status, 400);

    assert.equal(
        result.data.message,
        'The order must list every PDF in this lesson exactly once'
    );

    assert.equal(
        fakeMaterials.documents[0].position,
        0
    );
});

test('reordering rejects an id from another lesson', async () => {
    seedMaterial({
        _id: objectId(1),
        lesson: 1,
        position: 0
    });

    const other = seedMaterial({
        _id: objectId(2),
        lesson: 5,
        position: 0
    });

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/reorder`,
        {
            subject: 'English',
            grade: '9',
            lesson: 1,
            order: [other._id]
        },
        adminToken()
    );

    assert.equal(result.status, 400);
});

test('reordering rejects the same id twice', async () => {
    const material = seedMaterial({
        _id: objectId(1),
        position: 0
    });

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/reorder`,
        {
            subject: 'English',
            grade: '9',
            lesson: 1,
            order: [material._id, material._id]
        },
        adminToken()
    );

    assert.equal(result.status, 400);
});

test('reordering requires a list', async () => {
    seedMaterial({ position: 0 });

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/reorder`,
        {
            subject: 'English',
            grade: '9',
            lesson: 1
        },
        adminToken()
    );

    assert.equal(result.status, 400);

    assert.equal(
        result.data.message,
        'An ordered list of PDF ids is required'
    );
});

test('moving a PDF to another lesson appends it there', async () => {
    seedMaterial({
        _id: objectId(1),
        lesson: 3,
        position: 0
    });

    const moved = seedMaterial({
        _id: objectId(2),
        lesson: 1,
        position: 0
    });

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/${moved._id}`,
        {
            title: 'Moved',
            grade: '9',
            lesson: 3
        },
        adminToken()
    );

    assert.equal(result.status, 200);

    const stored = fakeMaterials.documents.find(
        (document) =>
            String(document._id) ===
            String(moved._id)
    );

    //it lands after the file already in lesson 3, so it cannot share
    //that file's position
    assert.equal(stored.lesson, 3);
    assert.equal(stored.position, 1);
});

test('moving a PDF to another subject appends it there', async () => {
    seedMaterial({
        _id: objectId(1),
        subject: 'Math',
        grade: '9',
        lesson: 2,
        position: 0
    });

    const moved = seedMaterial({
        _id: objectId(2),
        subject: 'English',
        grade: '9',
        lesson: 2,
        position: 0
    });

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/${moved._id}`,
        {
            title: 'Moved to Math',
            subject: 'Math',
            grade: '9',
            lesson: 2
        },
        adminToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.material.subject, 'Math');

    const stored = fakeMaterials.documents.find(
        (document) =>
            String(document._id) ===
            String(moved._id)
    );

    //the destination group already holds one PDF, so this joins the end
    assert.equal(stored.subject, 'Math');
    assert.equal(stored.position, 1);
});

//------------------------------------------------------------
//view url
//------------------------------------------------------------

test('view url is a short-lived signed link', async () => {
    const material = seedMaterial();

    const result = await requestJson(
        'GET',
        `${MATERIALS}/${material._id}/view`,
        undefined,
        studentToken()
    );

    assert.equal(result.status, 200);

    assert.ok(
        result.data.url.includes(
            'supabase.co'
        )
    );

    assert.equal(result.data.provider, 'supabase');
    assert.equal(result.data.expiresIn, 600);

    //the driver was asked for exactly this object
    assert.equal(
        storageCalls.view[0].key,
        material.storageKey
    );
});

test('a student cannot open another grade material', async () => {
    const material = seedMaterial({ grade: '10' });

    const result = await requestJson(
        'GET',
        `${MATERIALS}/${material._id}/view`,
        undefined,
        studentToken()
    );

    assert.equal(result.status, 404);
    assert.equal(storageCalls.view.length, 0);
});

test('a teacher can open any grade material', async () => {
    const material = seedMaterial({ grade: '12' });

    const result = await requestJson(
        'GET',
        `${MATERIALS}/${material._id}/view`,
        undefined,
        tokenFor(TEACHER_ID)
    );

    assert.equal(result.status, 200);
    assert.equal(storageCalls.view.length, 1);
});

test('view url returns 404 for an unknown material', async () => {
    const result = await requestJson(
        'GET',
        `${MATERIALS}/${objectId(77)}/view`,
        undefined,
        adminToken()
    );

    assert.equal(result.status, 404);
});

//------------------------------------------------------------
//update and delete
//------------------------------------------------------------

test('update changes the metadata', async () => {
    const material = seedMaterial();

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/${material._id}`,
        {
            title: 'Renamed',
            lesson: 4
        },
        adminToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.material.title, 'Renamed');
    assert.equal(result.data.material.lesson, 4);

    //the object itself is untouched
    assert.equal(
        fakeMaterials.documents[0].storageKey,
        material.storageKey
    );

    assert.equal(storageCalls.put.length, 0);
});

test('update is admin-only', async () => {
    const material = seedMaterial();

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/${material._id}`,
        { title: 'Nope' },
        studentToken()
    );

    assert.equal(result.status, 403);
});

test('delete removes the object and then the record', async () => {
    const material = seedMaterial();

    const result = await requestJson(
        'DELETE',
        `${MATERIALS}/${material._id}`,
        undefined,
        adminToken()
    );

    assert.equal(result.status, 200);
    assert.equal(
        storageCalls.remove[0].key,
        material.storageKey
    );

    assert.equal(fakeMaterials.documents.length, 0);
});

test('delete is admin-only', async () => {
    const material = seedMaterial();

    const result = await requestJson(
        'DELETE',
        `${MATERIALS}/${material._id}`,
        undefined,
        tokenFor(TEACHER_ID)
    );

    assert.equal(result.status, 403);
    assert.equal(storageCalls.remove.length, 0);
    assert.equal(fakeMaterials.documents.length, 1);
});

//------------------------------------------------------------
//signed file delivery (GET /file)
//------------------------------------------------------------

function fileUrl(key, expiresIn = 600) {
    const expires =
        Math.floor(Date.now() / 1000) + expiresIn;

    const query = new URLSearchParams({
        key,
        expires: String(expires),
        signature: createSignature(key, expires)
    });

    return `${MATERIALS}/file?${query}`;
}

test('/file streams a signed material inline', async () => {
    const material = seedMaterial();

    const response = await fetch(
        `${baseUrl}${fileUrl(material.storageKey)}`
    );

    assert.equal(response.status, 200);

    assert.equal(
        response.headers.get('content-type'),
        'application/pdf'
    );

    assert.match(
        response.headers.get(
            'content-disposition'
        ),
        /^inline; filename="Lesson 1 Worksheet\.pdf"$/
    );

    assert.equal(
        await response.text(),
        '%PDF-1.4 streamed'
    );

    assert.equal(storageCalls.read.length, 1);
});

test('/file rejects a tampered signature', async () => {
    const material = seedMaterial();

    const tampered = fileUrl(
        material.storageKey
    ).replace(
        /signature=[0-9a-f]+/,
        `signature=${'0'.repeat(64)}`
    );

    const response = await fetch(
        `${baseUrl}${tampered}`
    );

    assert.equal(response.status, 403);
    assert.equal(storageCalls.read.length, 0);
});

test('/file rejects an expired link', async () => {
    const material = seedMaterial();

    const response = await fetch(
        `${baseUrl}${fileUrl(
            material.storageKey,
            -60
        )}`
    );

    assert.equal(response.status, 410);
    assert.equal(storageCalls.read.length, 0);
});

test('/file refuses a valid signature for an unknown key', async () => {
    //signed correctly, but no such material exists: the signature alone
    //must not be enough to read arbitrary files
    const response = await fetch(
        `${baseUrl}${fileUrl(
            'materials/english/grade-9/lesson-01/secret.pdf'
        )}`
    );

    assert.equal(response.status, 404);
    assert.equal(storageCalls.read.length, 0);
});

test('/file requires the full set of query params', async () => {
    const response = await fetch(
        `${baseUrl}${MATERIALS}/file?key=abc`
    );

    assert.equal(response.status, 400);
});

//------------------------------------------------------------
//units
//------------------------------------------------------------

test('upload stores the unit the admin chose', async () => {
    const result = await upload(
        pdfForm({
            subject: 'Math',
            grade: '9',
            unit: 2,
            lesson: 1,
            title: 'Unit 2 opener'
        })
    );

    assert.equal(result.status, 201);

    const stored = fakeMaterials.createCalls[0];

    assert.equal(stored.unit, 2);
    assert.equal(stored.lesson, 1);

    //the caller gets the unit back, so its list stays grouped
    assert.equal(result.data.material.unit, 2);

    //and the object is namespaced by unit, so unit 2 lesson 1 does not
    //share a prefix with unit 1 lesson 1
    assert.match(
        storageCalls.put[0].key,
        /^materials\/math\/grade-9\/unit-02\/lesson-01\/[0-9a-f-]{36}-lesson\.pdf$/
    );
});

test('upload rejects an invalid unit', async () => {
    for (const unit of ['0', 'abc', '1.5', '100', '']) {
        const result = await upload(
            pdfForm({
                subject: 'Math',
                grade: '9',
                unit,
                lesson: 1
            })
        );

        assert.equal(
            result.status,
            400,
            `unit '${unit}'`
        );

        assert.ok(
            result.data.message.includes(
                'Unit must be a whole number'
            )
        );
    }

    assert.equal(storageCalls.put.length, 0);
});

test('listing filters by unit', async () => {
    seedMaterial({ _id: objectId(1), unit: 1, lesson: 1 });
    seedMaterial({ _id: objectId(2), unit: 2, lesson: 1 });
    seedMaterial({ _id: objectId(3), unit: 2, lesson: 2 });

    const result = await requestJson(
        'GET',
        `${MATERIALS}?subject=English&unit=2`,
        undefined,
        studentToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.materials.length, 2);

    assert.deepEqual(
        result.data.materials.map(
            (material) => material.lesson
        ),
        [1, 2]
    );
});

test('the same lesson number in another unit is its own group', async () => {
    //unit 1 lesson 1 already holds a PDF...
    seedMaterial({
        _id: objectId(1),
        unit: 1,
        lesson: 1,
        position: 0
    });

    //...so unit 2 lesson 1 starts its own numbering at 0
    const result = await upload(
        pdfForm({
            subject: 'English',
            grade: '9',
            unit: 2,
            lesson: 1
        })
    );

    assert.equal(result.status, 201);
    assert.equal(
        fakeMaterials.createCalls[0].position,
        0
    );
});

test('listing orders by unit before lesson', async () => {
    //seeded out of order, so only the sort can put them back
    seedMaterial({
        _id: objectId(1),
        unit: 2,
        lesson: 1,
        title: 'U2 L1'
    });

    seedMaterial({
        _id: objectId(2),
        unit: 1,
        lesson: 2,
        title: 'U1 L2'
    });

    seedMaterial({
        _id: objectId(3),
        unit: 1,
        lesson: 1,
        title: 'U1 L1'
    });

    const result = await requestJson(
        'GET',
        `${MATERIALS}?subject=English`,
        undefined,
        studentToken()
    );

    assert.equal(result.status, 200);

    assert.deepEqual(
        result.data.materials.map(
            (material) => material.title
        ),
        ['U1 L1', 'U1 L2', 'U2 L1']
    );
});

test('reordering only touches its own unit', async () => {
    const first = seedMaterial({
        _id: objectId(1),
        unit: 1,
        lesson: 1,
        position: 0
    });

    //a distinctly different position, so a stray write would show up
    const otherUnit = seedMaterial({
        _id: objectId(2),
        unit: 2,
        lesson: 1,
        position: 5
    });

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/reorder`,
        {
            subject: 'English',
            grade: '9',
            unit: 1,
            lesson: 1,
            order: [first._id]
        },
        adminToken()
    );

    assert.equal(result.status, 200);

    //unit 2 lesson 1 shares the lesson number but is a different group
    assert.equal(otherUnit.position, 5);
});

test('moving a PDF to another unit appends it there', async () => {
    seedMaterial({
        _id: objectId(1),
        unit: 2,
        lesson: 1,
        position: 0
    });

    const moved = seedMaterial({
        _id: objectId(2),
        unit: 1,
        lesson: 1,
        position: 0
    });

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/${moved._id}`,
        {
            title: 'Moved to unit 2',
            grade: '9',
            unit: 2,
            lesson: 1
        },
        adminToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.material.unit, 2);

    const stored = fakeMaterials.documents.find(
        (document) =>
            String(document._id) ===
            String(moved._id)
    );

    //it lands after the file already in unit 2 lesson 1
    assert.equal(stored.unit, 2);
    assert.equal(stored.position, 1);
});

test('update keeps the unit when the request does not name one', async () => {
    const material = seedMaterial({
        unit: 3,
        lesson: 1,
        position: 0
    });

    const result = await requestJson(
        'PUT',
        `${MATERIALS}/${material._id}`,
        { title: 'Renamed only' },
        adminToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.material.unit, 3);

    const stored = fakeMaterials.documents.find(
        (document) =>
            String(document._id) ===
            String(material._id)
    );

    assert.equal(stored.unit, 3);
    assert.equal(stored.title, 'Renamed only');
});

//------------------------------------------------------------
//reading a lesson again for the AI assistant
//------------------------------------------------------------
//
//A photo is read by the vision model at upload time, and that read can
//fail: the provider answers a burst of traffic with a 503, and a burst
//outlasts an upload. The photo is not kept, so these prove the lesson can
//be read again from the stored PDF instead of being stuck without an
//assistant until someone re-uploads the page.

//a lesson nothing could be read from at upload time
function seedUnreadPhoto(overrides = {}) {
    return seedMaterial({
        title: 'Photographed worksheet',
        sourceKind: 'image',
        originalName: 'worksheet.pdf',
        extractedText: '',
        textExtractedAt: null,
        ...overrides
    });
}

test('an admin can read an unread lesson again from the stored page', async () => {
    const material = seedUnreadPhoto();

    const result = await requestJson(
        'POST',
        `${MATERIALS}/${material._id}/read`,
        undefined,
        adminToken()
    );

    assert.equal(result.status, 200);

    //the assistant is switched back on for it
    assert.equal(result.data.material.hasText, true);

    //Read from storage -- not from a re-upload -- and handed to the model
    //as the PDF it is stored as, whole.
    assert.equal(storageCalls.read.length, 1);
    assert.equal(
        storageCalls.read[0].key,
        material.storageKey
    );

    assert.equal(documentCalls.length, 1);
    assert.equal(
        documentCalls[0].mimeType,
        'application/pdf'
    );

    assert.equal(
        documentCalls[0].data,
        readBytes.toString('base64')
    );

    const stored = fakeMaterials.documents.find(
        (document) =>
            String(document._id) ===
            String(material._id)
    );

    assert.equal(
        stored.extractedText,
        TRANSCRIBED_TEXT
    );

    //stamped, so the backfill script does not read it a third time
    assert.ok(stored.textExtractedAt instanceof Date);
});

test('reading a lesson again is admin-only', async () => {
    const material = seedUnreadPhoto();

    const asStudent = await requestJson(
        'POST',
        `${MATERIALS}/${material._id}/read`,
        undefined,
        studentToken()
    );

    assert.equal(asStudent.status, 403);

    //the read never happened
    assert.equal(documentCalls.length, 0);
    assert.equal(storageCalls.read.length, 0);
});

test('a lesson that is not there cannot be read again', async () => {
    const missing = await requestJson(
        'POST',
        `${MATERIALS}/${objectId(7)}/read`,
        undefined,
        adminToken()
    );

    assert.equal(missing.status, 404);

    assert.equal(documentCalls.length, 0);
});

test('a malformed lesson id is a 400, not a 500', async () => {
    const result = await requestJson(
        'POST',
        `${MATERIALS}/not-an-id/read`,
        undefined,
        adminToken()
    );

    assert.equal(result.status, 400);
});

test('a stored page the model cannot read leaves the row alone', async () => {
    const material = seedUnreadPhoto();

    documentFailure = Object.assign(
        new Error('high demand'),
        { status: 502 }
    );

    const result = await requestJson(
        'POST',
        `${MATERIALS}/${material._id}/read`,
        undefined,
        adminToken()
    );

    assert.equal(result.status, 502);

    const stored = fakeMaterials.documents.find(
        (document) =>
            String(document._id) ===
            String(material._id)
    );

    //Left unstamped on purpose: this lesson is still waiting for a read,
    //so the next attempt (or the backfill) can pick it up. Stamping it
    //here would declare it done and lose the lesson's assistant for good.
    assert.equal(stored.textExtractedAt, null);
    assert.equal(stored.extractedText, '');
});

test('a file too large for the model is refused before it is sent', async () => {
    const material = seedUnreadPhoto();

    //just over the ceiling
    readBytes = Buffer.alloc(
        12 * 1024 * 1024 + 1,
        'x'
    );

    const result = await requestJson(
        'POST',
        `${MATERIALS}/${material._id}/read`,
        undefined,
        adminToken()
    );

    assert.equal(result.status, 400);

    //the bytes were never handed to the provider
    assert.equal(documentCalls.length, 0);
});

test('a plain PDF is read again the same way', async () => {
    const material = seedMaterial({
        extractedText: '',
        textExtractedAt: null
    });

    const result = await requestJson(
        'POST',
        `${MATERIALS}/${material._id}/read`,
        undefined,
        adminToken()
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.material.hasText, true);

    //the stored PDF is what the model was given, and the extracted text
    //never reaches the browser -- only whether there is any
    assert.equal(
        result.data.material.extractedText,
        undefined
    );

    assert.equal(documentCalls.length, 1);
});
