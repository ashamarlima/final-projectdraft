import { useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { readFormValues } from "../../../shared/form/readFormValues";
import { MAX_LESSON, MAX_UNIT } from "../subjects";

//Rename a PDF, or move it to another grade, unit or lesson.
//
//The form is uncontrolled and prefilled from `material`, so switching to a
//different PDF remounts this component (the page gives it a key) and the
//fields take the new values.
//
//The page owns the save itself, because it is the one talking to the API and
//reloading the library. `onSubmit` returns the reason it refused, or "" when
//it worked, which is the only thing the form has to react to: the page
//unmounts this dialog on success, so the message never has to be cleared
//by hand.
//
//The refusal is shown in here rather than in the page: it is about the
//fields in front of the user.

function EditMaterialModal({
    material,
    grades,
    saving,
    onSubmit,
    onClose
}) {
    const formRef = useRef(null);

    const [error, setError] = useState("");

    const handleSubmit = async (event) => {
        event.preventDefault();

        const failure = await onSubmit(
            readFormValues(formRef.current)
        );

        setError(failure || "");
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">

            <div
                role="dialog"
                aria-modal="true"
                aria-label="Edit PDF"
                className="bg-gray-900 rounded-lg shadow-2xl max-w-lg w-full border border-gray-800"
            >

                <div className="flex justify-between items-center p-6 border-b border-gray-800">

                    <h2 className="text-xl font-bold text-white">
                        Edit PDF
                    </h2>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="text-gray-400 hover:text-white hover:bg-gray-800 p-1 rounded-full transition-colors cursor-pointer"
                    >
                        <X size={22} />
                    </button>

                </div>


                <form
                    ref={formRef}
                    onSubmit={handleSubmit}
                    className="p-6 space-y-5 text-left"
                >

                    {error && (
                        <p
                            role="alert"
                            className="text-sm text-red-400"
                        >
                            {error}
                        </p>
                    )}


                    <div>
                        <label className="block text-gray-300 font-medium mb-2">
                            Title
                        </label>

                        <input
                            name="title"
                            type="text"
                            defaultValue={material.title}
                            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                        />
                    </div>


                    <div className="grid grid-cols-3 gap-5">

                        <div>
                            <label className="block text-gray-300 font-medium mb-2">
                                Grade
                            </label>

                            <select
                                name="grade"
                                defaultValue={material.grade}
                                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
                            >
                                {grades.map((grade) => (
                                    <option
                                        key={grade}
                                        value={grade}
                                    >
                                        Grade {grade}
                                    </option>
                                ))}
                            </select>
                        </div>


                        <div>
                            <label className="block text-gray-300 font-medium mb-2">
                                Unit
                            </label>

                            <input
                                name="unit"
                                type="number"
                                min="1"
                                max={MAX_UNIT}
                                defaultValue={material.unit ?? 1}
                                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                            />
                        </div>


                        <div>
                            <label className="block text-gray-300 font-medium mb-2">
                                Lesson
                            </label>

                            <input
                                name="lesson"
                                type="number"
                                min="1"
                                max={MAX_LESSON}
                                defaultValue={material.lesson}
                                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                            />
                        </div>

                    </div>


                    <div className="flex gap-3 pt-2">

                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 font-medium cursor-pointer transition-colors"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-gray-950 font-semibold rounded-lg cursor-pointer transition-colors"
                        >
                            {saving ? (
                                <Loader2
                                    size={18}
                                    className="animate-spin"
                                />
                            ) : (
                                <Check size={18} />
                            )}

                            {saving ? "Saving..." : "Save changes"}
                        </button>

                    </div>

                </form>

            </div>

        </div>
    );
}

export default EditMaterialModal;
