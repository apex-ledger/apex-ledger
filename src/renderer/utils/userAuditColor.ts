const ACTOR_STYLES = [
  { row: 'bg-sky-50/70', badge: 'bg-sky-100 text-sky-800 ring-sky-200' },
  { row: 'bg-violet-50/70', badge: 'bg-violet-100 text-violet-800 ring-violet-200' },
  { row: 'bg-amber-50/70', badge: 'bg-amber-100 text-amber-800 ring-amber-200' },
  { row: 'bg-cyan-50/70', badge: 'bg-cyan-100 text-cyan-800 ring-cyan-200' },
  { row: 'bg-rose-50/70', badge: 'bg-rose-100 text-rose-800 ring-rose-200' },
] as const;

function actorIndex(actor: string): number {
  let hash = 0;
  for (let index = 0; index < actor.length; index += 1) hash = ((hash * 31) + actor.charCodeAt(index)) | 0;
  return Math.abs(hash) % ACTOR_STYLES.length;
}

export function userAuditStyle(actor: string | null | undefined, currentActor: string | null | undefined) {
  if (!actor) return { row: '', badge: 'bg-gray-100 text-gray-600 ring-gray-200' };
  if (currentActor && actor === currentActor) return { row: 'bg-emerald-50/40', badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200' };
  return ACTOR_STYLES[actorIndex(actor)];
}
