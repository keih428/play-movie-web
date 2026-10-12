import type { Member } from "@/lib/domain/portal";

/**
 * 部員の Slack に DM を送る(コメントが付いた、「リーダーへ」が書かれた など)。
 * `SLACK_BOT_TOKEN`(chat:write を持つボット)が未設定なら何もしない。名簿に Slack の ID がない人にも送らない。
 * 知らせが失敗しても、保存そのものは止めない。
 */
async function callSlack(method: string, token: string, body: Record<string, unknown>) {
  try {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
    return (await response.json()) as { ok: boolean; error?: string; user?: string; team?: string };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "通信に失敗しました" };
  }
}

export async function notifyMembers(members: Member[], text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  const slackIds = [...new Set(members.map((member) => member.slackId).filter(Boolean))];
  if (!token || slackIds.length === 0) {
    return;
  }

  await Promise.all(
    slackIds.map(async (slackId) => {
      const result = await callSlack("chat.postMessage", token, {
        channel: slackId,
        text,
        unfurl_links: false,
      });
      if (!result.ok) {
        console.error("[portal-slack] failed", result.error);
      }
    }),
  );
}

/**
 * 遅刻・欠席のチャンネルに流す。`SLACK_ATTENDANCE_CHANNEL`(チャンネルの ID、C で始まる)が未設定なら何もしない。
 * ボットをそのチャンネルに招待しておく必要がある。うまくいったかどうかと、Slack が返した理由を返す。
 */
export async function postToAttendanceChannel(text: string): Promise<{ ok: boolean; detail: string }> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const channel = process.env.SLACK_ATTENDANCE_CHANNEL?.trim();
  if (!token || !channel) {
    return {
      ok: false,
      detail: !token
        ? "SLACK_BOT_TOKEN が入っていません。"
        : "SLACK_ATTENDANCE_CHANNEL(遅刻・欠席のチャンネルの ID)が入っていません。",
    };
  }

  const result = await callSlack("chat.postMessage", token, { channel, text, unfurl_links: false });
  if (!result.ok) {
    console.error("[portal-slack] attendance channel failed", result.error);
    return {
      ok: false,
      detail:
        result.error === "not_in_channel"
          ? "ボットがチャンネルに入っていません。Slack のそのチャンネルで、ボットを招待してください(/invite @ボットの名前)。"
          : `Slack に断られました:${result.error}`,
    };
  }
  return { ok: true, detail: "チャンネルに流しました。" };
}

export type SlackCheck = {
  step: string;
  ok: boolean;
  detail: string;
};

/**
 * 知らせが届かないときの調べもの。トークンがあるか・どの種類か・Slack に通るか・
 * その人に DM を送れるかを順に確かめて、Slack が返した理由をそのまま返す。
 */
export async function checkSlack(member: Member): Promise<SlackCheck[]> {
  const checks: SlackCheck[] = [];
  const token = process.env.SLACK_BOT_TOKEN?.trim();

  if (!token) {
    checks.push({
      step: "トークン",
      ok: false,
      detail:
        "このデプロイには SLACK_BOT_TOKEN が入っていません。Vercel で、いま開いている環境(Preview か Production)にチェックが入っているかを確かめ、入れたあとに Redeploy してください。",
    });
    return checks;
  }

  const isBotToken = token.startsWith("xoxb-");
  checks.push({
    step: "トークン",
    ok: isBotToken,
    detail: isBotToken
      ? "ボットのトークン(xoxb-)が入っています。"
      : `入っているのはボットのトークンではありません(${token.slice(0, 5)}… で始まっています)。Slack のアプリの「OAuth & Permissions」にある「Bot User OAuth Token」(xoxb- で始まる)を入れてください。`,
  });

  const auth = await callSlack("auth.test", token, {});
  checks.push({
    step: "Slack につながるか",
    ok: auth.ok,
    detail: auth.ok
      ? `つながりました(ワークスペース:${auth.team}、ボット:${auth.user})。`
      : `Slack に断られました:${auth.error}`,
  });
  if (!auth.ok) {
    return checks;
  }

  if (!member.slackId) {
    checks.push({
      step: "名簿の Slack の ID",
      ok: false,
      detail: `名簿の ${member.name} に Slack の ID が入っていません。名簿の「直す」から入れてください。`,
    });
    return checks;
  }
  const looksLikeMemberId = /^[UW][A-Z0-9]{6,}$/.test(member.slackId);
  checks.push({
    step: "名簿の Slack の ID",
    ok: looksLikeMemberId,
    detail: looksLikeMemberId
      ? `${member.slackId} が入っています。`
      : `「${member.slackId}」はメンバー ID の形ではありません。U で始まる英数字(例:U0123ABCD)を入れてください。表示名や @ の名前ではありません。`,
  });

  const message = await callSlack("chat.postMessage", token, {
    channel: member.slackId,
    text: "部内ページからのテストです。これが届いていれば、知らせは動いています。",
  });
  checks.push({
    step: "DM を送る",
    ok: message.ok,
    detail: message.ok
      ? "送りました。Slack の左の「App」のところ(ボットとの DM)を見てください。"
      : `Slack に断られました:${message.error}`,
  });
  return checks;
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
