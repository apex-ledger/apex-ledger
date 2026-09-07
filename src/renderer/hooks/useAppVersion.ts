import { useIpcQuery } from './useIpcQuery';

/** The version from package.json, by way of the main process — the same number the installer,
 * the About screen and the update check use. Nothing in the renderer should spell it by hand. */
export function useAppVersion(): string | null {
  const { data } = useIpcQuery(() => window.api.app.getVersion(), []);
  return data ?? null;
}
