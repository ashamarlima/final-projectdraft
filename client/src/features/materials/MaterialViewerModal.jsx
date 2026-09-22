import { useEffect, useState } from "react";

import { getMaterialViewUrl } from "./materialsAPI";
import PdfViewer from "./PdfViewer";

//Fetches the material's short-lived signed url and hands it to the inline
//viewer, so callers only have to say which material is open.
//
//Render it with a key of the material id: a new material then gets a fresh
//component, which is what resets the loading state below.
function MaterialViewerModal({ material, onClose }) {
    const [url, setUrl] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        //the viewer can be closed while the url is still in flight
        let cancelled = false;

        getMaterialViewUrl(material._id)
            .then((result) => {
                if (cancelled) {
                    return;
                }

                setUrl(result.url);
                setLoading(false);
            })
            .catch((err) => {
                if (cancelled) {
                    return;
                }

                setError(
                    err.message ||
                        "Unable to open that PDF"
                );

                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [material._id]);

    return (
        <PdfViewer
            material={material}
            url={url}
            loading={loading}
            error={error}
            onClose={onClose}
        />
    );
}

export default MaterialViewerModal;
