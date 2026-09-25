import { Loader2, Trash2 } from "lucide-react";

//Ask before deleting a PDF.
//
//This is the one action on the page that cannot be undone -- the stored
//object goes with the record -- so it is asked about in a dialog rather
//than by window.confirm, which cannot say which file is about to go.
//
//It holds no state: the page decides what is pending and performs the
//delete, and this only reports which of the two buttons was pressed.

function DeleteMaterialModal({
    material,
    deleting,
    onConfirm,
    onCancel
}) {
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">

            <div
                role="dialog"
                aria-modal="true"
                aria-label="Delete PDF"
                className="bg-gray-900 rounded-lg shadow-2xl max-w-md w-full border border-gray-800 p-6"
            >

                <h2 className="text-xl font-bold text-white">
                    Delete this PDF?
                </h2>

                <p className="text-sm text-gray-400 mt-3">
                    "{material.title}" and the stored file are
                    removed. This cannot be undone.
                </p>


                <div className="flex gap-3 pt-6">

                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 font-medium cursor-pointer transition-colors"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={deleting}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer transition-colors"
                    >
                        {deleting ? (
                            <Loader2
                                size={18}
                                className="animate-spin"
                            />
                        ) : (
                            <Trash2 size={18} />
                        )}

                        {deleting ? "Deleting..." : "Delete"}
                    </button>

                </div>

            </div>

        </div>
    );
}

export default DeleteMaterialModal;
