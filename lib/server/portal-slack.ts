import type { Member } from "@/lib/domain/portal";

/**
 * 部員の Slack に DM を送る(コメントが付いた、「リーダーへ」が書かれた など)。
 * `SLACK_BOT_TOKEN`(chat:write を持つボット)が未設定なら何もしない。名簿に Slack の ID がない人にも送らない。
 * 知らせが失敗しても、保存そのものは止めない。
 */
export async function notifyMembers(members: Member[], text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  const slackIds = [...new Set(members.map((member) => member.slackId).filter(Boolean))];
  if (!token || slackIds.length === 0) {
    return;
  }

  await Promise.all(
    slackIds.map(async (slackId) => {
      try {
        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({ channel: slackId, text, unfurl_links: false }),
        });
        const result = (await response.json()) as { ok: boolean; error?: string };
        if (!result.ok) {
          console.error("[portal-slack] failed", result.error);
        }
      } catch (error) {
        console.error("[portal-slack] failed", error instanceof Error ? error.message : error);
      }
    }),
  );
}

/** 長い文は、知らせの中では頭だけ見せる。 */
export function excerpt(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 知らせに入れるリンクの頭(https://…)。Vercel では実際に開かれた URL から取る。 */
export function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${protocol}://${host}`;
}
