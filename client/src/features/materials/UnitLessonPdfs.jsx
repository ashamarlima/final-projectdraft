import { FileText } from "lucide-react";

function formatSize(bytes) {
    if (!bytes) {
        return "";
    }

    if (bytes < 1024 * 1024) {
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

//Every lesson of one unit, each with the PDFs stored against it.
//
//`lessons` is one unit's lessons as the API returned them, which is the
//order an admin arranged, so the "PDF 1 / PDF 2" numbering below is the
//numbering students are meant to read. A lesson only appears here because
//it holds at least one PDF.
function UnitLessonPdfs({ lessons, onOpen }) {
    return (
        <div className="space-y-4">

            {lessons.map(({ lesson, pdfs }) => (
                <div key={lesson}>

                    <p className="text-xs font-semibold text-gray-600">
                        Lesson {lesson}
                    </p>


                    <div className="mt-1.5 space-y-1.5">

                        {pdfs.map((pdf, index) => (
                            <button
                                key={pdf._id}
                                type="button"
                                onClick={() =>
                                    onOpen(pdf)
                                }
                                className="w-full flex items-center gap-2.5 text-left bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 hover:border-blue-300 hover:bg-white transition-colors cursor-pointer"
                            >

                                <span className="shrink-0 w-7 h-7 rounded-md bg-red-50 text-red-500 flex items-center justify-center">
                                    <FileText
                                        size={15}
                                    />
                                </span>


                                <span className="min-w-0">

                                    <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                                        PDF {index + 1}
                                    </span>

                                    <span className="block text-xs font-medium text-gray-800 truncate">
                                        {pdf.title}
                                    </span>


                                    {formatSize(
                                        pdf.sizeBytes
                                    ) && (
                                        <span className="block text-[10px] text-gray-400">
                                            {formatSize(
                                                pdf.sizeBytes
                                            )}
                                        </span>
                                    )}

                                </span>


                                {/* Opening a PDF now leads to the lesson's
                                    page, where the AI assistant, flashcards
                                    and quiz for it live. */}
                                <span className="ml-auto shrink-0 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold px-2 py-1">
                                    AI
                                </span>

                            </button>
                        ))}

                    </div>

                </div>
            ))}

        </div>
    );
}

export default UnitLessonPdfs;
