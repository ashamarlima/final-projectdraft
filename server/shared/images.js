//Uploaded raster images.
//
//A lesson page is often photographed rather than scanned, and a student's
//notes are often a picture of a page or a screenshot. Two things have to
//happen to such a file before the rest of the app can treat it like a PDF:
//
//  1. it becomes a one-page PDF, so storage, the viewer and the download
//     naming stay identical for both kinds of upload. Nothing downstream
//     needs to know the file arrived as a photo.
//
//  2. It has to be read, because a PDF wrapped around a photo has no text
//     layer: pdf-parse finds nothing in one, and the AI assistant would
//     stay switched off for that lesson. The reading is done by the vision
//     model (transcribeImage in shared/ai.js), which is why the image is
//     also handed out here as a compact JPEG -- Gemini's own format list
//     is narrower than sharp's, and an inline request has to stay small.
//
//sharp does the decoding: it covers everything a browser can produce
//(PNG, JPEG, WEBP, AVIF, GIF, TIFF, BMP), while pdf-lib can only embed PNG
//and JPEG bytes.
//
//HEIC is the exception, and it is worth knowing why: sharp's packaged
//libvips leaves out the HEVC decoder for licensing reasons, so an iPhone
//photo saved in "High Efficiency" mode cannot be read here and is refused
//with a message that says what to do instead (see imageReadError).

const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

//A4 in PDF points, at 72 points to the inch
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

//inset from the page edge, so a printed page is not edge to edge
const PAGE_MARGIN = 24;

//Quality for the PDF copy of a photo: high enough that small print stays
//sharp, low enough that a phone photo does not turn into a huge PDF
const PDF_JPEG_QUALITY = 90;

//The longest edge handed to the vision model, and its JPEG quality. A
//12-megapixel photo is several megabytes, which is slow to send inline
//and billed by size; this keeps the request small while staying legible.
const AI_MAX_EDGE = 1600;
const AI_JPEG_QUALITY = 80;

//The image types the upload filters let through. These are the client's
//declared types, so this is a usability check rather than a security one
//(the bytes decide further down, in detectRasterImage) -- and it is
//deliberately generous, because the same file is labelled differently by
//different browsers and operating systems.
const IMAGE_MIME_TYPES = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/avif',
    'image/heic',
    'image/heif',
    'image/gif',
    'image/tiff',
    'image/bmp'
];

const PNG_SIGNATURE = Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a
]);

//ISO base media brands that mean "this is a still image". Photos taken on
//a phone arrive as one of these.
const IMAGE_BRANDS = [
    'heic',
    'heix',
    'hevc',
    'heim',
    'heis',
    'hevm',
    'hevs',
    'heif',
    'mif1',
    'msf1',
    'avif'
];

//The format of an uploaded image, decided by its bytes. Returns null when
//the buffer is not an image at all.
//
//file.mimetype is only the client's claim (see shared/uploadMiddleware.js),
//so the bytes are what these functions trust.
function detectRasterImage(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
        return null;
    }

    if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
        return 'png';
    }

    //every JPEG begins with a start-of-image marker
    if (
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
    ) {
        return 'jpeg';
    }

    const header = (start, end) =>
        buffer.subarray(start, end).toString('latin1');

    const gif = header(0, 6);

    if (gif === 'GIF87a' || gif === 'GIF89a') {
        return 'gif';
    }

    //RIFF....WEBP
    if (
        header(0, 4) === 'RIFF' &&
        header(8, 12) === 'WEBP'
    ) {
        return 'webp';
    }

    //Windows bitmap
    if (header(0, 2) === 'BM') {
        return 'bmp';
    }

    //TIFF, in either byte order
    if (
        header(0, 4) === 'II*\u0000' ||
        header(0, 4) === 'MM\u0000*'
    ) {
        return 'tiff';
    }

    //HEIC/HEIF/AVIF are ISO base media files: a box size, then 'ftyp',
    //then the brand that names the format
    if (header(4, 8) === 'ftyp') {
        const brand = header(8, 12);

        if (IMAGE_BRANDS.includes(brand)) {
            return brand === 'avif' ? 'avif' : 'heic';
        }
    }

    return null;
}

//what the uploader is told when the bytes are not an image at all
const NOT_AN_IMAGE_MESSAGE =
    'That image could not be read. It may be corrupt, or renamed from another format.';

//Turn a sharp failure into a clear message carrying a 400, so the
//uploader is told the image is the problem rather than seeing a 500.
//Mirrors pdfReadError in shared/pdf.js.
function imageReadError(error) {
    const reason = String(error?.message || '');

    //HEIC is the one format the converters cannot manage here. sharp's
    //packaged libvips decodes AVIF but not HEVC (it is patent encumbered
    //and left out of the prebuilt binaries), which is the codec an iPhone
    //uses when it is set to "High Efficiency". Saying so -- and saying
    //what to do about it -- beats passing libheif's code number on to a
    //teacher.
    if (/unsupported codec|unsupported compression/i.test(reason)) {
        return Object.assign(
            new Error(
                'That HEIC photo cannot be read here. Export or save it as a JPEG (on an iPhone: camera settings, "Most Compatible") and upload that instead.'
            ),
            { status: 400 }
        );
    }

    //Called with no error at all when the caller already knows these
    //bytes are not an image (detectRasterImage found nothing). sharp says
    //much the same thing with "unsupported image format" when they merely
    //look like one: the magic bytes can be right while the rest of the
    //file is broken.
    if (
        !error ||
        /unsupported image format|corrupt header/i.test(reason)
    ) {
        return Object.assign(
            new Error(NOT_AN_IMAGE_MESSAGE),
            { status: 400 }
        );
    }

    //sharp refuses an image with an absurd number of pixels before it
    //decodes it, which is what stops a decompression bomb
    if (/pixel limit|exceeds|too large/i.test(reason)) {
        return Object.assign(
            new Error('That image is too large to process'),
            { status: 400 }
        );
    }

    return Object.assign(
        new Error(
            `That image could not be read: ${reason || 'unknown error'}`
        ),
        { status: 400 }
    );
}

//Decode an image once, apply its EXIF rotation, and encode it in a form
//pdf-lib can embed: PNG when there is transparency to keep, JPEG (which
//is far smaller) for everything else.
async function rasterise(buffer) {
    let metadata;

    try {
        metadata = await sharp(buffer).metadata();
    } catch (error) {
        throw imageReadError(error);
    }

    if (!metadata.width || !metadata.height) {
        throw imageReadError();
    }

    //a screenshot or a logo keeps its transparency, a photo has none
    const keepAlpha = Boolean(metadata.hasAlpha);

    try {
        const { data, info } = await sharp(buffer)
            //A photo is usually stored sideways with an EXIF orientation
            //tag. Applying it here means the PDF and the vision model
            //both see the page the right way up.
            .rotate()
            .toFormat(
                keepAlpha ? 'png' : 'jpeg',
                keepAlpha
                    ? {}
                    : { quality: PDF_JPEG_QUALITY }
            )
            .toBuffer({ resolveWithObject: true });

        return {
            data,
            width: info.width,
            height: info.height,
            embedAs: keepAlpha ? 'png' : 'jpeg'
        };
    } catch (error) {
        throw imageReadError(error);
    }
}

//Turn an uploaded image into a one-page PDF: the image is scaled to fit an
//A4 page, in whichever orientation suits it, and centred on that page.
async function imageToPdf(buffer) {
    const image = await rasterise(buffer);

    const document = await PDFDocument.create();

    const embedded =
        image.embedAs === 'png'
            ? await document.embedPng(image.data)
            : await document.embedJpg(image.data);

    const landscape = image.width > image.height;

    const pageWidth = landscape ? PAGE_HEIGHT : PAGE_WIDTH;
    const pageHeight = landscape ? PAGE_WIDTH : PAGE_HEIGHT;

    const page = document.addPage([pageWidth, pageHeight]);

    //one scale for both axes, so the image keeps its proportions
    const scale = Math.min(
        (pageWidth - PAGE_MARGIN * 2) / image.width,
        (pageHeight - PAGE_MARGIN * 2) / image.height
    );

    const width = image.width * scale;
    const height = image.height * scale;

    page.drawImage(embedded, {
        x: (pageWidth - width) / 2,
        y: (pageHeight - height) / 2,
        width,
        height
    });

    //a Buffer, because the storage drivers, the size reported to the
    //client and the rest of the upload pipeline all deal in bytes
    return Buffer.from(await document.save());
}

//A compact JPEG of the image, base64-encoded for a vision request.
//
//Everything becomes one known format here: Gemini reads PNG, JPEG, WEBP,
//HEIC and HEIF, so GIF, TIFF and BMP would otherwise have to be handled
//by the caller. Downscaling at the same time keeps the inline payload
//small.
async function imageForAi(buffer) {
    try {
        const jpeg = await sharp(buffer)
            //the same EXIF rotation the PDF gets
            .rotate()
            .resize({
                width: AI_MAX_EDGE,
                height: AI_MAX_EDGE,
                fit: 'inside',

                //a small image is sent as it is, not blown up
                withoutEnlargement: true
            })
            .jpeg({ quality: AI_JPEG_QUALITY })
            .toBuffer();

        return {
            mimeType: 'image/jpeg',
            data: jpeg.toString('base64')
        };
    } catch (error) {
        throw imageReadError(error);
    }
}

module.exports = {
    IMAGE_MIME_TYPES,
    detectRasterImage,
    imageToPdf,
    imageForAi,
    imageReadError
};
