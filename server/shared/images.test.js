//Unit tests for shared/images.js: what counts as an uploaded image, what
//the conversion produces, and the copy handed to the vision model.
//
//sharp and pdf-lib are the real thing here -- neither needs a network or a
//database -- so the format coverage is genuine rather than mocked. The few
//formats sharp cannot write (BMP, HEIC) are covered with hand-built
//headers, because detection is about the bytes rather than about decoding
//them.
//
//Run with: npm test

const { test } = require('node:test');

const assert =
    require('node:assert/strict');

const sharp = require('sharp');

const { PDFDocument } = require('pdf-lib');

const {
    IMAGE_MIME_TYPES,
    detectRasterImage,
    imageToPdf,
    imageForAi,
    imageReadError
} = require('./images');

//A real 2x2 PNG, encoded for the tests: the formats below are built from
//it so that every fixture is a genuine image.
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
    'base64'
);

const raster = (width, height) =>
    sharp({
        create: {
            width,
            height,
            channels: 3,
            background: '#cccccc'
        }
    })
        .jpeg()
        .toBuffer();

//an ISO base media header: box size, then 'ftyp', then the brand
const isoBrand = (brand) => {
    const buffer = Buffer.alloc(16);

    buffer.write('ftyp', 4, 'latin1');
    buffer.write(brand, 8, 'latin1');

    return buffer;
};

//------------------------------------------------------------
//detection
//------------------------------------------------------------

test('detects each format from its own bytes', async () => {
    assert.equal(detectRasterImage(PNG), 'png');

    assert.equal(
        detectRasterImage(
            await sharp(PNG).jpeg().toBuffer()
        ),
        'jpeg'
    );

    assert.equal(
        detectRasterImage(
            await sharp(PNG).webp().toBuffer()
        ),
        'webp'
    );

    assert.equal(
        detectRasterImage(
            await sharp(PNG).gif().toBuffer()
        ),
        'gif'
    );

    assert.equal(
        detectRasterImage(
            await sharp(PNG).tiff().toBuffer()
        ),
        'tiff'
    );

    //sharp has no BMP or HEIF writer, but the header is all that matters
    //to detection
    const bmp = Buffer.alloc(16);

    bmp.write('BM', 0, 'latin1');

    assert.equal(detectRasterImage(bmp), 'bmp');
    assert.equal(detectRasterImage(isoBrand('heic')), 'heic');
    assert.equal(detectRasterImage(isoBrand('mif1')), 'heic');
    assert.equal(detectRasterImage(isoBrand('avif')), 'avif');
});

test('anything that is not an image is not detected as one', () => {
    assert.equal(
        detectRasterImage(
            Buffer.from('%PDF-1.4\n1 0 obj\n')
        ),
        null
    );

    assert.equal(
        detectRasterImage(
            Buffer.from('just some plain text')
        ),
        null
    );

    //an MP4 is an ISO base media file too, but not an image brand
    assert.equal(
        detectRasterImage(isoBrand('isom')),
        null
    );

    //too short to hold a signature
    assert.equal(detectRasterImage(Buffer.from('PNG')), null);
    assert.equal(detectRasterImage(Buffer.alloc(0)), null);

    //not a buffer at all
    assert.equal(detectRasterImage('a string'), null);
    assert.equal(detectRasterImage(null), null);
});

test('the accepted mime types cover what the converters handle', () => {
    for (const type of [
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/avif',
        'image/heic',
        'image/heif',
        'image/gif',
        'image/tiff',
        'image/bmp'
    ]) {
        assert.ok(
            IMAGE_MIME_TYPES.includes(type),
            `${type} should be accepted`
        );
    }
});

//------------------------------------------------------------
//conversion
//------------------------------------------------------------

test('a portrait image becomes a portrait A4 page', async () => {
    const pdf = await imageToPdf(
        await raster(200, 400)
    );

    assert.equal(
        pdf.subarray(0, 5).toString(),
        '%PDF-'
    );

    const document = await PDFDocument.load(pdf);

    assert.equal(document.getPageCount(), 1);

    const [page] = document.getPages();

    //A4 portrait, in points
    assert.ok(
        Math.abs(page.getWidth() - 595.28) < 0.01
    );

    assert.ok(
        Math.abs(page.getHeight() - 841.89) < 0.01
    );
});

test('a wide image becomes a landscape page', async () => {
    const pdf = await imageToPdf(
        await raster(800, 200)
    );

    const document = await PDFDocument.load(pdf);
    const [page] = document.getPages();

    //the page turns to suit the image, so it is not lost in a sea of
    //white space
    assert.ok(page.getWidth() > page.getHeight());

    assert.ok(
        Math.abs(page.getWidth() - 841.89) < 0.01
    );

    assert.ok(
        Math.abs(page.getHeight() - 595.28) < 0.01
    );
});

test('a square image becomes a portrait page', async () => {
    const pdf = await imageToPdf(
        await raster(300, 300)
    );

    const document = await PDFDocument.load(pdf);
    const [page] = document.getPages();

    assert.ok(page.getWidth() < page.getHeight());
});

test('an image sharp cannot read is a 400, not a crash', async () => {
    //the PNG signature is intact, so this passes detection and only fails
    //when the bytes are actually decoded
    const corrupt = Buffer.concat([
        PNG.subarray(0, 8),
        Buffer.from('not really a png, whatever the header says')
    ]);

    await assert.rejects(
        () => imageToPdf(corrupt),
        (error) => error.status === 400
    );

    await assert.rejects(
        () => imageForAi(corrupt),
        (error) => error.status === 400
    );
});

//------------------------------------------------------------
//the copy sent to the model
//------------------------------------------------------------

test('the vision copy is a JPEG capped in size', async () => {
    const large = await raster(4000, 3000);

    const { mimeType, data } = await imageForAi(large);

    //one known format, because Gemini's list is narrower than sharp's
    assert.equal(mimeType, 'image/jpeg');

    const bytes = Buffer.from(data, 'base64');

    //and small, because an inline request is capped and billed by size
    assert.ok(
        bytes.length < 500 * 1024,
        `expected under 500KB, got ${bytes.length}`
    );

    const metadata = await sharp(bytes).metadata();

    assert.equal(
        Math.max(metadata.width, metadata.height),
        1600
    );

    //the aspect ratio survives the downscale
    assert.equal(metadata.width, 1600);
    assert.equal(metadata.height, 1200);
});

test('a small image is sent as it is, not enlarged', async () => {
    const { data } = await imageForAi(PNG);

    const metadata = await sharp(
        Buffer.from(data, 'base64')
    ).metadata();

    assert.equal(metadata.width, 2);
    assert.equal(metadata.height, 2);
});

//------------------------------------------------------------
//the error helper
//------------------------------------------------------------

test('a HEIC photo says what to do instead', () => {
    //sharp's packaged libvips decodes AVIF but not HEVC, which is what an
    //iPhone writes in "High Efficiency" mode. The codec error libheif
    //reports is the one string that can be turned into advice.
    const heic = imageReadError(
        new Error(
            'heif: Unsupported feature: Unsupported codec (4.3000)'
        )
    );

    assert.equal(heic.status, 400);

    assert.ok(
        heic.message.includes('JPEG'),
        'the message should name a format that does work'
    );

    //a broken HEIF file is a different problem, and is not blamed on the
    //codec
    assert.equal(
        imageReadError(
            new Error('heifload: Input buffer has corrupt header')
        ).message,
        'That image could not be read. It may be corrupt, or renamed from another format.'
    );

    //and AVIF, which does decode, is never reported this way
    assert.equal(
        imageReadError(
            new Error('heifload: unable to load metadata')
        ).message.includes('HEIC'),
        false
    );
});

test('imageReadError always carries a 400', () => {
    //no argument: the bytes are simply not an image
    assert.equal(imageReadError().status, 400);

    assert.equal(
        imageReadError(
            new Error('Input buffer contains unsupported image format')
        ).status,
        400
    );

    //the too-large case is the one failure that is not the file's fault,
    //so it gets its own wording
    assert.equal(
        imageReadError(
            new Error('Input image exceeds pixel limit')
        ).message,
        'That image is too large to process'
    );

    assert.equal(
        imageReadError(
            new Error('Input image exceeds pixel limit')
        ).status,
        400
    );

    //anything unrecognised still reports the uploader's problem
    assert.equal(
        imageReadError(new Error('something else')).status,
        400
    );
});

test('an image whose header claims a huge canvas is refused', async () => {
    //A tiny file claiming an enormous canvas is the classic way to make a
    //server allocate its way to death. sharp refuses it before decoding
    //(its own pixel limit, or the header check), and either way it comes
    //back as the uploader's 400 rather than a crash or a stall.
    const small = await sharp({
        create: {
            width: 10,
            height: 10,
            channels: 3,
            background: '#ffffff'
        }
    })
        .png()
        .toBuffer();

    //the PNG header sits at bytes 16-23
    const bomb = Buffer.from(small);

    bomb.writeUInt32BE(0x7fffffff, 16);
    bomb.writeUInt32BE(0x7fffffff, 20);

    await assert.rejects(
        () => imageToPdf(bomb),
        (error) => error.status === 400
    );

    await assert.rejects(
        () => imageForAi(bomb),
        (error) => error.status === 400
    );
});
