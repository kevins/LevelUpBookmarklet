import type { DynamicsContext } from './types';
import { openUrl } from './xrm-helpers';

/**
 * Opens a link that first needs a lookup (environment id, metadata) without losing the click: Edge only allows a new
 * tab while the click is fresh, so an empty tab is opened right away and sent to the address once it is known.
 * A failed lookup closes that tab and rethrows.
 */
export function openWhenReady(ctx: DynamicsContext, url: string | Promise<string>): Promise<void> {
  if (typeof url === 'string') { openUrl(ctx, url); return Promise.resolve(); }
  let target: Window | null = null;
  try { target = ctx.sourceWindow.open('', '_blank'); } catch { /* reported below */ }
  if (!target) return url.then(href => openUrl(ctx, href));
  const tab = target; try { tab.opener = null; } catch { /* already isolated */ }
  return url.then(href => { tab.location.href = href; }, error => { try { tab.close(); } catch { /* user closed it */ } throw error; });
}
