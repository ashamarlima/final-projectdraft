import { useRef } from "react";
import { Loader2, Upload } from "lucide-react";

import { readFormValues } from "../../../shared/form/readFormValues";
import { MAX_LESSON, MAX_UNIT } from "../subjects";

//The upload panel: which library a file joins, and the file itself.
//
//The form is uncontrolled, like every other form in this app: the fields
//are read once, through readFormValues, at the moment it is submitted, so
//typing does not re-render the PDF list beside it. The refs that make that
//work live here, which is why this component owns the clearing of its own
//inputs.
//
//The submit handler belongs to the page, because it is the one that knows
//the open subject, talks to the API and owns the validation messages.
//It returns true only when the upload succeeded, and that is what tells
//this form it may clear itself.

function UploadForm({
    subject,
    grades,
    uploading,
    feedback,
    onSubmit
}) {
    const formRef = useRef(null);
    const fileInputRef = useRef(null);
    const titleInputRef = useRef(null);

    const handleSubmit = async (event) => {
        event.preventDefault();

        const file =
            fileInputRef.current?.files?.[0] || null;

        const uploaded = await onSubmit({
            file,

            //every field arrives as a string; the page converts the
            //numbers and rejects the unusable ones
            ...readFormValues(formRef.current)
        });

        if (!uploaded) {
            return;
        }

        //Clear the title and the chosen file, but keep the grade, unit and
        //lesson, so a run of uploads into one lesson is not reset.
        if (titleInputRef.current) {
            titleInputRef.current.value = "";
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">

            <div className="p-6 border-b border-gray-800 flex items-center gap-3">

                <div className="p-2 bg-green-500 rounded-lg">
                    <Upload size={20} className="text-gray-950" />
                </div>

                <div>

                    <h2 className="text-xl font-bold text-white">
                        Upload a {subject} lesson PDF
                    </h2>

                    <p className="text-sm text-gray-400">
                        {subject} · PDF or image, up to 25MB
                    </p>

                </div>

            </div>


            <form
                ref={formRef}
                onSubmit={handleSubmit}
                className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 text-left"
            >

                <div>
                    <label className="block text-gray-300 font-medium mb-2">
                        Title
                    </label>

                    <input
                        ref={titleInputRef}
                        name="title"
                        type="text"
                        defaultValue=""
                        placeholder="Defaults to the file name"
                        className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    />
                </div>


                <div>
                    <label className="block text-gray-300 font-medium mb-2">
                        Grade *
                    </label>

                    <select
                        name="grade"
                        defaultValue="9"
                        className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
                    >
                        {grades.map((grade) => (
                            <option key={grade} value={grade}>
                                Grade {grade}
                            </option>
                        ))}
                    </select>
                </div>


                <div>
                    <label className="block text-gray-300 font-medium mb-2">
                        Unit *
                    </label>

                    <input
                        name="unit"
                        type="number"
                        min="1"
                        max={MAX_UNIT}
                        defaultValue="1"
                        className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    />
                </div>


                <div>
                    <label className="block text-gray-300 font-medium mb-2">
                        Lesson *
                    </label>

                    <input
                        name="lesson"
                        type="number"
                        min="1"
                        max={MAX_LESSON}
                        defaultValue="1"
                        className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    />
                </div>


                <div>
                    <label className="block text-gray-300 font-medium mb-2">
                        PDF or image file *
                    </label>

                    {/* An image is turned into a PDF by the server, so the
                        picker offers both. image/* covers the formats a
                        phone or a scanner produces; the extensions are
                        there for the ones a system may not have a
                        registered type for (HEIC). */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf,.pdf,image/*,.png,.jpg,.jpeg,.webp,.avif,.heic,.heif,.gif,.tif,.tiff,.bmp"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg file:mr-3 file:px-3 file:py-1 file:rounded-lg file:border-0 file:bg-green-500 file:text-gray-950 file:text-sm file:font-medium cursor-pointer"
                    />
                </div>


                <div className="md:col-span-2 xl:col-span-5 flex flex-wrap items-center gap-4">

                    <button
                        type="submit"
                        disabled={uploading}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                        {uploading ? (
                            <>
                                <Loader2
                                    size={18}
                                    className="animate-spin"
                                />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Upload size={18} />
                                Upload file
                            </>
                        )}
                    </button>


                    {feedback && (
                        <p
                            className={`text-sm ${
                                feedback.tone === "success"
                                    ? "text-green-400"
                                    : "text-red-400"
                            }`}
                        >
                            {feedback.text}
                        </p>
                    )}

                </div>

            </form>

        </div>
    );
}

export default UploadForm;
