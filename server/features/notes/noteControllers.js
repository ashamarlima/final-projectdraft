const Note = require('./Note');

const { extractPdfText } = require('../../shared/pdf');

const {
    IMAGE_MIME_TYPES,
    detectRasterImage,
    imageForAi,
    imageReadError
} = require('../../shared/images');

const ai = require('../../shared/ai');

const PREVIEW_LENGTH = 160;

//the logged-in user's id, however the auth middleware exposes it
function currentUserId(req) {
    return req.user?._id || req.user?.id;
}

//pull readable text out of the uploaded buffer. The PDF details live in
//shared/pdf.js, because lesson materials read PDFs the same way.
//
//An image is read by the vision model, because there is nothing to decode
//out of it. Unlike a lesson material, a note is never stored as a file:
//it keeps only the text below, so a photo does not need to be turned into
//a PDF here -- the transcription is the whole point of accepting it.
async function extractText(file) {
    const rasterFormat = detectRasterImage(
        file.buffer
    );

    //A real image whose declared type is wrong is still read as an image,
    //because the bytes are the better authority. An upload that *claims*
    //to be an image but is not one is a broken file rather than a text
    //note, so it is rejected instead of being decoded into rubbish.
    if (
        rasterFormat ||
        IMAGE_MIME_TYPES.includes(file.mimetype)
    ) {
        if (!rasterFormat) {
            throw imageReadError();
        }

        return ai.transcribeImage(
            await imageForAi(file.buffer)
        );
    }

    if (file.mimetype === 'application/pdf') {
        return extractPdfText(file.buffer);
    }

    return file.buffer
        .toString('utf-8')
        .trim();
}

//list view: keep the full note text on the server, send a preview
function toNoteSummary(note) {
    const text = note.extractedText || '';

    return {
        _id: note._id,
        title: note.title,
        preview: text.slice(0, PREVIEW_LENGTH),
        characters: text.length,
        createdAt: note.createdAt
    };
}

//upload a PDF or text file and store its extracted text
exports.uploadNote = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                message:
                    'Please upload a PDF, image or plain text file'
            });
        }

        const extractedText = await extractText(
            req.file
        );

        if (!extractedText) {
            return res.status(400).json({
                message:
                    'No readable text could be extracted from that file'
            });
        }

        const title =
            (
                req.body.title ||
                req.file.originalname ||
                ''
            ).trim() || 'Untitled note';

        const note = await Note.create({
            user: currentUserId(req),
            title,
            extractedText
        });

        return res.status(201).json({
            message: 'Note uploaded successfully',
            note: toNoteSummary(note)
        });

    } catch (error) {
        console.error(
            'Upload note error:',
            error
        );

        //a known bad-file problem (400) is safe to show the user;
        //anything unexpected stays a generic 500
        return res
            .status(error.status || 500)
            .json({
                message: error.status
                    ? error.message
                    : 'Unable to process that file'
            });
    }
};

//single note, used by the /notes/:id page so a deep link does
//not have to download every note
exports.getNoteById = async (req, res) => {
    try {
        const note = await Note.findOne({
            _id: req.params.id,
            user: currentUserId(req)
        });

        if (!note) {
            return res.status(404).json({
                message: 'Note not found'
            });
        }

        return res.status(200).json({
            note: toNoteSummary(note)
        });

    } catch (error) {
        //a malformed id is a client error, anything else is not
        if (error.name === 'CastError') {
            return res.status(400).json({
                message: 'That note id is not valid'
            });
        }

        console.error('Get note error:', error);

        return res.status(500).json({
            message: 'Unable to load that note'
        });
    }
};

//list the logged-in student's notes, newest first
exports.getNotes = async (req, res) => {
    try {
        const notes = await Note.find({
            user: currentUserId(req)
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            notes: notes.map(toNoteSummary)
        });

    } catch (error) {
        console.error('Get notes error:', error);

        return res.status(500).json({
            message: 'Unable to load notes'
        });
    }
};
//delete a note
exports.deleteNote = async (req, res) => {
    try {
        const note = await Note.findOneAndDelete({
            _id: req.params.id,
            user: currentUserId(req)
        });

        if (!note) {
            return res.status(404).json({
                message: 'Note not found'
            });
        }

        return res.status(200).json({
            message: 'Note deleted successfully'
        });
        
    } catch (error) {
        //a malformed id is a client error, anything else is not
        if (error.name === 'CastError') {
            return res.status(400).json({
                message: 'That note id is not valid'
            });
        }

        console.error('Delete note error:', error);

        return res.status(500).json({
            message: 'Unable to delete that note'
        });
    }
};

