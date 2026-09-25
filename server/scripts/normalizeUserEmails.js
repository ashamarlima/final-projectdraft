#!/usr/bin/env node

//Lowercase the email on every user account.
//
//An email is the login identifier, and it now normalises to lowercase as it
//is written and as it is matched (see features/users/userModels.js), so
//'Admin@Gmail.com' and 'admin@gmail.com' are one account. Rows written
//before that setter existed hold whatever case was typed into the form,
//which is why someone who typed their address in a different case than the
//admin did was refused at login.
//
//This script rewrites those rows.
//
//One thing makes it more than a loop over a collection: two accounts whose
//emails differ only in case become the same address, and the unique index on
//email refuses the second one. Such a pair cannot be repaired automatically,
//because deciding which of the two accounts -- and which of its notes,
//attempts and marks -- survives is a human call. The pair is reported and
//both rows are left exactly as they are.
//
//It is safe to run more than once: a row that is already lowercase and
//trimmed is left alone, and a reported collision stays reported.
//
//Usage:
//   node scripts/normalizeUserEmails.js [--dry-run]
//
//--dry-run reports every change it would make without writing anything, which
//is worth doing first on a live database since this rewrites a login
//credential. Uses the same server/.env as the app.

const dotenv = require('dotenv');

dotenv.config();

const mongoose = require('mongoose');

const User = require('../features/users/userModels');

const DRY_RUN = process.argv.includes('--dry-run');

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

function label(user) {
    return `"${user.name}" <${user.email}>`;
}

async function normalize() {
    await mongoose.connect(databaseUrl());

    console.log('DB connection successful');

    //_id is always present and the other two are all the log needs. The
    //addresses are compared in memory rather than in a query, because any
    //query would be cast by the lowercase setter and could never match the
    //uppercase rows this script is looking for.
    const users = await User.find().select(
        '_id name email'
    );

    const planned = users.map((user) => {
        const current = String(user.email || '');

        return {
            user,
            current,

            //the same normalisation the schema now applies on write
            normalized: current.trim().toLowerCase()
        };
    });

    //Every account that would end up holding the same address. Empty
    //addresses group together too, which is fine: an account with no email
    //cannot be logged into either way.
    const holders = new Map();

    for (const entry of planned) {
        const found =
            holders.get(entry.normalized) || [];

        found.push(entry);

        holders.set(entry.normalized, found);
    }

    const conflicts = new Set(
        [...holders.entries()]
            .filter(([, accounts]) => accounts.length > 1)
            .map(([normalized]) => normalized)
    );

    let rewritten = 0;
    let unchanged = 0;
    let conflicted = 0;
    let failed = 0;

    for (const { user, current, normalized } of planned) {
        if (conflicts.has(normalized)) {
            conflicted++;

            console.error(
                `  conflict ${label(user)} would become "${normalized}", ` +
                    `which ${(holders.get(normalized) || []).length - 1} ` +
                    'other account(s) already use. Left alone.'
            );

            continue;
        }

        if (current === normalized) {
            unchanged++;

            continue;
        }

        if (DRY_RUN) {
            rewritten++;

            console.log(
                `  would rewrite ${label(user)} -> "${normalized}"`
            );

            continue;
        }

        try {
            //A targeted write rather than save(): the document was loaded
            //with a projection, and exactly one field is changing.
            await User.updateOne(
                { _id: user._id },
                { $set: { email: normalized } }
            );

            rewritten++;

            console.log(
                `  rewritten ${label(user)} -> "${normalized}"`
            );
        } catch (error) {
            //The unique index is the backstop for a collision the check
            //above missed (an account created while this was running).
            failed++;

            console.error(
                `  failed    ${label(user)}: ${error.message}`
            );
        }
    }

    console.log(
        `Done. ${rewritten} ${
            DRY_RUN ? 'to rewrite' : 'rewritten'
        }, ${unchanged} already lowercase, ` +
            `${conflicted} conflicted, ${failed} failed.`
    );

    if (DRY_RUN) {
        console.log('Dry run: nothing was written.');
    }

    if (conflicted > 0) {
        console.log(
            'A conflicted account still cannot log in with a differently cased ' +
                'address. Delete or rename the duplicate it shares an address ' +
                'with, then run this again.'
        );
    }

    await mongoose.disconnect();
}

normalize()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Email normalisation failed:', error);

        process.exit(1);
    });
