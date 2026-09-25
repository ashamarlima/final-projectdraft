//Tests for the upload panel.
//
//The form owns its own inputs and hands their values to the page, so the
//two things worth pinning down are that it reports the fields as they
//stand, and that it clears itself only when the page says the upload
//worked -- the page is what decides that, and clearing a form the user
//still has to retry would lose their answers.

import {
    describe,
    test,
    expect,
    vi
} from "vitest";

import {
    render,
    screen,
    waitFor
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import UploadForm from "./UploadForm";

const GRADES = ["9", "10"];

//The spy is returned, not the object that was passed in, so a test that
//replaces it still asserts against the one the form actually calls.
function renderForm({
    onSubmit = vi.fn().mockResolvedValue(true),
    ...overrides
} = {}) {
    const view = render(
        <UploadForm
            subject="English"
            grades={GRADES}
            uploading={false}
            feedback={null}
            onSubmit={onSubmit}
            {...overrides}
        />
    );

    return {
        ...view,
        onSubmit,

        title: view.container.querySelector(
            'input[name="title"]'
        ),

        unit: view.container.querySelector(
            'input[name="unit"]'
        ),

        file: view.container.querySelector(
            'input[type="file"]'
        )
    };
}

const submit = (user) =>
    user.click(
        screen.getByRole("button", {
            name: /upload file/i
        })
    );

const pdfFile = () =>
    new File(["%PDF-1.4"], "worksheet.pdf", {
        type: "application/pdf"
    });

describe("the upload form", () => {
    test("hands the chosen file and the field values to the page", async () => {
        const user = userEvent.setup();

        const form = renderForm();

        await user.upload(form.file, pdfFile());
        await user.type(form.title, "Worksheet");

        await submit(user);

        await waitFor(() =>
            expect(form.onSubmit).toHaveBeenCalledTimes(1)
        );

        //the fields travel as the strings the browser would submit; the
        //page is what converts and validates the numbers
        expect(form.onSubmit).toHaveBeenCalledWith({
            file: expect.any(File),
            title: "Worksheet",
            grade: "9",
            unit: "1",
            lesson: "1"
        });
    });

    test("clears the title and the file once the upload worked", async () => {
        const user = userEvent.setup();

        const form = renderForm();

        await user.upload(form.file, pdfFile());
        await user.type(form.title, "Worksheet");

        expect(form.file.files).toHaveLength(1);

        await submit(user);

        await waitFor(() =>
            expect(form.title).toHaveValue("")
        );

        expect(form.file.files).toHaveLength(0);

        //the grade, unit and lesson are kept, so a run of uploads into one
        //lesson is not reset
        expect(form.unit).toHaveValue(1);
    });

    test("keeps everything when the page refused the upload", async () => {
        const user = userEvent.setup();

        const form = renderForm({
            onSubmit: vi.fn().mockResolvedValue(false)
        });

        await user.upload(form.file, pdfFile());
        await user.type(form.title, "Worksheet");

        await submit(user);

        await waitFor(() =>
            expect(form.onSubmit).toHaveBeenCalled()
        );

        expect(form.title).toHaveValue("Worksheet");
        expect(form.file.files).toHaveLength(1);
    });

    test("shows the message the page reported", () => {
        renderForm({
            feedback: {
                tone: "error",
                text: "Unit must be a whole number between 1 and 99"
            }
        });

        expect(
            screen.getByText(
                "Unit must be a whole number between 1 and 99"
            )
        ).toBeInTheDocument();
    });

    test("locks the button while an upload is in flight", () => {
        renderForm({ uploading: true });

        expect(
            screen.getByRole("button", {
                name: /uploading/i
            })
        ).toBeDisabled();
    });
});
