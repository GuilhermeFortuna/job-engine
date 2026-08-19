import { session, Session } from "electron";
import { DesktopConfig, isLoopbackOrigin } from "./config";

export function configureApplicationSession(
  config: DesktopConfig,
  onDownloadDenied?: (url: string) => void
): Session {
  const ses = session.fromPartition(config.sessionPartition);

  // Deny all permission requests
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  // Deny all permission checks
  ses.setPermissionCheckHandler(() => {
    return false;
  });

  // Deny all downloads
  ses.on("will-download", (event, item) => {
    event.preventDefault();
    item.cancel();
    if (onDownloadDenied) {
      onDownloadDenied(item.getURL());
    }
  });

  // In test mode, allow self-signed certificates strictly for loopback origins
  if (config.isTest) {
    ses.setCertificateVerifyProc((request, callback) => {
      const host = request.hostname.toLowerCase();
      const isLoopback =
        host === "127.0.0.1" ||
        host === "localhost" ||
        host === "::1" ||
        host === "[::1]";
      if (isLoopback) {
        callback(0); // 0 = success / trust
      } else {
        callback(-2); // -2 = default verification failure
      }
    });
  }

  return ses;
}
