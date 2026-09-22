const dotenv = require('dotenv');
dotenv.config();

const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./features/users/userModels');

if (!process.env.Database_URL || !process.env.database_password) {
    console.error(
        'Database environment variables are missing from server/.env'
    );

    process.exit(1);
}

const DATABASE_URL = process.env.Database_URL.replace(
    '<DB_PASSWORD>',
    process.env.database_password
);

async function seedAdmin() {
    await mongoose.connect(DATABASE_URL);
    console.log('DB connection successful');

    const email = (
        process.env.SEED_ADMIN_EMAIL || 'admin@gmail.com'
    )
        .toLowerCase()
        .trim();

    const name = process.env.SEED_ADMIN_NAME || 'System Admin';
    const phone = process.env.SEED_ADMIN_PHONE || '0000000000';
    const classroom = process.env.SEED_ADMIN_CLASSROOM || '9';
    const password =
        process.env.SEED_ADMIN_PASSWORD ||
        crypto.randomBytes(9).toString('hex');

    const existing = await User.findOne({ email });

    if (existing) {
        console.log(
            `An account with email "${email}" already exists. Nothing to do.`
        );

        if (existing.role !== 'admin') {
            console.log(
                'That account is not an admin. Delete it or use a different SEED_ADMIN_EMAIL.'
            );
        }

        await mongoose.disconnect();
        return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await User.create({
        name,
        email,
        phone,
        password: hashedPassword,
        role: 'admin',
        status: 'active',
        classroom
    });

    console.log('Admin account created successfully:');
    console.log(`  Name:     ${name}`);
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password}`);
    console.log(
        'Override the defaults with SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PHONE and SEED_ADMIN_PASSWORD in server/.env'
    );

    await mongoose.disconnect();
}

seedAdmin()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Seed failed:', error);
        process.exit(1);
    });
