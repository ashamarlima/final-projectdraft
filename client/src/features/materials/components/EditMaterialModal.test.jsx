//Tests for the rename/move dialog.
//
//The dialog owns its form and shows whatever the page returns from
//`onSubmit`: a reason it refused, or "" when it worked. That contract is
//what these follow, because it is the one the page depends on -- the page
//unmounts the dialog on success, so the dialog never has to clear a message
//by hand.

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

import EditMaterialModal from "./EditMaterialModal";

const MATERIAL = {
    _id: "m-1",
    title: "Worksheet",
    grade: "9",
    unit: 1,
    lesson: 1
};

const GRADES = ["9", "10", "11"];

//The spies are returned, not the object that was passed in, so a test that
//replaces them still asserts against the ones the dialog actually calls.
function renderModal({
    onSubmit = vi.fn().mockResolvedValue(""),
    onClose = vi.fn(),
    ...overrides
} = {}) {
    const view = render(
        <EditMaterialModal
            material={MATERIAL}
            grades={GRADES}
            saving={false}
            onSubmit={onSubmit}
            onClose={onClose}
            {...overrides}
        />
    );

    return {
        ...view,
        onSubmit,
        onClose,

        title: view.container.querySelector(
            'input[name="title"]'
        ),

        unit: view.container.querySelector(
            'input[name="unit"]'
        )
    };
}

const save = (user) =>
    user.click(
        screen.getByRole("button", {
            name: /save changes/i
        })
    );

describe("the edit dialog", () => {
    test("is prefilled from the material it was given", () => {
        const modal = renderModal();

        expect(modal.title).toHaveValue("Worksheet");
        expect(modal.unit).toHaveValue(1);

        expect(
            screen.getByRole("dialog", { name: "Edit PDF" })
        ).toBeInTheDocument();
    });

    test("hands the field values over and shows a refusal in place", async () => {
        const user = userEvent.setup();

        const modal = renderModal({
            onSubmit: vi
                .fn()
                .mockResolvedValue(
                    "Unit must be a whole number between 1 and 99"
                )
        });

        await user.clear(modal.title);
        await user.type(modal.title, "Renamed");

        await save(user);

        await waitFor(() =>
            expect(modal.onSubmit).toHaveBeenCalledTimes(1)
        );

        //the fields travel as the strings the browser submits
        expect(modal.onSubmit).toHaveBeenCalledWith({
            title: "Renamed",
            grade: "9",
            unit: "1",
            lesson: "1"
        });

        //and the reason is shown inside the dialog rather than lost
        expect(
            screen.getByRole("alert")
        ).toHaveTextContent(
            "Unit must be a whole number between 1 and 99"
        );
    });

    test("drops the refusal once a later save is accepted", async () => {
        const user = userEvent.setup();

        const onSubmit = vi
            .fn()
            .mockResolvedValueOnce("Unit must be a whole number between 1 and 99")
            .mockResolvedValueOnce("");

        renderModal({ onSubmit });

        await save(user);

        expect(
            await screen.findByRole("alert")
        ).toBeInTheDocument();

        await save(user);

        await waitFor(() =>
            expect(
                screen.queryByRole("alert")
            ).not.toBeInTheDocument()
        );
    });

    test("reports both ways of closing without saving", async () => {
        const user = userEvent.setup();

        const modal = renderModal();

        await user.click(
            screen.getByRole("button", { name: /cancel/i })
        );

        //the header's X is the other way out
        await user.click(
            screen.getByRole("button", {
                name: /close/i
            })
        );

        expect(modal.onClose).toHaveBeenCalledTimes(2);
        expect(modal.onSubmit).not.toHaveBeenCalled();
    });

    test("locks the save button while it is saving", () => {
        renderModal({ saving: true });

        expect(
            screen.getByRole("button", {
                name: /saving/i
            })
        ).toBeDisabled();
    });
});
