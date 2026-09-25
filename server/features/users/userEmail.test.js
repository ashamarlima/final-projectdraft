//Unit tests for the user schema's email handling.
//
//An email is the login identifier, so it is normalised on the way in and on
//the way out: an address typed as 'Priya@School.com' has to reach the
//account the admin created as 'priya@school.com'.
//
//This file deliberately loads the real model rather than stubbing it in
//require.cache the way the endpoint suites in this directory do, because
//what is under test lives in the schema itself. No database is needed:
//Mongoose normalises in memory as a document is built and as a query filter
//is cast, so nothing here connects.
//
//Run with: npm test

const { test } = require('node:test');

const assert =
    require('node:assert/strict');

const User = require('./userModels');

const emailPath = () => User.schema.path('email');

test(
    'an email is trimmed and lowercased as a document is built',
    () => {
        const user = new User({
            name: 'A Student',
            email: '  Priya@School.COM  ',
            phone: '0000000000',
            password: 'hashed'
        });

        assert.equal(user.email, 'priya@school.com');
    }
);

test(
    'an email is lowercased when a query filter is cast, which is what makes login case-insensitive',
    () => {
        //The login lookup is `User.findOne({ email: email.trim() })` with
        //whatever the student typed, and it is never lowercased by hand.
        //Mongoose runs the schema setters while casting that filter, which
        //is the assumption this test exists to protect.
        //
        //Note that `getFilter()` returns the filter *before* casting and so
        //still shows the original casing. `_castConditions()` is the
        //internal step that applies the setter, and what it produces is the
        //filter the driver is given. Pinning an internal hook is deliberate:
        //if a Mongoose upgrade stops normalising query filters, this test
        //fails here rather than as a mystery 401 in front of a student.
        const query = User.find({
            email: 'Admin@Gmail.COM'
        });

        query._castConditions();

        assert.equal(
            query._conditions.email,
            'admin@gmail.com'
        );
    }
);

test(
    'email stays required and unique, so normalisation cannot quietly merge two accounts',
    () => {
        assert.equal(
            emailPath().options.required,
            true
        );

        assert.equal(
            emailPath().options.unique,
            true
        );
    }
);
