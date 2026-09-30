import "server-only";
import { cache } from "react";
import { getCoy, loadSnapshot } from "./snapshot";

// Per-request memo: the layout and the page render in parallel and both need
// these, so each is read from the database once per request.
export const currentCoy = cache(getCoy);
export const currentSnapshot = cache(async () => loadSnapshot(await currentCoy()));
