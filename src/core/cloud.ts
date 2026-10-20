// Maker, Power Automate and admin-center hosts for the cloud an environment lives in, from its Dataverse host.
// US Government hosts: https://learn.microsoft.com/power-platform/admin/powerapps-us-government (service URLs table).
// China (21Vianet) hosts are the published ones but were not verified against a live tenant.
export interface CloudHosts { name: string; maker: string; flow: string; admin: string }

const COMMERCIAL: CloudHosts = { name: 'Commercial', maker: 'https://make.powerapps.com', flow: 'https://make.powerautomate.com', admin: 'https://admin.powerplatform.microsoft.com' };
const CLOUDS: [RegExp, CloudHosts][] = [
  [/\.crm9\.dynamics\.com$/i, { name: 'GCC', maker: 'https://make.gov.powerapps.us', flow: 'https://gov.flow.microsoft.us', admin: 'https://gcc.admin.powerplatform.microsoft.us' }],
  [/\.(crm\.)?microsoftdynamics\.us$/i, { name: 'GCC High', maker: 'https://make.high.powerapps.us', flow: 'https://high.flow.microsoft.us', admin: 'https://high.admin.powerplatform.microsoft.us' }],
  [/\.(crm\.)?appsplatform\.us$/i, { name: 'DoD', maker: 'https://make.apps.appsplatform.us', flow: 'https://flow.appsplatform.us', admin: 'https://admin.appsplatform.us' }],
  [/\.crm\.dynamics\.cn$/i, { name: 'China', maker: 'https://make.powerapps.cn', flow: 'https://make.powerautomate.cn', admin: 'https://admin.powerplatform.azure.cn' }]
];

export function cloudFor(clientUrl: string): CloudHosts {
  let host = ''; try { host = new URL(clientUrl).hostname; } catch { return COMMERCIAL; }
  return CLOUDS.find(([pattern]) => pattern.test(host))?.[1] ?? COMMERCIAL;
}

/** The admin center page of an environment, or its home when the environment id is unknown. */
export function adminCenterUrl(clientUrl: string, environmentId?: string): string {
  const { admin } = cloudFor(clientUrl);
  return environmentId ? `${admin}/environments/environment/${encodeURIComponent(environmentId)}/hub` : admin;
}
