export const ADMIN_PORTAL_HOST = "admin-probet-tips.vercel.app";
export const ADMIN_PORTAL_URL = `https://${ADMIN_PORTAL_HOST}`;
export const USER_APP_URL = "https://probet-tips.vercel.app";

export function isAdminPortalHost(): boolean {
  return window.location.hostname === ADMIN_PORTAL_HOST;
}

export function shouldRedirectAdminPathToPortal(): boolean {
  if (isAdminPortalHost()) return false;

  const host = window.location.hostname;
  const isWorkspacePreview =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".replit.dev") ||
    host.endsWith(".replit.app");

  return !isWorkspacePreview;
}
