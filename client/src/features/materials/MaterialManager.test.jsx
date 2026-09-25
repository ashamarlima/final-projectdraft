//Tests for the admin/teacher lesson PDF library page.
//
//The API module is replaced with spies, so these follow what the page asks
//the server for and what it renders back, without a server or a browser.
//
//Several tests check that a failure is reported in the page rather than
//through window.alert/confirm: that is the behaviour alert() was replaced
//with, and it is easy to regress unnoticed.

import {
    beforeEach,
    describe,
    test,
    expect,
    vi
} from "vitest";

import {
    render,
    screen,
    waitFor,
    within
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import {
    getMaterials,
    uploadMaterial,
    updateMaterial,
    reorderMaterials,
    deleteMaterial,
    rereadMaterialText
} from "./materialsAPI";

import MaterialManager from "./MaterialManager";

//hoisted above the imports by vitest, so the module above is the mock
vi.mock("./materialsAPI", () => ({
    getMaterials: vi.fn(),
    uploadMaterial: vi.fn(),
    updateMaterial: vi.fn(),
    reorderMaterials: vi.fn(),
    deleteMaterial: vi.fn(),
    getMaterialViewUrl: vi.fn(),
    rereadMaterialText: vi.fn()
}));

const CLASSROOMS = ["9", "10", "11", "12"];

//a stored PDF as the API summarises it
const pdf = (overrides = {}) => ({
    _id: "m-1",
    subject: "English",
    grade: "9",
    unit: 1,
    lesson: 1,
    title: "Worksheet",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    originalName: "worksheet.pdf",
    hasText: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
});

function renderLibrary({ canManage = true } = {}) {
    return render(
        <MaterialManager
            classrooms={CLASSROOMS}
            canManage={canManage}
        />
    );
}

//the list arrives from an effect, so it is awaited through the rows it
//renders rather than through a state that is set twice
const findRow = (title) => screen.findByText(title);

beforeEach(() => {
    vi.clearAllMocks();

    //a default for every call the page can make; a test only overrides the
    //one it is about
    getMaterials.mockResolvedValue([]);
    uploadMaterial.mockResolvedValue({ hasText: true });
    updateMaterial.mockResolvedValue({ hasText: true });
    reorderMaterials.mockResolvedValue([]);
    deleteMaterial.mockResolvedValue(undefined);
    rereadMaterialText.mockResolvedValue({ hasText: true });
});

describe("the library listing", () => {
    test("shows each lesson's PDFs in the order the server sent them", async () => {
        getMaterials.mockResolvedValue([
            pdf({ _id: "m-1", title: "First" }),
            pdf({ _id: "m-2", title: "Second" })
        ]);

        renderLibrary();

        expect(await findRow("First")).toBeInTheDocument();
        expect(screen.getByText("Second")).toBeInTheDocument();

        //the rows keep the order they arrived in
        const titles = screen
            .getAllByText(/First|Second/)
            .map((element) => element.textContent);

        expect(titles).toEqual(["First", "Second"]);
    });

    test("reports a load failure in the page", async () => {
        getMaterials.mockRejectedValue(
            new Error("Unable to load the PDF library")
        );

        renderLibrary();

        expect(
            await screen.findByText(
                "Unable to load the PDF library"
            )
        ).toBeInTheDocument();
    });

    test("loads the whole subject, leaving grade and unit to the filters", async () => {
        renderLibrary();

        await waitFor(() =>
            expect(getMaterials).toHaveBeenCalledWith({
                subject: "English"
            })
        );
    });
});

describe("what the row offers", () => {
    test("a lesson with no readable text is flagged and can be re-read", async () => {
        const user = userEvent.setup();

        getMaterials.mockResolvedValue([
            pdf({ title: "Scanned page", hasText: false })
        ]);

        renderLibrary();

        await findRow("Scanned page");

        expect(
            screen.getByText(/no AI text/i)
        ).toBeInTheDocument();

        await user.click(
            screen.getByRole("button", {
                name: /read with AI/i
            })
        );

        await waitFor(() =>
            expect(
                rereadMaterialText
            ).toHaveBeenCalledWith("m-1")
        );

        //the outcome is reported beside the list
        expect(
            await screen.findByRole("status")
        ).toHaveTextContent(/now work for it/i);
    });

    test("a lesson with text offers no re-read", async () => {
        getMaterials.mockResolvedValue([pdf()]);

        renderLibrary();

        await findRow("Worksheet");

        expect(
            screen.queryByText(/no AI text/i)
        ).not.toBeInTheDocument();

        expect(
            screen.queryByRole("button", {
                name: /read with AI/i
            })
        ).not.toBeInTheDocument();
    });
});

describe("a non-admin", () => {
    test("gets a read-only library with no admin controls", async () => {
        getMaterials.mockResolvedValue([pdf()]);

        renderLibrary({ canManage: false });

        await findRow("Worksheet");

        expect(
            screen.getByText(/read-only library/i)
        ).toBeInTheDocument();

        for (const name of [
            /upload file/i,
            /^edit$/i,
            /^delete$/i
        ]) {
            expect(
                screen.queryByRole("button", {
                    name
                })
            ).not.toBeInTheDocument();
        }
    });
});

describe("uploading", () => {
    test("sends the file with the grade, unit and lesson it was given", async () => {
        const user = userEvent.setup();

        const view = renderLibrary();

        const file = new File(
            ["%PDF-1.4 content"],
            "worksheet.pdf",
            { type: "application/pdf" }
        );

        //the file input has no associated label, so it is found by type
        await user.upload(
            view.container.querySelector(
                'input[type="file"]'
            ),
            file
        );

        await user.click(
            screen.getByRole("button", {
                name: /upload file/i
            })
        );

        await waitFor(() =>
            expect(uploadMaterial).toHaveBeenCalledTimes(1)
        );

        expect(uploadMaterial).toHaveBeenCalledWith({
            file,
            subject: "English",
            grade: "9",
            unit: 1,
            lesson: 1,
            title: ""
        });
    });

    test("says so when the AI could not read the upload", async () => {
        const user = userEvent.setup();

        uploadMaterial.mockResolvedValue({ hasText: false });

        const view = renderLibrary();

        await user.upload(
            view.container.querySelector(
                'input[type="file"]'
            ),
            new File(["%PDF-1.4"], "scan.pdf", {
                type: "application/pdf"
            })
        );

        await user.click(
            screen.getByRole("button", {
                name: /upload file/i
            })
        );

        //the upload worked, and the missing assistant is what matters to
        //the admin, so it is said here rather than discovered later
        expect(
            await screen.findByText(/could not read any text/i)
        ).toBeInTheDocument();
    });

    test("refuses to submit with no file chosen", async () => {
        const user = userEvent.setup();

        renderLibrary();

        await user.click(
            screen.getByRole("button", {
                name: /upload file/i
            })
        );

        expect(uploadMaterial).not.toHaveBeenCalled();

        expect(
            screen.getByText(/choose a PDF or image file/i)
        ).toBeInTheDocument();
    });
});

describe("reordering", () => {
    test("moves a PDF within its own lesson and sends the whole lesson", async () => {
        const user = userEvent.setup();

        getMaterials.mockResolvedValue([
            pdf({ _id: "m-1", title: "First" }),
            pdf({ _id: "m-2", title: "Second" })
        ]);

        renderLibrary();

        await findRow("First");

        await user.click(
            screen.getAllByLabelText(
                "Move later in this lesson"
            )[0]
        );

        await waitFor(() =>
            expect(reorderMaterials).toHaveBeenCalledTimes(1)
        );

        expect(reorderMaterials).toHaveBeenCalledWith({
            subject: "English",
            grade: "9",
            unit: 1,
            lesson: 1,

            //the swapped order, so the stored positions stay 0..n-1
            order: ["m-2", "m-1"]
        });
    });

    test("the ends of the lesson cannot be moved past", async () => {
        getMaterials.mockResolvedValue([
            pdf({ _id: "m-1", title: "First" }),
            pdf({ _id: "m-2", title: "Second" })
        ]);

        renderLibrary();

        await findRow("First");

        const earlier = screen.getAllByLabelText(
            "Move earlier in this lesson"
        );

        const later = screen.getAllByLabelText(
            "Move later in this lesson"
        );

        expect(earlier[0]).toBeDisabled();
        expect(earlier[1]).toBeEnabled();

        expect(later[0]).toBeEnabled();
        expect(later[1]).toBeDisabled();
    });

    test("a failed move is reported in the page, never in an alert", async () => {
        const alert = vi
            .spyOn(window, "alert")
            .mockImplementation(() => {});

        const user = userEvent.setup();

        getMaterials.mockResolvedValue([
            pdf({ _id: "m-1", title: "First" }),
            pdf({ _id: "m-2", title: "Second" })
        ]);

        reorderMaterials.mockRejectedValue(
            new Error("Unable to reorder those PDFs")
        );

        renderLibrary();

        await findRow("First");

        await user.click(
            screen.getAllByLabelText(
                "Move later in this lesson"
            )[0]
        );

        expect(
            await screen.findByRole("status")
        ).toHaveTextContent("Unable to reorder those PDFs");

        expect(alert).not.toHaveBeenCalled();
    });
});

describe("deleting", () => {
    const openDeleteDialog = async (user) => {
        await user.click(
            screen.getByRole("button", {
                name: /^delete$/i
            })
        );

        return screen.findByRole("dialog", {
            name: "Delete PDF"
        });
    };

    test("asks first and removes nothing when cancelled", async () => {
        const user = userEvent.setup();

        getMaterials.mockResolvedValue([pdf()]);

        renderLibrary();

        await findRow("Worksheet");

        const dialog = await openDeleteDialog(user);

        //the stored file goes with the record, so the dialog says so
        expect(dialog).toHaveTextContent(/cannot be undone/i);

        await user.click(
            within(dialog).getByRole("button", {
                name: /cancel/i
            })
        );

        expect(deleteMaterial).not.toHaveBeenCalled();

        expect(
            screen.queryByRole("dialog")
        ).not.toBeInTheDocument();
    });

    test("removes the PDF once confirmed", async () => {
        const user = userEvent.setup();

        getMaterials.mockResolvedValue([pdf()]);

        renderLibrary();

        await findRow("Worksheet");

        const dialog = await openDeleteDialog(user);

        await user.click(
            within(dialog).getByRole("button", {
                name: /^delete$/i
            })
        );

        await waitFor(() =>
            expect(deleteMaterial).toHaveBeenCalledWith("m-1")
        );

        expect(
            screen.queryByRole("dialog")
        ).not.toBeInTheDocument();
    });

    test("a failed delete is reported in the page, never in an alert", async () => {
        const alert = vi
            .spyOn(window, "alert")
            .mockImplementation(() => {});

        const user = userEvent.setup();

        getMaterials.mockResolvedValue([pdf()]);

        deleteMaterial.mockRejectedValue(
            new Error("Unable to delete that material")
        );

        renderLibrary();

        await findRow("Worksheet");

        const dialog = await openDeleteDialog(user);

        await user.click(
            within(dialog).getByRole("button", {
                name: /^delete$/i
            })
        );

        expect(
            await screen.findByRole("status")
        ).toHaveTextContent(
            "Unable to delete that material"
        );

        expect(alert).not.toHaveBeenCalled();
    });
});

describe("editing", () => {
    const openEditDialog = async (user) => {
        await user.click(
            screen.getByRole("button", {
                name: /^edit$/i
            })
        );

        return screen.findByRole("dialog", {
            name: "Edit PDF"
        });
    };

    test("saves a corrected title and grade", async () => {
        const user = userEvent.setup();

        getMaterials.mockResolvedValue([pdf()]);

        renderLibrary();

        await findRow("Worksheet");

        const dialog = await openEditDialog(user);

        const title = within(dialog).getByRole("textbox");

        await user.clear(title);
        await user.type(title, "Renamed worksheet");

        await user.click(
            within(dialog).getByRole("button", {
                name: /save changes/i
            })
        );

        await waitFor(() =>
            expect(updateMaterial).toHaveBeenCalledTimes(1)
        );

        expect(updateMaterial).toHaveBeenCalledWith("m-1", {
            title: "Renamed worksheet",
            grade: "9",
            unit: 1,
            lesson: 1
        });
    });

    test("reports a missing unit inside the dialog, never in an alert", async () => {
        const alert = vi
            .spyOn(window, "alert")
            .mockImplementation(() => {});

        const user = userEvent.setup();

        getMaterials.mockResolvedValue([pdf()]);

        renderLibrary();

        await findRow("Worksheet");

        const dialog = await openEditDialog(user);

        //the dialog's first number field is the unit
        const unit = within(dialog).getAllByRole(
            "spinbutton"
        )[0];

        //Left empty rather than out of range: a number outside the field's
        //min/max is refused by the browser itself, so the submit never
        //reaches this code. An empty field is valid to the browser and is
        //therefore the case the page has to catch.
        await user.clear(unit);

        await user.click(
            within(dialog).getByRole("button", {
                name: /save changes/i
            })
        );

        expect(
            await within(dialog).findByRole("alert")
        ).toHaveTextContent(
            /unit must be a whole number between 1 and 99/i
        );

        expect(updateMaterial).not.toHaveBeenCalled();
        expect(alert).not.toHaveBeenCalled();
    });
});
