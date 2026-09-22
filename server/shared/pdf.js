//Reading text out of an uploaded PDF.
//
//Both study notes (features/notes) and lesson materials
//(features/materials) turn a PDF into text so the AI assistant can work
//with it. Keeping the pdf-parse details in one module means a change to
//the library, or to the way its output is cleaned, only happens once.

const { PDFParse } = require('pdf-parse');

//pdf-parse v2 appends page separators such as "-- 1 of 3 --"; drop them
//so an image-only PDF (no real text) is not mistaken for a document with
//readable text
function cleanExtractedText(text) {
    return (text || '')
        .replace(/^--\s*\d+\s+of\s+\d+\s*--$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

//Turn the common pdf-parse failures into a clearer message, with an HTTP
//status attached. The caller decides how to surface it: notes reject the
//upload with a 400, materials store the file anyway and simply leave the
//AI assistant switched off for that lesson.
function pdfReadError(error) {
    if (error?.name === 'PasswordException') {
        return Object.assign(
            new Error(
                'That PDF is password-protected. Remove the password and try again.'
            ),
            { status: 400 }
        );
    }

    if (
        error?.name === 'InvalidPDFException' ||
        error?.name === 'FormatError'
    ) {
        return Object.assign(
            new Error(
                'That file is not a valid PDF. It may be corrupt, or renamed from another format.'
            ),
            { status: 400 }
        );
    }

    return Object.assign(
        new Error(
            `That PDF could not be read: ${error?.message || 'unknown error'}`
        ),
        { status: 400 }
    );
}

//pull readable text out of a PDF buffer. Throws an error carrying a 400
//status when the file cannot be read.
async function extractPdfText(buffer) {
    const parser = new PDFParse({ data: buffer });

    try {
        const result = await parser.getText();

        return cleanExtractedText(result.text);
    } catch (error) {
        throw pdfReadError(error);
    } finally {
        //free the pdf.js worker/documents
        await parser.destroy();
    }
}

module.exports = {
    extractPdfText,
    cleanExtractedText,
    pdfReadError
};
