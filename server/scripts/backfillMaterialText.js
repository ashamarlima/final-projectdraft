#!/usr/bin/env node

//Read the AI text out of lesson files that were uploaded without it.
//
//Uploading a file now reads its text once and stores it on the material,
//which is what lets the assistant answer questions and build flashcards and
//quizzes for that lesson. Anything uploaded earlier has no text, so this
//script reads those files back out of storage and fills it in.
//
//There are two kinds of row, and they are read differently:
//
//  * a PDF is parsed for its text layer.
//
//  * a photo was read by the vision model at upload time, and a textless
//    row of that kind means the read failed -- the provider answers a burst
//    of traffic with a 503, and a burst outlasts an upload. The original
//    image is not kept, but the page is in storage as a PDF and the model
//    reads PDFs, so it is read from there. This is the same thing the
//    admin's "read with AI" action does for a single lesson.
//
//It is safe to run more than once: it only looks at rows whose text was
//never read (textExtractedAt is still null), and it stamps that field for
//every row it processes, so a file that genuinely holds no text is not
//re-read on the next run. A row that could not be read is left unstamped on
//purpose, so a later run picks it up.
//
//Usage:
//   node scripts/backfillMaterialText.js
//
//Uses the same server/.env as the app, because the bytes are fetched back
//through the configured storage driver and read with the same AI helpers.

const dotenv = require('dotenv');

dotenv.config();

const mongoose = require('mongoose');

const LessonMaterial = require('../features/materials/LessonMaterial');

const {
    getStorageDriver,
    readObjectBuffer
} = require('../shared/storage');

const { extractPdfText } = require('../shared/pdf');

const ai = require('../shared/ai');

//the same ceiling the upload path applies, for the same reason
const MAX_LESSON_TEXT = 200000;

function databaseUrl() {
    const url = process.env.Database_URL;

    const password =
        process.env.database_password;

    if (!url || !password) {
        console.error(
            'Database environment variables are missing from server/.env'
        );

        process.exit(1);
    }

    return url.replace('<DB_PASSWORD>', password);
}

async function backfill() {
    await mongoose.connect(databaseUrl());

    console.log('DB connection successful');

    //only the rows whose text was never read. Rows written by the new upload
    //path already carry a timestamp, and a PDF that held no text was
    //stamped too, so neither is touched.
    const materials = await LessonMaterial.find({
        $or: [
            { textExtractedAt: null },
            { textExtractedAt: { $exists: false } }
        ]
    });

    console.log(
        `Found ${materials.length} lesson(s) without extracted text.`
    );

    //One driver for the whole run. readObjectBuffer builds its own when it
    //is not given one, and this loop would otherwise rebuild it per row.
    const driver = getStorageDriver();

    let filled = 0;
    let empty = 0;
    let stamped = 0;
    let failed = 0;

    for (const material of materials) {
        const label =
            `${material.subject} grade-${material.grade} ` +
            `unit-${material.unit} lesson-${material.lesson} ` +
            `"${material.title}"`;

        //A row that already carries text only needs its stamp: the model
        //must not be asked to read a page that was read once already, and
        //overwriting the stored text would be a step backwards.
        if (String(material.extractedText || '').trim()) {
            material.textExtractedAt = new Date();

            await material.save();

            stamped++;

            console.log(
                `  stamped  ${label} (already has text)`
            );

            continue;
        }

        //how this file was read the first time decides how it is read
        //now: a photo has no text layer to parse
        const fromPhoto = material.sourceKind === 'image';

        try {
            const buffer = await readObjectBuffer(
                material.storageKey,
                driver
            );

            const text = (
                fromPhoto
                    ? await ai.transcribeDocument({
                        data: buffer.toString('base64'),
                        mimeType: 'application/pdf'
                    })
                    : await extractPdfText(buffer)
            ).slice(0, MAX_LESSON_TEXT);

            material.extractedText = text;

            //stamped even when the file had no text, so the next run skips
            //it: an image-only PDF is not going to gain a text layer
            material.textExtractedAt = new Date();

            await material.save();

            if (text) {
                filled++;

                console.log(
                    `  filled   ${label} (${text.length} chars` +
                        `${fromPhoto ? ', read from the stored page' : ''})`
                );
            } else {
                empty++;

                console.log(
                    `  no text  ${label}`
                );
            }
        } catch (error) {
            //left unstamped on purpose, so a retry can pick it up
            failed++;

            console.error(
                `  failed   ${label}: ${error.message}`
            );
        }
    }

    console.log(
        `Done. ${filled} filled, ${empty} without readable text, ` +
            `${stamped} already had text, ${failed} failed.`
    );

    await mongoose.disconnect();
}

backfill()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Backfill failed:', error);

        process.exit(1);
    });
