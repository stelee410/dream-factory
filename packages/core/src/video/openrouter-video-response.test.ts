import assert from "node:assert/strict";
import test from "node:test";
import {
  extractVideoRefFromOpenRouterResponse,
  resolveOpenRouterVideoApiBase,
  unsignedUrlFromCompletedJob,
} from "./openrouter-video.js";

test("extractVideoRefFromOpenRouterResponse: message.videos with url", () => {
  const url = "https://cdn.example.com/out.mp4";
  const ref = extractVideoRefFromOpenRouterResponse({
    choices: [{ message: { role: "assistant", videos: [{ url }] } }],
  });
  assert.equal(ref, url);
});

test("extractVideoRefFromOpenRouterResponse: message.videos with nested video_url", () => {
  const url = "https://cdn.example.com/clip.webm";
  const ref = extractVideoRefFromOpenRouterResponse({
    choices: [{ message: { role: "assistant", videos: [{ video_url: { url } }] } }],
  });
  assert.equal(ref, url);
});

test("extractVideoRefFromOpenRouterResponse: content video_url part", () => {
  const url = "https://x.test/v.mp4";
  const ref = extractVideoRefFromOpenRouterResponse({
    choices: [
      {
        message: {
          role: "assistant",
          content: [{ type: "video_url", video_url: { url } }],
        },
      },
    ],
  });
  assert.equal(ref, url);
});

test("extractVideoRefFromOpenRouterResponse: plain string with mp4 link", () => {
  const ref = extractVideoRefFromOpenRouterResponse({
    choices: [
      {
        message: {
          role: "assistant",
          content: "Here is the video: https://cdn.example.com/a.mp4 thanks",
        },
      },
    ],
  });
  assert.equal(ref, "https://cdn.example.com/a.mp4");
});

test("extractVideoRefFromOpenRouterResponse: throws when missing", () => {
  assert.throws(() => extractVideoRefFromOpenRouterResponse({ choices: [] }), /No message/);
});

test("resolveOpenRouterVideoApiBase: from /api/v1", () => {
  assert.equal(
    resolveOpenRouterVideoApiBase("https://openrouter.ai/api/v1"),
    "https://openrouter.ai/api/alpha/videos"
  );
  assert.equal(
    resolveOpenRouterVideoApiBase("https://openrouter.ai/api/v1/"),
    "https://openrouter.ai/api/alpha/videos"
  );
});

test("unsignedUrlFromCompletedJob: returns first url", () => {
  const u = "https://openrouter.ai/api/alpha/videos/job/content?index=0";
  assert.equal(
    unsignedUrlFromCompletedJob({
      id: "job",
      status: "completed",
      unsigned_urls: [u],
    }),
    u
  );
});

test("unsignedUrlFromCompletedJob: throws when missing", () => {
  assert.throws(
    () =>
      unsignedUrlFromCompletedJob({
        id: "job",
        status: "completed",
        unsigned_urls: [],
      }),
    /unsigned_urls/
  );
});
