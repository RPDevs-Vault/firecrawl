import undici from "undici";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../../config";
import { redisEvictConnection } from "../redis";
import { webhookQueue } from "./queue";
import { WebhookSender, webhookEventMatchesFilter } from "./delivery";
import { webhookSchema } from "./schema";
import { WebhookEvent, type WebhookConfig } from "./types";

vi.mock("../redis", () => ({
  redisEvictConnection: {
    llen: vi.fn(),
    lpop: vi.fn(),
    rpush: vi.fn(),
  },
}));

vi.mock("./queue", () => ({
  webhookQueue: {
    publish: vi.fn(),
  },
}));

const publicWebhook: WebhookConfig = {
  url: "https://webhooks.example.com/firecrawl",
  headers: {},
  metadata: {},
  events: ["completed", "failed", "page", "started"],
};

function makeSender(url: string): WebhookSender {
  return new WebhookSender({ ...publicWebhook, url }, undefined, {
    teamId: "team-1",
    jobId: "job-1",
    v0: false,
  });
}

describe("webhook delivery", () => {
  const originalAllowLocal = config.ALLOW_LOCAL_WEBHOOKS;
  const originalSelfHosted = config.TEST_SUITE_SELF_HOSTED;
  const originalDisableDelivery = config.DISABLE_WEBHOOK_DELIVERY;
  const originalUseRabbit = config.WEBHOOK_USE_RABBITMQ;
  const originalRabbitUrl = config.NUQ_RABBITMQ_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    config.ALLOW_LOCAL_WEBHOOKS = false;
    config.TEST_SUITE_SELF_HOSTED = false;
    config.DISABLE_WEBHOOK_DELIVERY = false;
    config.WEBHOOK_USE_RABBITMQ = false;
    config.NUQ_RABBITMQ_URL = undefined;
  });

  afterEach(() => {
    config.ALLOW_LOCAL_WEBHOOKS = originalAllowLocal;
    config.TEST_SUITE_SELF_HOSTED = originalSelfHosted;
    config.DISABLE_WEBHOOK_DELIVERY = originalDisableDelivery;
    config.WEBHOOK_USE_RABBITMQ = originalUseRabbit;
    config.NUQ_RABBITMQ_URL = originalRabbitUrl;
    vi.restoreAllMocks();
  });

  describe("webhookEventMatchesFilter", () => {
    it("matches full monitor event names", () => {
      expect(
        webhookEventMatchesFilter(
          ["monitor.page", "monitor.check.completed"],
          WebhookEvent.MONITOR_PAGE,
        ),
      ).toBe(true);
      expect(
        webhookEventMatchesFilter(
          ["monitor.page", "monitor.check.completed"],
          WebhookEvent.MONITOR_CHECK_COMPLETED,
        ),
      ).toBe(true);
    });

    it("keeps legacy subtype filters for non-monitor webhooks", () => {
      expect(webhookEventMatchesFilter(["page"], WebhookEvent.CRAWL_PAGE)).toBe(
        true,
      );
      expect(
        webhookEventMatchesFilter(["completed"], WebhookEvent.CRAWL_COMPLETED),
      ).toBe(true);
    });
  });

  describe("URL safety", () => {
    it("rejects webhook URLs with userinfo before delivery and never logs or queues them", async () => {
      expect(() =>
        webhookSchema.parse("https://user:pass@webhooks.example.com/hook"),
      ).toThrow(/Credentials are not allowed|Invalid URL/);

      const fetchSpy = vi.spyOn(undici, "fetch");
      const result = await makeSender(
        "https://user:pass@webhooks.example.com/hook",
      ).send(WebhookEvent.CRAWL_COMPLETED, {
        success: true,
        data: [],
        awaitWebhook: true,
      });

      expect(result).toEqual({
        attempted: true,
        delivered: false,
        skipped: true,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(webhookQueue.publish).not.toHaveBeenCalled();
      expect(redisEvictConnection.rpush).not.toHaveBeenCalled();
    });

    it.each([
      "http://127.0.0.1:3000/hook",
      "http://10.0.0.1/hook",
      "http://192.0.2.1/hook",
      "http://169.254.169.254/latest/meta-data",
      "http://[::ffff:127.0.0.1]/hook",
      "http://metadata.google.internal/hook",
    ])(
      "rejects hosted webhook destination %s before delivery",
      async unsafeUrl => {
        expect(() => webhookSchema.parse(unsafeUrl)).toThrow(/Invalid URL/);

        config.WEBHOOK_USE_RABBITMQ = true;
        config.NUQ_RABBITMQ_URL = "amqp://rabbitmq.example.com";
        const fetchSpy = vi.spyOn(undici, "fetch");
        const result = await makeSender(unsafeUrl).send(
          WebhookEvent.CRAWL_COMPLETED,
          {
            success: true,
            data: [],
            awaitWebhook: true,
          },
        );

        expect(result).toEqual({
          attempted: true,
          delivered: false,
          skipped: true,
        });
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(webhookQueue.publish).not.toHaveBeenCalled();
        expect(redisEvictConnection.rpush).not.toHaveBeenCalled();
      },
    );

    it("preserves legitimate public HTTPS webhook delivery and disables redirect following", async () => {
      const fetchSpy = vi.spyOn(undici, "fetch").mockResolvedValue({
        ok: true,
        status: 204,
      } as any);
      (redisEvictConnection.rpush as any).mockResolvedValue(1);

      const result = await makeSender(publicWebhook.url).send(
        WebhookEvent.CRAWL_COMPLETED,
        {
          success: true,
          data: [],
          awaitWebhook: true,
        },
      );

      expect(result).toEqual({
        attempted: true,
        delivered: true,
        queued: false,
        statusCode: 204,
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        publicWebhook.url,
        expect.objectContaining({
          method: "POST",
          redirect: "manual",
        }),
      );
      expect(redisEvictConnection.rpush).toHaveBeenCalledWith(
        "webhook-insert-queue",
        expect.stringContaining(publicWebhook.url),
      );
    });

    it("preserves explicit self-hosted local webhook compatibility", async () => {
      config.ALLOW_LOCAL_WEBHOOKS = true;
      config.TEST_SUITE_SELF_HOSTED = true;

      expect(webhookSchema.parse("http://127.0.0.1:3000/hook")).toMatchObject({
        url: "http://127.0.0.1:3000/hook",
      });
    });
  });
});
