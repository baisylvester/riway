import { test, expect, type Page } from "@playwright/test";

test.skip(
  process.env.RIWAY_DISPOSABLE_BROWSER !== "1",
  "Requires the isolated component fixture; never contacts a transcription provider.",
);

type VoiceTest = {
  calls: number;
  stops: number;
  recorders: number;
  uploads: number;
  aborted: boolean;
  delayMicrophone: boolean;
  releaseMicrophone: () => void;
  releaseResponse: () => void;
};
async function setup(page: Page, delayMicrophone = false) {
  await page.addInitScript(
    ({ delayMicrophone }) => {
      const state = {
        calls: 0,
        stops: 0,
        recorders: 0,
        uploads: 0,
        aborted: false,
        delayMicrophone,
        releaseMicrophone: () => {},
        releaseResponse: () => {},
      };
      Object.assign(window, { voiceTest: state });
      const captured = { getTracks: () => [{ stop: () => state.stops++ }] };
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            state.calls++;
            if (state.delayMicrophone)
              await new Promise<void>((resolve) => {
                state.releaseMicrophone = resolve;
              });
            return captured;
          },
        },
      });
      class Recorder {
        static isTypeSupported() {
          return true;
        }
        state = "inactive";
        ondataavailable?: (e: { data: Blob }) => void;
        onstop?: () => void;
        constructor() {
          state.recorders++;
        }
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
          this.ondataavailable?.({
            data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])]),
          });
          queueMicrotask(() => this.onstop?.());
        }
      }
      Object.defineProperty(window, "MediaRecorder", {
        value: Recorder,
        configurable: true,
      });
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (String(input) !== "/api/assistant/voice")
          return originalFetch(input, init);
        state.uploads++;
        init?.signal?.addEventListener("abort", () => {
          state.aborted = true;
        });
        // Deliberately ignore cancellation in this fake transport to prove that a
        // late response cannot repopulate the question after consent is withdrawn.
        return new Promise((resolve) => {
          state.releaseResponse = () =>
            resolve(
              new Response(
                JSON.stringify({ text: "Late synthetic transcript" }),
                { headers: { "content-type": "application/json" } },
              ),
            );
        });
      };
    },
    { delayMicrophone },
  );
  await page.goto("http://127.0.0.1:4682/fixture/assistant-voice");
  await page.getByLabel(/I agree to use the product assistant/).check();
  await page.getByLabel(/I consent to sending this recording/).check();
}
const metrics = (page: Page) =>
  page.evaluate(() => {
    const state = (window as unknown as { voiceTest: VoiceTest }).voiceTest;
    return {
      calls: state.calls,
      stops: state.stops,
      recorders: state.recorders,
      uploads: state.uploads,
      aborted: state.aborted,
    };
  });

test("withdrawing consent while microphone permission is pending discards the stream", async ({
  page,
}) => {
  await setup(page, true);
  await page.getByRole("button", { name: "Record question" }).click();
  await expect.poll(async () => (await metrics(page)).calls).toBe(1);
  await expect(
    page.getByRole("button", { name: "Record question" }),
  ).toBeDisabled();
  await page.getByLabel(/I agree to use the product assistant/).uncheck();
  await page.evaluate(() =>
    (
      window as unknown as { voiceTest: VoiceTest }
    ).voiceTest.releaseMicrophone(),
  );
  await expect.poll(async () => (await metrics(page)).stops).toBeGreaterThan(0);
  expect(await metrics(page)).toMatchObject({
    calls: 1,
    recorders: 0,
    uploads: 0,
  });
});

for (const label of [
  /I agree to use the product assistant/,
  /I consent to sending this recording/,
]) {
  test(`withdrawing ${label.source} stops active recording without upload`, async ({
    page,
  }) => {
    await setup(page);
    await page.getByRole("button", { name: "Record question" }).click();
    await expect(
      page.getByRole("button", { name: "Stop recording" }),
    ).toBeVisible();
    await page.getByLabel(label).uncheck();
    await expect(
      page.getByRole("button", { name: "Record question" }),
    ).toBeDisabled();
    await expect
      .poll(async () => (await metrics(page)).stops)
      .toBeGreaterThan(0);
    expect((await metrics(page)).uploads).toBe(0);
  });
}

test("withdrawing consent aborts transcription and ignores a late response", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Record question" }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect.poll(async () => (await metrics(page)).uploads).toBe(1);
  await page.getByLabel(/I agree to use the product assistant/).uncheck();
  await expect.poll(async () => (await metrics(page)).aborted).toBe(true);
  await page.evaluate(() =>
    (window as unknown as { voiceTest: VoiceTest }).voiceTest.releaseResponse(),
  );
  await expect(page.getByLabel("Question", { exact: true })).toHaveValue("");
  await expect(page.getByRole("status")).not.toContainText(
    "Review the transcription",
  );
});
