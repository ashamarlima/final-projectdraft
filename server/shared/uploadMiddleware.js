const multer = require('multer');

const { IMAGE_MIME_TYPES } = require('./images');

const MEGABYTE = 1024 * 1024;

const NOTE_FILE_SIZE = 10 * MEGABYTE;
const MATERIAL_FILE_SIZE = 25 * MEGABYTE;

const NOTE_TYPES = [
    'application/pdf',
    'text/plain',

    ...IMAGE_MIME_TYPES
];

//a lesson can be a PDF, or a photo of a page, which the material
//controller turns into a PDF before storing it
const MATERIAL_TYPES = [
    'application/pdf',

    ...IMAGE_MIME_TYPES
];

//Build an uploader that keeps the file in memory: it is only needed long
//enough to extract its text or stream it to storage, so nothing has to be
//written to disk here.
//
//Note that file.mimetype is whatever the client declared, so it is a
//usability check rather than a security one -- callers that care should
//also look at the file's own bytes.
function createUploader({
    allowedTypes,
    maxFileSize,
    unsupportedMessage
}) {
    return multer({
        storage: multer.memoryStorage(),

        limits: {
            fileSize: maxFileSize
        },

        fileFilter: (req, file, cb) => {
            if (allowedTypes.includes(file.mimetype)) {
                return cb(null, true);
            }

            const error = new Error(
                unsupportedMessage
            );

            //read by the central error handler in app.js
            error.status = 400;

            cb(error);
        }
    });
}

//student notes: PDF, plain text or an image of a page
const noteUpload = createUploader({
    allowedTypes: NOTE_TYPES,
    maxFileSize: NOTE_FILE_SIZE,
    unsupportedMessage:
        'Only PDF, plain text and image files are supported'
});

//lesson materials: PDF, or an image that is converted to one
const materialUpload = createUploader({
    allowedTypes: MATERIAL_TYPES,
    maxFileSize: MATERIAL_FILE_SIZE,
    unsupportedMessage:
        'Only PDF and image files are supported'
});

module.exports = {
    createUploader,
    noteUpload,
    materialUpload
};
