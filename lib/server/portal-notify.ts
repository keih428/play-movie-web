/**
 * ログインまわりの知らせを、管理者の Slack に送る。
 * `PORTAL_ALERT_SLACK_WEBHOOK_URL`(Incoming Webhook)が未設定なら何もしない。
 * 知らせが失敗しても、ログインそのものは止めない。
 */
export async function notifyAdmin(text: string) {
  const webhookUrl = process.env.PORTAL_ALERT_SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    console.error("[portal-notify] failed", error instanceof Error ? error.message : error);
  }
}
