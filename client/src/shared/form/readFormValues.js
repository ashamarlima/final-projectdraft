//Read the current values out of a form, keyed by each field's `name`.
//
//The forms in this app are deliberately uncontrolled: nothing is written
//to component state while the user types, so a keystroke does not
//re-render the page behind the modal. The values are taken once, when the
//form is submitted, through this helper.
//
//Fields the browser does not submit (a chosen `disabled` option, an
//unchecked box) are simply absent, so callers should treat a missing key
//the same as an empty one.
export function readFormValues(form) {
  if (!form) {
    console.error("No form element provided");
    return { console: "No form element provided" };
  }

  return Object.fromEntries(
    new FormData(form).entries()
  );
}

export default readFormValues;
