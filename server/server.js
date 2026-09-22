const dotenv = require('dotenv');

// 1. Configure environment variables first
dotenv.config();

const mongoose = require('mongoose');
const app = require('./app');

// 2. Check required environment variables
if (!process.env.GEMINI_API_KEY) {
  console.error(
    'GEMINI_API_KEY is missing from the .env file'
  );

  process.exit(1);
}

if (
  !process.env.Database_URL ||
  !process.env.database_password
) {
  console.error(
    'Database environment variables are missing'
  );

  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error(
    'JWT_SECRET is missing from the .env file'
  );

  process.exit(1);
}

// 3. Database Connection
const DB_URL = process.env.Database_URL.replace(
  '<DB_PASSWORD>',
  process.env.database_password
);

mongoose.connect(DB_URL)
  .then(() => {
    console.log('DB connection successful');

    // 4. Start server after database connects
    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(
        `Server is running on port ${PORT}`
      );
    });
  })
  .catch((err) => {
    console.error(
      'DB connection error:',
      err
    );

    process.exit(1);
  });