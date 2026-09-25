//Setup shared by every client test, loaded once by Vitest (see the `test`
//block in vite.config.js).
//
//Vitest is configured without globals, so tests import what they need from
//'vitest' themselves. That also means @testing-library/react cannot find a
//global afterEach to register its automatic cleanup against, which is why
//the DOM is cleared here by hand.

import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";

import { cleanup } from "@testing-library/react";

//A mounted tree left behind would be found again by a later test's query,
//which turns one forgotten unmount into a confusing failure elsewhere.
afterEach(() => {
  cleanup();
});
