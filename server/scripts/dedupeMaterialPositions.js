#!/usr/bin/env node

//Give every lesson a clean set of PDF positions.
//
//A position orders the PDFs inside one lesson, and the unique index on the
//lesson group is what stops two files claiming the same one (see
//features/materials/LessonMaterial.js). That index cannot be built while a
//duplicate is in the collection: MongoDB refuses it and Mongoose logs the
//failure, so the guarantee is quietly absent and the app carries on with
//the old behaviour.
//
//A duplicate is only reachable through the race the index now prevents, so
//this script exists to clear the rows written before it. Uploading retries
//against the index instead, so no new duplicate can appear.
//
//It is safe to run more than once: a lesson that is already a clean 0..n-1
//sequence is left alone.
//
//Usage:
//   node scripts/dedupeMaterialPositions.js
//
//Restart the server afterwards so the unique index is created.

const dotenv = require('dotenv');

dotenv.config();

const mongoose = require('mongoose');

const LessonMaterial = require('../features/materials/LessonMaterial');

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

function label(group) {
    return (
        `${group.subject} grade-${group.grade} ` +
        `unit-${group.unit} lesson-${group.lesson}`
    );
}

async function repair() {
    await mongoose.connect(databaseUrl());

    console.log('DB connection successful');

    //Grouped in the database rather than in memory, so the check sees
    //every row regardless of how large the library is.
    const groups = await LessonMaterial.aggregate([
        {
            $group: {
                _id: {
                    subject: '$subject',
                    grade: '$grade',
                    unit: '$unit',
                    lesson: '$lesson'
                },
                positions: { $push: '$position' },
                count: { $sum: 1 }
            }
        }
    ]);

    let checked = 0;
    let repaired = 0;

    for (const group of groups) {
        checked++;

        const positions = group.positions || [];

        //a clean sequence has no repeats, which is exactly what the unique
        //index demands
        if (
            new Set(positions).size === positions.length
        ) {
            continue;
        }

        const key = group._id;

        //The rows are read in the order they are meant to keep -- their
        //current position, then oldest first -- so the repair preserves
        //what the admin already sees rather than inventing an order.
        const materials = await LessonMaterial.find(
            key
        ).sort({ position: 1, createdAt: 1 });

        //Two phases for the same reason the reorder endpoint uses two:
        //writing 0..n-1 straight away would collide with the rows still
        //holding those values. Every row moves above the group's current
        //range first, which nothing held can clash with.
        const offset =
            Math.max(
                ...materials.map((material) =>
                    Number(material.position) || 0
                )
            ) + 1;

        await Promise.all(
            materials.map((material, index) => {
                material.position = offset + index;

                return material.save();
            })
        );

        await Promise.all(
            materials.map((material, index) => {
                material.position = index;

                return material.save();
            })
        );

        repaired++;

        console.log(
            `  repaired ${label(key)} ` +
                `(${materials.length} PDFs, was ${positions.join(', ')})`
        );
    }

    console.log(
        `Done. ${repaired} lesson(s) repaired out of ${checked} checked.`
    );

    if (repaired > 0) {
        console.log(
            'Restart the server so the unique position index is created.'
        );
    }

    await mongoose.disconnect();
}

repair()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Position repair failed:', error);

        process.exit(1);
    });
