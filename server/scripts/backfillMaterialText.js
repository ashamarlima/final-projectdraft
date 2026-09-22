#!/usr/bin/env node

//Read the AI text out of lesson PDFs that were uploaded before the lesson
//assistant existed.
//
//Uploading a PDF now extracts its text once and stores it on the material,
//which is what lets the assistant answer questions and build flashcards and
//quizzes for that lesson. Anything uploaded earlier has no text, so this
//script reads those PDFs back out of storage and fills it in.
//
//It is safe to run more than once: it only looks at rows whose text was
//never read (textExtractedAt is still null), and it stamps that field for
//every row it processes, so a PDF that genuinely holds no text is not
//re-read on the next run.
//
//Rows uploaded as photos are the one exception. Their text came from the
//vision model rather than from parsing, and the original image is not
//kept, so those are reported and left alone instead of being stamped.
//
//Usage:
//   node scripts/backfillMaterialText.js
//
//Uses the same server/.env as the app, because the bytes are fetched back
//through the configured storage driver.

const dotenv = require('dotenv');

dotenv.config();

const mongoose = require('mongoose');

const LessonMaterial = require('../features/materials/LessonMaterial');

const { getStorageDriver } = require('../shared/storage');

const { extractPdfText } = require('../shared/pdf');

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

//collect one stored object into a single buffer
async function readStoredObject(key) {
    const { stream } =
        await getStorageDriver().createReadStream({
            key
        });

    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
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

    let filled = 0;
    let empty = 0;
    let skipped = 0;
    let failed = 0;

    for (const material of materials) {
        const label =
            `${material.subject} grade-${material.grade} ` +
            `unit-${material.unit} lesson-${material.lesson} ` +
            `"${material.title}"`;

        //An image-origin lesson was read by the vision model, and the
        //original photo is not kept, so this script cannot read it: the
        //stored PDF has no text layer to parse. A textless row of that
        //kind means the vision read failed at upload time, and re-uploading
        //the page is the only way to fill it in. Stamping it here would
        //claim it had been processed as a PDF.
        if (
            material.sourceKind === 'image' &&
            !String(material.extractedText || '').trim()
        ) {
            skipped++;

            console.log(
                `  skipped  ${label} (photo: re-upload to read it)`
            );

            continue;
        }

        try {
            const buffer = await readStoredObject(
                material.storageKey
            );

            const text = (
                await extractPdfText(buffer)
            ).slice(0, MAX_LESSON_TEXT);

            material.extractedText = text;

            //stamped even when the PDF had no text, so the next run skips it
            material.textExtractedAt = new Date();

            await material.save();

            if (text) {
                filled++;

                console.log(
                    `  filled   ${label} (${text.length} chars)`
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
            `${skipped} photos skipped, ${failed} failed.`
    );

    await mongoose.disconnect();
}

backfill()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Backfill failed:', error);

        process.exit(1);
    });
