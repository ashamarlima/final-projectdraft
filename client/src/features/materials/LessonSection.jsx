import {
    ChevronDown,
    ChevronUp,
    FileText,
    Pencil,
    RefreshCw,
    Trash2
} from "lucide-react";

function formatSize(bytes) {
    if (!bytes) {
        return "—";
    }

    if (bytes < 1024 * 1024) {
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

//One grade + lesson of the library, rendered as its own sortable section.
//
//`materials` is that lesson's PDFs in the order the server returned them,
//which is the order students see. Reordering only ever moves items inside
//this array, so the arrows cannot reach another lesson's PDFs.
function LessonSection({
    grade,
    unit,
    lesson,
    materials,
    canManage,
    busy,
    readingId,
    onMove,
    onPreview,
    onEdit,
    onDelete,
    onReread
}) {
    const move = (index, direction) => {
        const target = index + direction;

        if (target < 0 || target >= materials.length) {
            return;
        }

        onMove(materials, index, direction);
    };

    return (
        <div className="border border-gray-800 rounded-lg overflow-hidden">

            {/* Which grade and lesson these PDFs belong to */}
            <div className="bg-gray-800/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3">

                <div className="flex items-center gap-3">

                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                        <FileText size={16} />
                    </div>


                    <div>

                        <h3 className="text-sm font-bold text-white">
                            Grade {grade} · Unit {unit} ·
                            Lesson {lesson}
                        </h3>

                        <p className="text-xs text-gray-400">
                            {materials.length}{" "}
                            {materials.length === 1
                                ? "PDF"
                                : "PDFs"}
                        </p>

                    </div>

                </div>


                {canManage && materials.length > 1 && (
                    <p className="text-xs text-gray-500">
                        The arrows set the order
                        students see
                    </p>
                )}

            </div>


            <div className="overflow-x-auto">

                <table className="w-full min-w-[720px] text-left">

                    <thead className="bg-gray-900 border-b border-gray-800">

                        <tr>

                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                Order
                            </th>

                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                Title
                            </th>

                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                Size
                            </th>

                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                Added
                            </th>

                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400 text-right">
                                Actions
                            </th>

                        </tr>

                    </thead>


                    <tbody className="divide-y divide-gray-800">

                        {materials.map((material, index) => (
                            <tr
                                key={material._id}
                                className="hover:bg-gray-800/50 transition-colors"
                            >

                                <td className="px-4 py-4">

                                    <div className="flex items-center gap-1">

                                        {canManage && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    move(
                                                        index,
                                                        -1
                                                    )
                                                }
                                                disabled={
                                                    busy ||
                                                    index === 0
                                                }
                                                title="Move earlier in this lesson"
                                                aria-label="Move earlier in this lesson"
                                                className="p-1 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                            >
                                                <ChevronUp
                                                    size={16}
                                                />
                                            </button>
                                        )}


                                        <span className="w-5 text-center text-sm text-white">
                                            {index + 1}
                                        </span>


                                        {canManage && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    move(
                                                        index,
                                                        1
                                                    )
                                                }
                                                disabled={
                                                    busy ||
                                                    index ===
                                                        materials.length -
                                                            1
                                                }
                                                title="Move later in this lesson"
                                                aria-label="Move later in this lesson"
                                                className="p-1 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                            >
                                                <ChevronDown
                                                    size={16}
                                                />
                                            </button>
                                        )}

                                    </div>

                                </td>


                                <td className="px-4 py-4 text-sm text-white font-medium">
                                    {material.title}


                                    {/* An image-only PDF holds no text to
                                        parse, and a photo the vision model
                                        could not read ends up the same way,
                                        so the student's AI assistant and
                                        quiz are unavailable for it. Worth
                                        flagging here rather than only where
                                        it is used. */}
                                    {material.hasText === false && (
                                        <span
                                            title="No readable text, so the AI assistant, flashcards and quiz are unavailable for this PDF. Use Read with AI to try the stored page again."
                                            className="ml-2 align-middle text-[10px] font-semibold text-amber-400"
                                        >
                                            no AI text
                                        </span>
                                    )}
                                </td>

                                <td className="px-4 py-4 text-sm text-gray-400 whitespace-nowrap">
                                    {formatSize(
                                        material.sizeBytes
                                    )}
                                </td>

                                <td className="px-4 py-4 text-sm text-gray-400 whitespace-nowrap">
                                    {new Date(
                                        material.createdAt
                                    ).toLocaleDateString()}
                                </td>


                                <td className="px-4 py-4">

                                    <div className="flex items-center justify-end gap-2">

                                        <button
                                            type="button"
                                            onClick={() =>
                                                onPreview(
                                                    material
                                                )
                                            }
                                            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold cursor-pointer transition-colors"
                                        >
                                            Preview
                                        </button>


                                        {/* A page the AI walked away from at
                                            upload time can be read again
                                            from storage, so the lesson does
                                            not have to be uploaded afresh. */}
                                        {canManage &&
                                            material.hasText === false && (
                                                <button
                                                    type="button"
                                                    disabled={
                                                        readingId ===
                                                        material._id
                                                    }
                                                    onClick={() =>
                                                        onReread(
                                                            material
                                                        )
                                                    }
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-500 text-gray-900 rounded-lg hover:bg-amber-400 font-semibold cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    <RefreshCw
                                                        size={14}
                                                        className={
                                                            readingId ===
                                                            material._id
                                                                ? "animate-spin"
                                                                : ""
                                                        }
                                                    />
                                                    {readingId ===
                                                    material._id
                                                        ? "Reading…"
                                                        : "Read with AI"}
                                                </button>
                                            )}

                                        {canManage && (
                                            <>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onEdit(
                                                            material
                                                        )
                                                    }
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-green-500 text-gray-900 rounded-lg hover:bg-green-400 font-semibold cursor-pointer transition-colors"
                                                >
                                                    <Pencil
                                                        size={14}
                                                    />
                                                    Edit
                                                </button>


                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onDelete(
                                                            material
                                                        )
                                                    }
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 font-semibold cursor-pointer transition-colors"
                                                >
                                                    <Trash2
                                                        size={14}
                                                    />
                                                    Delete
                                                </button>

                                            </>
                                        )}

                                    </div>

                                </td>

                            </tr>
                        ))}

                    </tbody>

                </table>

            </div>

        </div>
    );
}

export default LessonSection;
