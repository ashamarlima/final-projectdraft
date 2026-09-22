const crypto = require('node:crypto');

const LessonMaterial = require('./LessonMaterial');

const { getStorageDriver } = require('../../shared/storage');

const { verifySignature } = require('../../shared/storage/signUrl');

const { extractPdfText } = require('../../shared/pdf');

const {
    detectRasterImage,
    imageToPdf,
    imageForAi
} = require('../../shared/images');

const ai = require('../../shared/ai');

const DEFAULT_SUBJECT = 'English';
const MAX_TITLE_LENGTH = 200;
const MAX_LESSON = 99;
const MAX_UNIT = 99;

//The lesson text kept for the AI assistant is capped, so one enormous PDF
//cannot push the document towards MongoDB's size limit. The AI is sent a
//much smaller slice than this (see shared/ai.js); this ceiling is only
//about what is stored.
const MAX_LESSON_TEXT = 200000;

//where a PDF lands when no unit is named. Uploads made before units
//existed (and their stored rows) belong here.
const DEFAULT_UNIT = 1;

//how long a viewer link stays valid
const VIEW_EXPIRES_IN = 600;

const PDF_MAGIC = '%PDF-';

//how far into the file the header may sit; real-world PDFs sometimes have
//a little junk before it
const PDF_HEADER_SEARCH = 1024;

function currentUserId(req) {
    return req.user?._id || req.user?.id;
}

//the subjects the library accepts, read straight from the schema so the
//model and every controller that validates a subject cannot disagree
function subjectValues() {
    return (
        LessonMaterial.schema
            .path('subject')
            .enumValues || []
    );
}

//Match a requested subject ignoring case, so 'math' is accepted but a
//typo such as 'Matths' is refused rather than silently creating a
//second library that no student page ever asks for.
function normalizeSubject(value) {
    const wanted = String(value ?? '').trim();

    return (
        subjectValues().find(
            (subject) =>
                subject.toLowerCase() ===
                wanted.toLowerCase()
        ) || ''
    );
}

//students only ever see their own grade, whatever they ask for
function scopeToUser(req, filter) {
    if (req.user?.role === 'student') {
        filter.grade = String(
            req.user.classroom || ''
        );
    }

    return filter;
}

//the storage key is internal: it never needs to reach the browser, because
//read access is handed out as a signed url instead
function toMaterialSummary(material) {
    return {
        _id: material._id,
        subject: material.subject,
        grade: material.grade,
        unit: material.unit,
        lesson: material.lesson,
        title: material.title,
        mimeType: material.mimeType,
        sizeBytes: material.sizeBytes,
        originalName: material.originalName,
        publicUrl: material.publicUrl,
        createdAt: material.createdAt,

        //whether the AI assistant can work with this lesson. The text
        //itself never reaches the browser; it stays on the server and the
        //assistant endpoints read it there.
        hasText: Boolean(
            String(material.extractedText || '').trim()
        )
    };
}

function stripExtension(fileName) {
    return String(fileName || '').replace(
        /\.[^./\\]+$/,
        ''
    );
}

//a header value must not be able to inject extra headers
function safeFileName(title) {
    return (
        String(title || 'material')
            .replace(/[^\w.\- ]+/g, '_')
            .slice(0, 100)
            .trim() || 'material'
    );
}

//A PDF always begins with %PDF-. file.mimetype is only the client's
//claim, so the bytes decide whether we accept the upload. These files are
//served back to students as PDFs, so this is worth checking.
function looksLikePdf(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 5) {
        return false;
    }

    return buffer
        .subarray(0, PDF_HEADER_SEARCH)
        .toString('latin1')
        .includes(PDF_MAGIC);
}

//What an upload actually is, decided by its bytes rather than by the type
//the client declared, and turned into the one format the library stores.
//
//A PDF is kept exactly as it arrived. An image (a photographed page, a
//screenshot, a phone photo) becomes a one-page PDF here, so storage, the
//viewer, the signed url and the download naming are identical for both --
//nothing downstream has to know the file started as a picture.
//
async function prepareUpload(file) {
    if (looksLikePdf(file.buffer)) {
        return {
            kind: 'pdf',

            //the bytes that get stored
            buffer: file.buffer,

            mimeType: 'application/pdf',
            originalName: file.originalname,

            //only an image needs to be handed to the vision model
            imageBuffer: null
        };
    }

    if (!detectRasterImage(file.buffer)) {
        const error = new Error(
            'That file is not a valid PDF or image. It may be corrupt, or renamed from another format.'
        );

        error.status = 400;

        throw error;
    }

    const baseName =
        stripExtension(file.originalname) || 'material';

    return {
        kind: 'image',

        buffer: await imageToPdf(file.buffer),

        mimeType: 'application/pdf',

        //The stored object is a PDF whatever arrived, so the name says
        //so ("IMG_1234.HEIC" is stored and downloaded as
        //"IMG_1234.pdf").
        originalName: `${baseName}.pdf`,

        //The photo itself. The PDF built above it holds no text layer,
        //so this is what the assistant reads.
        imageBuffer: file.buffer
    };
}

//Read an upload for the AI assistant: a PDF is parsed for its text layer,
//while a photo is read by the vision model.
async function readUploadForAi(upload) {
    if (upload.kind !== 'image') {
        return extractPdfText(upload.buffer);
    }

    return ai.transcribeImage(
        await imageForAi(upload.imageBuffer)
    );
}

//validate and normalise the upload/update fields. Returns either the
//clean values or { error }.
function parseMaterialFields(body, fallback = {}) {
    //An absent subject falls back (to the material's current one when
    //updating, English when uploading). A subject that *is* sent has to
    //name a real library, so '' is an error rather than a silent
    //'English'.
    const requestedSubject =
        body.subject ?? fallback.subject;

    const subject =
        requestedSubject === undefined ||
        requestedSubject === null
            ? DEFAULT_SUBJECT
            : normalizeSubject(requestedSubject);

    const grade = String(
        body.grade ?? fallback.grade ?? ''
    ).trim();

    //Like the subject above, an absent unit falls back (to the material's
    //current one when updating, 1 when uploading), while a unit that *is*
    //sent has to be a whole number: '' is an error rather than a silent 1.
    const requestedUnit =
        body.unit ?? fallback.unit;

    const unit =
        requestedUnit === undefined ||
        requestedUnit === null
            ? DEFAULT_UNIT
            : Number(requestedUnit);

    const lesson = Number(
        body.lesson ?? fallback.lesson
    );

    const title = String(
        body.title ?? fallback.title ?? ''
    ).trim();

    const grades =
        LessonMaterial.schema.path('grade').enumValues;

    if (!grades.includes(grade)) {
        return {
            error: `Grade must be one of: ${grades.join(', ')}`
        };
    }

    if (!subject) {
        return {
            error: `Subject must be one of: ${subjectValues().join(
                ', '
            )}`
        };
    }

    if (
        !Number.isInteger(unit) ||
        unit < 1 ||
        unit > MAX_UNIT
    ) {
        return {
            error: `Unit must be a whole number between 1 and ${MAX_UNIT}`
        };
    }

    if (
        !Number.isInteger(lesson) ||
        lesson < 1 ||
        lesson > MAX_LESSON
    ) {
        return {
            error: `Lesson must be a whole number between 1 and ${MAX_LESSON}`
        };
    }

    if (title.length > MAX_TITLE_LENGTH) {
        return {
            error: `The title must be at most ${MAX_TITLE_LENGTH} characters`
        };
    }

    return {
        subject,
        grade,
        unit,
        lesson,
        title
    };
}

//a readable, collision-free object path
function buildStorageKey({
    subject,
    grade,
    unit,
    lesson,
    originalName
}) {
    const safeName =
        String(originalName || 'material.pdf')
            .toLowerCase()
            .replace(/[^a-z0-9.]+/g, '-')
            .replace(/^[-.]+|[-.]+$/g, '')
            .slice(-80) || 'material.pdf';

    const safeSubject =
        subject
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-') || 'subject';

    //A unit is part of the path for the same reason a subject is: two
    //units can each hold a lesson 1, and they should not look like the
    //same location.
    return [
        'materials',
        safeSubject,
        `grade-${grade}`,
        `unit-${String(unit).padStart(2, '0')}`,
        `lesson-${String(lesson).padStart(2, '0')}`,
        `${crypto.randomUUID()}-${safeName}`
    ].join('/');
}

//where a file belongs when it arrives in a lesson: after everything
//already there, so an upload never reorders the existing PDFs. The
//lesson is identified by subject + grade + unit + lesson, because a
//lesson number only means something inside its unit.
async function nextPositionFor({
    subject,
    grade,
    unit,
    lesson
}) {
    const lastInLesson = await LessonMaterial.findOne({
        subject,
        grade,
        unit,
        lesson
    }).sort({ position: -1 });

    return lastInLesson
        ? Number(lastInLesson.position || 0) + 1
        : 0;
}

//upload a PDF for a lesson
exports.createMaterial = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                message: 'Please upload a PDF or image file'
            });
        }

        //A PDF is stored as it arrived; an image becomes a PDF first, so
        //everything below works the same for both. A file that is neither
        //(or is corrupt) throws with a 400, which the catch below turns
        //into the response.
        const upload = await prepareUpload(req.file);

        const fields = parseMaterialFields(req.body);

        if (fields.error) {
            return res.status(400).json({
                message: fields.error
            });
        }

        const { subject, grade, unit, lesson } = fields;

        const title =
            fields.title ||
            stripExtension(upload.originalName) ||
            'Untitled material';

        const driver = getStorageDriver();

        const key = buildStorageKey({
            subject,
            grade,
            unit,
            lesson,
            originalName: upload.originalName
        });

        const { sizeBytes } = await driver.putObject({
            key,
            body: upload.buffer,
            contentType: upload.mimeType
        });

        //Read the lesson's text once here, so the AI assistant can answer
        //questions about it without re-parsing the PDF on every request.
        //A photo is read by the vision model instead, which is what makes
        //an image upload usable by the assistant at all.
        //
        //This is deliberately not fatal: an image-only or unreadable PDF
        //still uploads and previews, it simply has no AI assistant. The
        //same now applies to a photo the vision model could not read.
        let extractedText = '';

        //Only stamped once the read actually finished. An image-only PDF
        //finishes with no text and is stamped (there is nothing to retry),
        //while a thrown error leaves it null so the backfill script can try
        //again later.
        let textExtractedAt = null;

        try {
            extractedText = (
                await readUploadForAi(upload)
            ).slice(0, MAX_LESSON_TEXT);

            textExtractedAt = new Date();
        } catch (error) {
            console.warn(
                'Unable to read the lesson text for the AI assistant:',
                error.message
            );
        }

        const position = await nextPositionFor({
            subject,
            grade,
            unit,
            lesson
        });

        let material;

        try {
            material = await LessonMaterial.create({
                subject,
                grade,
                unit,
                lesson,
                title,
                position,

                storageKey: key,
                storageProvider: driver.provider,
                bucket: driver.bucket || '',

                mimeType: upload.mimeType,

                sizeBytes,
                originalName: upload.originalName,

                extractedText,
                textExtractedAt,

                //how the text above was read: a PDF is parsed, a photo is
                //read by the vision model
                sourceKind: upload.kind,

                uploadedBy: currentUserId(req)
            });
        } catch (error) {
            //never leave an orphaned object behind when the metadata
            //write fails
            await driver
                .deleteObject({ key })
                .catch((cleanupError) => {
                    console.error(
                        'Unable to clean up an orphaned object:',
                        cleanupError
                    );
                });

            throw error;
        }

        return res.status(201).json({
            message: 'PDF uploaded successfully',
            material: toMaterialSummary(material)
        });
    } catch (error) {
        console.error('Upload material error:', error);

        return res
            .status(error.status || 500)
            .json({
                message: error.status
                    ? error.message
                    : 'Unable to store that PDF',

                error: error.message
            });
    }
};

//list materials. Students are pinned to their own grade, everyone else can
//filter by subject, grade and lesson.
exports.listMaterials = async (req, res) => {
    try {
        const filter = {};

        if (req.query.subject) {
            const subject = normalizeSubject(
                req.query.subject
            );

            //an unknown subject is a client bug, and answering it with an
            //empty library would hide it
            if (!subject) {
                return res.status(400).json({
                    message: `Subject must be one of: ${subjectValues().join(
                        ', '
                    )}`
                });
            }

            filter.subject = subject;
        }

        if (req.query.grade) {
            filter.grade = String(
                req.query.grade
            ).trim();
        }

        if (req.query.unit) {
            const unit = Number(req.query.unit);

            if (Number.isInteger(unit)) {
                filter.unit = unit;
            }
        }

        if (req.query.lesson) {
            const lesson = Number(req.query.lesson);

            if (Number.isInteger(lesson)) {
                filter.lesson = lesson;
            }
        }

        scopeToUser(req, filter);

        const materials = await LessonMaterial.find(
            filter
        ).sort({ unit: 1, lesson: 1, position: 1, createdAt: 1 });

        return res.status(200).json({
            materials: materials.map(
                toMaterialSummary
            )
        });
    } catch (error) {
        console.error('List materials error:', error);

        return res.status(500).json({
            message: 'Unable to load materials',
            error: error.message
        });
    }
};

//a material the requester is allowed to see, or null. The id is a
//parameter rather than being read from req.params, so the quizzes
//controller can reuse the same grade scoping when the lesson id arrives
//in a request body instead of the URL.
async function findAccessibleMaterialById(req, id) {
    const filter = { _id: id };

    scopeToUser(req, filter);

    return LessonMaterial.findOne(filter);
}

async function findAccessibleMaterial(req) {
    return findAccessibleMaterialById(
        req,
        req.params.id
    );
}

//the metadata for one lesson, so a lesson page reached by a deep link (or
//a refresh) does not have to download the whole subject's library
exports.getMaterialById = async (req, res) => {
    try {
        const material =
            await findAccessibleMaterial(req);

        if (!material) {
            return res.status(404).json({
                message: 'Material not found'
            });
        }

        return res.status(200).json({
            material: toMaterialSummary(material)
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                message: 'That material id is not valid'
            });
        }

        console.error('Get material error:', error);

        return res.status(500).json({
            message: 'Unable to load that material',
            error: error.message
        });
    }
};

//hand out a short-lived url the browser can load directly
exports.getMaterialViewUrl = async (req, res) => {
    try {
        const material =
            await findAccessibleMaterial(req);

        if (!material) {
            return res.status(404).json({
                message: 'Material not found'
            });
        }

        const driver = getStorageDriver();

        const { url, expiresIn, provider } =
            await driver.createViewUrl({
                key: material.storageKey,
                expiresIn: VIEW_EXPIRES_IN,
                contentType: material.mimeType,
                fileName: material.title
            });

        return res.status(200).json({
            url,
            expiresIn,
            provider,
            material: toMaterialSummary(material)
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                message: 'That material id is not valid'
            });
        }

        console.error('Material view url error:', error);

        return res.status(500).json({
            message: 'Unable to open that PDF',
            error: error.message
        });
    }
};

//metadata updates; replacing the file itself is a delete and re-upload
exports.updateMaterial = async (req, res) => {
    try {
        const material = await LessonMaterial.findById(
            req.params.id
        );

        if (!material) {
            return res.status(404).json({
                message: 'Material not found'
            });
        }

        const fields = parseMaterialFields(req.body, {
            subject: material.subject,
            grade: material.grade,
            unit: material.unit,
            lesson: material.lesson,
            title: material.title
        });

        if (fields.error) {
            return res.status(400).json({
                message: fields.error
            });
        }

        //the group a file belongs to is subject + grade + unit + lesson,
        //and position is only meaningful inside it
        const groupChanged =
            String(fields.lesson) !==
                String(material.lesson) ||
            Number(fields.unit) !==
                Number(material.unit) ||
            fields.subject !== material.subject ||
            fields.grade !== material.grade;

        material.subject = fields.subject;
        material.grade = fields.grade;
        material.unit = fields.unit;
        material.lesson = fields.lesson;
        material.title = fields.title || material.title;

        //a file moved into another unit or lesson (or another subject)
        //joins the end of that group, so it cannot land on a position the
        //group is already using
        if (groupChanged) {
            material.position = await nextPositionFor({
                subject: fields.subject,
                grade: fields.grade,
                unit: fields.unit,
                lesson: fields.lesson
            });
        }

        await material.save();

        return res.status(200).json({
            message: 'Material updated successfully',
            material: toMaterialSummary(material)
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                message: 'That material id is not valid'
            });
        }

        console.error('Update material error:', error);

        return res.status(500).json({
            message: 'Unable to update that material',
            error: error.message
        });
    }
};

exports.deleteMaterial = async (req, res) => {
    try {
        const material = await LessonMaterial.findById(
            req.params.id
        );

        if (!material) {
            return res.status(404).json({
                message: 'Material not found'
            });
        }

        //delete the object first: if that fails the record survives, so
        //the admin can retry instead of losing the pointer to the file
        await getStorageDriver().deleteObject({
            key: material.storageKey
        });

        await material.deleteOne();

        return res.status(200).json({
            message: 'Material deleted successfully'
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                message: 'That material id is not valid'
            });
        }

        console.error('Delete material error:', error);

        return res.status(500).json({
            message: 'Unable to delete that material',
            error: error.message
        });
    }
};

//Deliver a file for the local driver's signed urls.
//
//This route deliberately has no Bearer check: the browser loads it from an
//iframe, which cannot send headers, so the signature in the query string is
//the credential. A bucket's own signed url (supabase) plays the same role
//and never reaches this handler.
exports.serveMaterialFile = async (req, res) => {
    try {
        const { key, expires, signature } = req.query;

        if (!key || !expires || !signature) {
            return res.status(400).json({
                message: 'This file link is not valid'
            });
        }

        if (Number(expires) * 1000 < Date.now()) {
            return res.status(410).json({
                message:
                    'This file link has expired. Reload the lesson to get a new one.'
            });
        }

        if (!verifySignature({ key, expires, signature })) {
            return res.status(403).json({
                message: 'This file link is not valid'
            });
        }

        //the key must belong to a real material, so a signed url cannot be
        //used to read arbitrary files out of the storage directory
        const material = await LessonMaterial.findOne({
            storageKey: key
        });

        if (!material) {
            return res.status(404).json({
                message: 'Material not found'
            });
        }

        const { stream, sizeBytes } =
            await getStorageDriver().createReadStream({
                key
            });

        res.setHeader(
            'Content-Type',
            material.mimeType || 'application/pdf'
        );

        res.setHeader(
            'Content-Disposition',
            `inline; filename="${safeFileName(
                material.title
            )}.pdf"`
        );

        //the url is short-lived, so nothing should cache it
        res.setHeader(
            'Cache-Control',
            'private, max-age=0, no-store'
        );

        if (Number.isFinite(sizeBytes)) {
            res.setHeader('Content-Length', sizeBytes);
        }

        stream.on('error', (error) => {
            console.error('Material stream error:', error);

            if (res.headersSent) {
                res.destroy(error);

                return;
            }

            res.status(500).json({
                message: 'Unable to read that file'
            });
        });

        stream.pipe(res);
    } catch (error) {
        console.error('Serve material error:', error);

        return res
            .status(error.status || 500)
            .json({
                message: error.status
                    ? error.message
                    : 'Unable to read that file',

                error: error.message
            });
    }
};

//Set the order of the PDFs inside one lesson.
//
//The client sends that lesson's ids in their new order, so the stored
//positions are always a clean 0..n-1 sequence: the order the admin sees
//is exactly the order students get, with no duplicates and no gaps.
exports.reorderMaterials = async (req, res) => {
    try {
        const { order } = req.body;

        //reuses the upload validation, so subject/grade/lesson are
        //checked the same way here as anywhere else
        const fields = parseMaterialFields(req.body);

        if (fields.error) {
            return res.status(400).json({
                message: fields.error
            });
        }

        if (!Array.isArray(order) || order.length === 0) {
            return res.status(400).json({
                message: 'An ordered list of PDF ids is required'
            });
        }

        const { subject, grade, unit, lesson } = fields;

        //the group being reordered is one lesson inside one unit
        const materials = await LessonMaterial.find({
            subject,
            grade,
            unit,
            lesson
        });

        const byId = new Map(
            materials.map((material) => [
                String(material._id),
                material
            ])
        );

        const requested = order.map(String);

        //The list has to name every file in the lesson exactly once. A
        //partial list would leave unlisted files sharing a position with
        //the ones that were moved.
        const isComplete =
            requested.length === materials.length &&
            new Set(requested).size === requested.length &&
            requested.every((id) => byId.has(id));

        if (!isComplete) {
            return res.status(400).json({
                message:
                    'The order must list every PDF in this lesson exactly once'
            });
        }

        requested.forEach((id, index) => {
            byId.get(id).position = index;
        });

        await Promise.all(
            materials.map((material) =>
                material.save()
            )
        );

        return res.status(200).json({
            message: 'Lesson order updated successfully',

            materials: requested.map((id) =>
                toMaterialSummary(byId.get(id))
            )
        });
    } catch (error) {
        console.error('Reorder materials error:', error);

        return res.status(500).json({
            message: 'Unable to reorder those PDFs',
            error: error.message
        });
    }
};

//Shared with the lesson AI and lesson quiz controllers, which have to
//resolve a lesson the same grade-scoped way.
exports.findAccessibleMaterialById =
    findAccessibleMaterialById;
