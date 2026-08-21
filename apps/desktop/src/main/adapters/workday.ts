/** Approved Workday tenant host suffix from the platform register. */
export const WORKDAY_HOST_SUFFIX = "myworkdayjobs.com";

/** Whether the URL belongs to a Workday tenant portal. */
export function isWorkdayHost(url: URL): boolean {
  if (url.protocol !== "https:") {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return host === WORKDAY_HOST_SUFFIX || host.endsWith(`.${WORKDAY_HOST_SUFFIX}`);
}
