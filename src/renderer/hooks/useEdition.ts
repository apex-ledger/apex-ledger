import { useEffect, useState } from 'react';
import { editionDefinition, editionsWith, hasFeature, type Edition, type Feature } from '@shared/domain/licensing/editions';

/** Which edition this install is licensed for, and what it unlocks.
 *
 * Reads the licence once and holds it. The edition cannot change while the app is open — a new key
 * is entered on the licence screen, which reloads — so re-reading it on every screen would be work
 * for nothing.
 *
 * Defaults to the FULL edition until the licence has actually been read. Gating on an unknown
 * licence would flash "not available" across half the app on every launch, and a user who owns the
 * feature would see it disappear and come back. The real gate is the licence check at startup; this
 * only decides what to draw.
 */
export function useEdition(): {
  edition: Edition;
  loaded: boolean;
  can: (feature: Feature) => boolean;
  /** Editions that would unlock a feature this one lacks — what an upgrade prompt should name. */
  upgradesFor: (feature: Feature) => string[];
  label: string;
} {
  const [edition, setEdition] = useState<Edition>('full');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.api.license.status({}).then((r) => {
      if (cancelled) return;
      if (r.ok && r.data.edition) setEdition(r.data.edition);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    edition,
    loaded,
    can: (feature: Feature) => hasFeature(edition, feature),
    upgradesFor: (feature: Feature) => editionsWith(feature).map((e) => e.label),
    label: editionDefinition(edition).label,
  };
}
