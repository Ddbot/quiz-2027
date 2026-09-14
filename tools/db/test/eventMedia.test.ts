// Storage policy assertions for the `event-media` bucket (MILESTONE-04,
// openspec/changes/event-authoring-console). See design.md D2: admin-only
// write, public read.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAdminClient, createAnonClient, createUserClient } from "../src/adminClient.js";
import { createAdmin, createPlayer, type TestUser } from "../src/testUsers.js";

const admin = createAdminClient();
const BUCKET = "event-media";

let adminUser: TestUser;
let playerUser: TestUser;

// A minimal valid 1x1 PNG, used as a stand-in "image" upload — no EXIF
// tooling needed here, this suite only asserts the storage RLS policies.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

beforeAll(async () => {
  adminUser = await createAdmin("media-admin");
  playerUser = await createPlayer("media-player");
});

afterAll(async () => {
  // Best-effort cleanup of anything the admin-path test actually wrote.
  await admin.storage.from(BUCKET).remove(["test-object.png"]);
});

describe("event-media bucket access control", () => {
  it("denies an unauthenticated (anon) upload", async () => {
    const anon = createAnonClient();
    const { error } = await anon.storage
      .from(BUCKET)
      .upload("anon-attempt.png", PNG_BYTES, { contentType: "image/png", upsert: true });
    expect(error).not.toBeNull();
  });

  it("denies a non-admin authenticated upload", async () => {
    const client = createUserClient(playerUser.accessToken);
    const { error } = await client.storage
      .from(BUCKET)
      .upload("player-attempt.png", PNG_BYTES, { contentType: "image/png", upsert: true });
    expect(error).not.toBeNull();
  });

  it("allows an admin upload", async () => {
    const client = createUserClient(adminUser.accessToken);
    const { error } = await client.storage
      .from(BUCKET)
      .upload("test-object.png", PNG_BYTES, { contentType: "image/png", upsert: true });
    expect(error).toBeNull();
  });

  it("is readable by an unauthenticated request once stored", async () => {
    // Admin write above must have landed first (vitest runs `it`s in order
    // within a describe block by default).
    const anon = createAnonClient();
    const { data, error } = await anon.storage.from(BUCKET).download("test-object.png");
    expect(error).toBeNull();
    expect(data).not.toBeNull();

    // Also confirm the public URL form resolves, since that's what the
    // admin console will actually store as `event.waiting_media_path`.
    const { data: publicUrlData } = anon.storage.from(BUCKET).getPublicUrl("test-object.png");
    const response = await fetch(publicUrlData.publicUrl);
    expect(response.status).toBe(200);
  });
});
