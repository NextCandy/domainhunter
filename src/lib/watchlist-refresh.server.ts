import { query } from "@/lib/db.server";
import { sendNotification } from "@/lib/enrich.server";
import { lookupDomain } from "@/lib/rdap.server";

type WatchRow = {
  id: number;
  notify_before_drop: boolean;
  notify_on_available: boolean;
  last_notified_status: string | null;
  domain: string;
  current_status: string | null;
  drop_date: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __domainHunterWatchlistScheduler:
    | { started: boolean; running: boolean; timer?: ReturnType<typeof setInterval> }
    | undefined;
}

function settingValue<T = unknown>(settings: Record<string, unknown>, key: string, fallback: T): T {
  const value = settings[key];
  if (value == null || value === "") return fallback;
  return value as T;
}

async function loadSettings() {
  const { rows } = await query<{ key: string; value: unknown }>(
    `SELECT key, value FROM public.app_settings WHERE key IN ('notify_bark', 'notify_webhook', 'notify_before_drop_days')`,
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value])) as Record<string, unknown>;
}

async function notify(row: WatchRow, eventKey: string, title: string, body: string, settings: Record<string, unknown>) {
  if (row.last_notified_status === eventKey) return;
  const bark = settingValue<string | undefined>(settings, "notify_bark", undefined);
  const webhook = settingValue<string | undefined>(settings, "notify_webhook", undefined);
  if (!bark && !webhook) return;

  const results = await sendNotification({ bark, webhook }, title, body);
  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.warn("[观察通知] 推送失败", { domain: row.domain, eventKey, failed });
  }
  if (results.some((item) => item.ok)) {
    await query(
      `UPDATE public.watchlist
       SET last_notified_at = now(), last_notified_status = $2
       WHERE id = $1`,
      [row.id, eventKey],
    );
  }
}

export async function refreshWatchlistStatus() {
  const settings = await loadSettings();
  const beforeDays = Math.max(1, Math.min(30, Number(settingValue(settings, "notify_before_drop_days", 3))));
  const { rows } = await query<WatchRow>(`
    SELECT
      w.id,
      w.notify_before_drop,
      w.notify_on_available,
      w.last_notified_status,
      d.domain,
      d.status AS current_status,
      d.drop_date
    FROM public.watchlist w
    JOIN public.domains d ON d.id = w.domain_id
    WHERE w.status IN ('watching', 'target')
    ORDER BY w.updated_at DESC
    LIMIT 1000
  `);

  const now = Date.now();
  const soonMs = beforeDays * 24 * 60 * 60 * 1000;
  let checked = 0;
  let notified = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const lookup = await lookupDomain(row.domain, { timeoutMs: 20_000, retries: 1 });
      checked += 1;
      const nextStatus =
        lookup.status === "available" ? "available" :
        lookup.status === "registered" ? "registered" :
        lookup.status === "unsupported" ? "unsupported" :
        row.current_status ?? "unknown";

      await query(
        `UPDATE public.domains
         SET status = $2,
             last_checked_at = now(),
             expiry_date = COALESCE($3::timestamptz, expiry_date)
         WHERE domain = $1`,
        [row.domain, nextStatus, lookup.expiresDate ?? null],
      );

      if (row.notify_on_available && nextStatus === "available") {
        await notify(
          row,
          "available",
          "DomainHunter：域名可注册",
          `${row.domain} 当前状态为可注册，请尽快处理。`,
          settings,
        );
        notified += 1;
      }

      if (row.notify_before_drop && row.drop_date) {
        const dropAt = new Date(row.drop_date).getTime();
        if (Number.isFinite(dropAt) && dropAt >= now && dropAt - now <= soonMs) {
          const day = new Date(row.drop_date).toISOString().slice(0, 10);
          await notify(
            row,
            `drop:${day}`,
            "DomainHunter：域名临近删除",
            `${row.domain} 预计删除日期为 ${day}，已进入 ${beforeDays} 天提醒窗口。`,
            settings,
          );
          notified += 1;
        }
      }
    } catch (error: any) {
      failed += 1;
      console.warn("[观察刷新] 单个域名刷新失败", row.domain, error?.message ?? error);
    }
  }

  return { checked, notified, failed };
}

export function startWatchlistScheduler() {
  const state = globalThis.__domainHunterWatchlistScheduler ?? { started: false, running: false };
  globalThis.__domainHunterWatchlistScheduler = state;
  if (state.started) return;
  state.started = true;

  const run = async () => {
    if (state.running) return;
    state.running = true;
    try {
      const result = await refreshWatchlistStatus();
      console.info("[观察刷新] 定时任务完成", result);
    } catch (error: any) {
      console.warn("[观察刷新] 定时任务失败", error?.message ?? error);
    } finally {
      state.running = false;
    }
  };

  state.timer = setInterval(run, 6 * 60 * 60 * 1000);
  state.timer.unref?.();
  void run();
}
