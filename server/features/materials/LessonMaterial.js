const mongoose = require('mongoose');

//Every subject the lesson library holds PDFs for. These exact strings are
//what the API stores and filters on, so a subject added here is
//immediately uploadable from the admin Subject Lessons page and visible
//on the matching student subject page. The enum is also what the
//controllers validate against, which means a typo can never create a
//library that no page can reach.
const LESSON_SUBJECTS = [
    'English',
    'Math',
    'Natural Sciences'
];

//grades match the classroom values on the user model
const lessonMaterialSchema = new mongoose.Schema(
    {
        subject: {
            type: String,
            required: true,
            trim: true,
            default: 'English',
            enum: LESSON_SUBJECTS
        },
        grade: {
            type: String,
            required: true,
            enum: ['12', '11', '10', '9']
        },

        //Which unit of the subject a PDF belongs to. The admin chooses it
        //on the upload form, and the student page renders exactly the
        //units that hold files: it is the top level of the structure, so
        //lesson 1 of unit 2 is a different lesson from lesson 1 of unit 1.
        //
        //Defaulted rather than required so material rows written before
        //units existed still load and save as unit 1 instead of failing
        //validation on an unrelated update.
        unit: {
            type: Number,
            default: 1,
            min: 1,
            max: 99
        },
        lesson: {
            type: Number,
            required: true,
            min: 1,
            max: 99
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },

        //Only the object's location and its metadata are stored here.
        //The bytes always live in the object store, never in MongoDB.
        storageKey: {
            type: String,
            required: true,
            trim: true
        },
        storageProvider: {
            type: String,
            required: true,
            trim: true
        },
        bucket: {
            type: String,
            default: '',
            trim: true
        },
        //filled in only when the bucket is served from a public base url;
        //private buckets get short-lived signed urls instead
        publicUrl: {
            type: String,
            default: '',
            trim: true
        },
        mimeType: {
            type: String,
            default: 'application/pdf',
            trim: true
        },
        sizeBytes: {
            type: Number,
            default: 0,
            min: 0
        },
        originalName: {
            type: String,
            default: '',
            trim: true
        },

        //The lesson's text, read out of the PDF once at upload time so the
        //AI assistant can answer questions and build flashcards and quizzes
        //from this lesson without re-parsing the file on every request.
        //An image-only PDF yields '', which simply switches the assistant
        //off for that lesson; the PDF itself still opens normally.
        extractedText: {
            type: String,
            default: ''
        },

        //when the text above was read, so an extraction that never ran can
        //be told apart from a PDF that genuinely holds no readable text
        textExtractedAt: {
            type: Date,
            default: null
        },

        //How the text above was read. 'pdf' means the uploaded file's own
        //text layer was parsed; 'image' means the upload was a photo, which
        //was turned into the stored PDF and read by the vision model.
        //
        //It matters to the backfill script: an image-origin lesson cannot
        //be re-read by parsing, so a textless row of that kind is reported
        //rather than quietly stamped as having been processed. Older rows
        //are all real PDFs, which is why the default is 'pdf'.
        sourceKind: {
            type: String,
            default: 'pdf',
            enum: ['pdf', 'image']
        },

        //Where the PDF sits inside its lesson: the lowest position is the
        //one students see as "PDF 1". A new upload is appended to the end
        //of its lesson and the admin reorders from there, so this is only
        //ever compared within one subject/grade/lesson group.
        position: {
            type: Number,
            default: 0,
            min: 0
        },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student_management',
            default: null
        }
    },
    { timestamps: true }
);

//the student view is always "one subject, one grade, in unit order, then
//lesson order, in the order the admin set". createdAt stays last so rows
//written before position existed still have a stable tiebreaker
lessonMaterialSchema.index({
    subject: 1,
    grade: 1,
    unit: 1,
    lesson: 1,
    position: 1,
    createdAt: 1
});

//signed local urls are resolved back to a material by key
lessonMaterialSchema.index({ storageKey: 1 });

module.exports = mongoose.model(
    'LessonMaterial',
    lessonMaterialSchema
);
