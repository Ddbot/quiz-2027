import { test, expect } from "@playwright/test";

import { playerCopy } from "../src/routes/player/copy";

// The fixture event (e2e/global-setup.ts) is created with language: "fr".
const copy = playerCopy.fr;
const DISPLAY_NAME = "Playwright Tester";

test("player happy path: landing -> join code -> anonymous join with consent -> confirm name -> team lobby", async ({
  page,
}) => {
  const joinCode = process.env.E2E_JOIN_CODE;
  if (!joinCode) throw new Error("E2E_JOIN_CODE was not set by global-setup.ts");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: copy.heading })).toBeVisible();

  await page.getByLabel(copy.joinCodeInputLabel).fill(joinCode);
  await page.getByRole("button", { name: copy.landingJoinButton }).click();

  await expect(page).toHaveURL(new RegExp(`/e/${joinCode}`));

  // IdentityStep defaults to "anonymous" mode — no mode button click needed.
  await page.getByLabel(copy.displayNameLabel).fill(DISPLAY_NAME);
  await page.getByLabel(copy.over16Label).check();
  await page.getByLabel(copy.tosLabel).check();
  await page.getByRole("button", { name: copy.continueButton }).click();

  await expect(page.getByTestId("confirm-display-name")).toHaveText(DISPLAY_NAME);
  await page.getByRole("button", { name: copy.nameConfirmButton }).click();

  // Joined state — the event is still a draft, so the team lobby also renders.
  await expect(page.getByTestId("joined-display-name")).toHaveText(DISPLAY_NAME);
  await expect(page.getByRole("heading", { name: copy.teamLobbyTitle })).toBeVisible();
});
