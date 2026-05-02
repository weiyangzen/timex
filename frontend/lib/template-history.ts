import type { TimeXUser } from "./types";
import type { Lang } from "./i18n";
import { isSelfConversationTarget } from "./default-conversations";

export type TemplateConversationHistory = {
  id: string;
  peerName: "Weiyang" | "AYuan";
  symbol: "WEIYANG" | "AYUAN";
  title: string;
  summary: string;
  status: "completed" | "active";
  messageCount: number;
  updatedAt: string;
  transcript: Array<{
    speaker: "user" | "peer";
    content: string;
    at: string;
  }>;
};

export type TemplateTradeHistory = {
  id: string;
  symbol: "WEIYANG" | "AYUAN";
  side: "buy" | "sell";
  title: string;
  quantity: number;
  priceCents: number;
  totalCents: number;
  status: "filled" | "listed" | "settled";
  executedAt: string;
};

function userDisplayName(user: TimeXUser | null | undefined): string {
  return user?.displayName || user?.loginName || "New role";
}

export function templateConversationHistories(user?: TimeXUser | null, lang: Lang = "en"): TemplateConversationHistory[] {
  const name = userDisplayName(user);
  const zh = lang === "zh";

  const histories: TemplateConversationHistory[] = [
    {
      id: "history-weiyang-onboarding",
      peerName: "Weiyang",
      symbol: "WEIYANG",
      title: zh ? "产品设置复盘" : "Product setup review",
      summary: zh
        ? `${name} 和 Weiyang 对齐了资料定位、首个 ticker 设置和启动流程。`
        : `${name} aligned profile positioning, first ticker setup, and launch workflow with Weiyang.`,
      status: "completed",
      messageCount: 8,
      updatedAt: "2026-05-02T10:24:00+08:00",
      transcript: [
        {
          speaker: "user",
          content: zh ? "我希望这个角色可以交易，但注册和上手不要太重。" : "I want this role to be tradable without making the onboarding too heavy.",
          at: "2026-05-02T09:48:00+08:00"
        },
        {
          speaker: "peer",
          content: zh
            ? "先从清楚的 ticker、一个可预约服务、以及用户一眼能理解的底价开始。"
            : "Start with a clear ticker, one bookable offer, and a base price that users can understand immediately.",
          at: "2026-05-02T09:52:00+08:00"
        },
        {
          speaker: "user",
          content: zh ? "那资料可以先保持轻量，等有真实需求再加厚。" : "Then the profile can stay lightweight until there is real demand.",
          at: "2026-05-02T10:03:00+08:00"
        },
        {
          speaker: "peer",
          content: zh
            ? "对。发现页保持可读，只在最终动作强制登录，让交易本身证明需求。"
            : "Yes. Keep discovery readable, force login only at final actions, and let trades prove demand.",
          at: "2026-05-02T10:24:00+08:00"
        }
      ]
    },
    {
      id: "history-ayuan-experience",
      peerName: "AYuan",
      symbol: "AYUAN",
      title: zh ? "会话语气校准" : "Conversation tone calibration",
      summary: zh
        ? `${name} 和 AYuan 测试了更温和的聊天流程，并把这段会话保留为参考。`
        : `${name} tested a warmer chat flow with AYuan and kept the session ready as a reference conversation.`,
      status: "completed",
      messageCount: 6,
      updatedAt: "2026-05-01T21:36:00+08:00",
      transcript: [
        {
          speaker: "user",
          content: zh ? "我需要会话直接一点，但不要显得冷。" : "I need the conversation to feel direct but not cold.",
          at: "2026-05-01T20:55:00+08:00"
        },
        {
          speaker: "peer",
          content: zh ? "那第一轮就保持实用：你想决定什么、购买什么、或预约什么？" : "Then keep the first turn practical: what do you want to decide, buy, or schedule?",
          at: "2026-05-01T21:01:00+08:00"
        },
        {
          speaker: "user",
          content: zh ? "资料页应该让下一步动作很明显。" : "The profile should make it obvious what the next action is.",
          at: "2026-05-01T21:19:00+08:00"
        },
        {
          speaker: "peer",
          content: zh ? "很好。可见历史可以像起步路径，而不是教程。" : "Good. The visible history can act like a starter path, not a tutorial.",
          at: "2026-05-01T21:36:00+08:00"
        }
      ]
    }
  ];

  return histories.filter((history) => !isSelfConversationTarget(user, history.symbol));
}

export function templateTradeHistories(lang: Lang = "en"): TemplateTradeHistory[] {
  const zh = lang === "zh";
  return [
    {
      id: "trade-ayuan-buy-20260502",
      symbol: "AYUAN",
      side: "buy",
      title: zh ? "买入 AYUAN 时间席位" : "Bought AYUAN time seat",
      quantity: 1,
      priceCents: 16800,
      totalCents: 16800,
      status: "filled",
      executedAt: "2026-05-02T11:18:00+08:00"
    },
    {
      id: "trade-weiyang-buy-20260501",
      symbol: "WEIYANG",
      side: "buy",
      title: zh ? "买入 WEIYANG 咨询席位" : "Bought WEIYANG advisory seat",
      quantity: 1,
      priceCents: 12800,
      totalCents: 12800,
      status: "settled",
      executedAt: "2026-05-01T17:42:00+08:00"
    },
    {
      id: "trade-ayuan-list-20260430",
      symbol: "AYUAN",
      side: "sell",
      title: zh ? "重新挂售 AYUAN 席位" : "Relisted AYUAN seat",
      quantity: 1,
      priceCents: 18800,
      totalCents: 18800,
      status: "listed",
      executedAt: "2026-04-30T22:08:00+08:00"
    },
    {
      id: "trade-weiyang-buy-20260429",
      symbol: "WEIYANG",
      side: "buy",
      title: zh ? "买入 WEIYANG 后续时间窗" : "Bought WEIYANG follow-up window",
      quantity: 1,
      priceCents: 11700,
      totalCents: 11700,
      status: "filled",
      executedAt: "2026-04-29T15:12:00+08:00"
    }
  ];
}
