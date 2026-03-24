import { createRequire } from "module"; const require = createRequire(import.meta.url);

// amplify/functions/telegramWebhook/handler.ts
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
var s3 = new S3Client({});
var lambda = new LambdaClient({});
var secrets = new SecretsManagerClient({});
var screenshotBucket = process.env.TELEGRAM_SCREENSHOT_BUCKET_NAME ?? "";
var ocrFunctionName = process.env.TELEGRAM_OCR_FUNCTION_NAME ?? "";
var telegramSecretName = process.env.TELEGRAM_SECRET_NAME ?? "";
var telegramSecretCache = null;
var json = (statusCode, payload) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
});
var getTelegramSecret = async () => {
  if (telegramSecretCache) {
    return telegramSecretCache;
  }
  if (!telegramSecretName) {
    throw new Error("Missing TELEGRAM_SECRET_NAME");
  }
  const response = await secrets.send(new GetSecretValueCommand({
    SecretId: telegramSecretName
  }));
  const secretString = response.SecretString ?? "{}";
  telegramSecretCache = JSON.parse(secretString);
  return telegramSecretCache;
};
var getAllowedChatIds = (secret) => {
  const raw = secret.allowedChatIds;
  if (Array.isArray(raw)) {
    return new Set(raw.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0));
  }
  return new Set(
    String(raw ?? "").split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0)
  );
};
var sendTelegramMessage = async (chatId, text, botToken) => {
  if (!botToken || !chatId) {
    return;
  }
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });
};
var getTelegramFilePath = async (fileId, botToken) => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!response.ok) {
    throw new Error(`Telegram getFile failed with status ${response.status}`);
  }
  const data = await response.json();
  if (!data.ok || !data.result?.file_path) {
    throw new Error("Telegram getFile did not return a file path");
  }
  return data.result.file_path;
};
var buildScreenshotKey = (updateId, fileId, filePath) => {
  const now = /* @__PURE__ */ new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const ext = filePath.includes(".") ? filePath.slice(filePath.lastIndexOf(".")) : ".jpg";
  return `telegram/${yyyy}/${mm}/${dd}/${updateId ?? Date.now()}-${fileId}${ext}`;
};
var getMessage = (update) => update.message ?? update.edited_message ?? update.channel_post ?? null;
var getTelegramPhotoFileId = (message) => {
  const photo = [...message.photo ?? []].sort((a, b) => {
    const areaA = (a.width ?? 0) * (a.height ?? 0);
    const areaB = (b.width ?? 0) * (b.height ?? 0);
    return areaB - areaA;
  })[0];
  if (photo?.file_id) {
    return photo.file_id;
  }
  if (message.document?.mime_type?.startsWith("image/") && message.document.file_id) {
    return message.document.file_id;
  }
  return null;
};
var handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { message: "Method not allowed" });
  }
  if (!screenshotBucket || !ocrFunctionName || !telegramSecretName) {
    return json(500, { message: "Telegram webhook is not configured" });
  }
  const telegramSecret = await getTelegramSecret();
  const telegramBotToken = telegramSecret.botToken ?? "";
  const telegramWebhookSecret = telegramSecret.webhookSecret ?? "";
  const telegramTargetUserId = telegramSecret.targetUserId ?? "";
  const telegramAllowedChatIds = getAllowedChatIds(telegramSecret);
  if (!telegramBotToken || !telegramTargetUserId) {
    return json(500, { message: "Telegram secret payload is incomplete" });
  }
  const receivedSecret = event.headers["x-telegram-bot-api-secret-token"] ?? event.headers["X-Telegram-Bot-Api-Secret-Token"] ?? "";
  if (telegramWebhookSecret && receivedSecret !== telegramWebhookSecret) {
    return json(401, { message: "Unauthorized" });
  }
  if (!event.body) {
    return json(400, { message: "Missing request body" });
  }
  const update = JSON.parse(event.body);
  const message = getMessage(update);
  if (!message) {
    return json(200, { ignored: true, reason: "No message payload" });
  }
  const chatId = String(message.chat?.id ?? "");
  if (telegramAllowedChatIds.size > 0 && !telegramAllowedChatIds.has(chatId)) {
    return json(200, { ignored: true, reason: "Chat not allowed" });
  }
  const fileId = getTelegramPhotoFileId(message);
  if (!fileId) {
    await sendTelegramMessage(chatId, "Send a trade screenshot as a photo or image document.", telegramBotToken);
    return json(200, { ignored: true, reason: "No image found" });
  }
  try {
    const filePath = await getTelegramFilePath(fileId, telegramBotToken);
    const fileResponse = await fetch(`https://api.telegram.org/file/bot${telegramBotToken}/${filePath}`);
    if (!fileResponse.ok) {
      throw new Error(`Telegram file download failed with status ${fileResponse.status}`);
    }
    const body = Buffer.from(await fileResponse.arrayBuffer());
    const key = buildScreenshotKey(update.update_id, fileId, filePath);
    const contentType = message.document?.mime_type || fileResponse.headers.get("content-type") || "image/jpeg";
    await s3.send(new PutObjectCommand({
      Bucket: screenshotBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: {
        telegramchatid: chatId,
        telegrammessageid: String(message.message_id ?? ""),
        telegramfileid: fileId
      }
    }));
    await lambda.send(new InvokeCommand({
      FunctionName: ocrFunctionName,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify({
        screenshotBucket,
        screenshotKey: key,
        contentType,
        caption: message.caption ?? message.text ?? "",
        chatId,
        messageId: String(message.message_id ?? ""),
        targetUserId: telegramTargetUserId
      }))
    }));
    await sendTelegramMessage(chatId, "Screenshot received. Processing trade details now.", telegramBotToken);
    return json(200, { accepted: true });
  } catch (error) {
    console.error("Telegram webhook failed", { error });
    await sendTelegramMessage(chatId, "I could not process that screenshot. Please try again.", telegramBotToken);
    return json(500, { message: "Failed to process Telegram update" });
  }
};
export {
  handler
};
