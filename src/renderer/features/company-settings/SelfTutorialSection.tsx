import { useEffect, useState } from 'react';
import { LESSONS, LESSON_GROUPS } from '@shared/domain/voice/lessons';
import { useUiStore } from '../../app/store/uiStore';

const DONE_KEY = 'voiceAgent.lessonsDone';

export function readLessonsDone(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
export function markLessonDone(id: string): void {
  try { const done = readLessonsDone(); done.add(id); localStorage.setItem(DONE_KEY, JSON.stringify([...done])); window.dispatchEvent(new Event('voiceAgent.lessonsDone')); } catch { /* private window */ }
}

/** Settings → Self tutorial: every lesson the voice agent can teach, grouped the way a company is
 * set up and run, with a Start button each and a tick once it has been completed on this computer. */
export function SelfTutorialSection() {
  const setPendingLessonId = useUiStore((s) => s.setPendingLessonId);
  const [done, setDone] = useState<Set<string>>(() => readLessonsDone());
  useEffect(() => {
    const refresh = () => setDone(readLessonsDone());
    window.addEventListener('voiceAgent.lessonsDone', refresh);
    return () => window.removeEventListener('voiceAgent.lessonsDone', refresh);
  }, []);
  const total = LESSONS.length;
  const completed = LESSONS.filter((l) => done.has(l.id)).length;
  const minutes = LESSONS.reduce((s, l) => s + l.minutes, 0);

  return (
    <section className="col-span-full mt-2 rounded border border-gray-200 bg-white p-3" data-testid="self-tutorial">
      <h2 className="mb-1 text-sm font-semibold text-gray-800">Self tutorial — {total} lessons the voice agent can teach</h2>
      <p className="mb-3 text-xs text-gray-600">
        The voice agent walks you through each screen on the real page, pointing at every field and button in turn and saying what to do with it. Nothing is entered for you. Press Start, or say “teach me” and the topic to the agent. {completed} of {total} done · about {minutes} minutes in all.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {LESSON_GROUPS.map((group) => {
          const lessons = LESSONS.filter((l) => l.group === group);
          if (lessons.length === 0) return null;
          return (
            <div key={group} className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">{group}</div>
              <ul className="divide-y divide-gray-200">
                {lessons.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm">
                    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${done.has(l.id) ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 text-transparent'}`} aria-label={done.has(l.id) ? 'Completed' : 'Not yet'}>✓</span>
                    <span className="min-w-[10rem] flex-1 text-gray-800">{l.title}</span>
                    <span className="whitespace-nowrap text-xs text-gray-400">{l.steps.length} steps · {l.minutes} min</span>
                    <button type="button" onClick={() => setPendingLessonId(l.id)} className="whitespace-nowrap rounded-full bg-brand-100 px-3 py-0.5 text-xs font-medium text-brand-800 hover:bg-brand-200">{done.has(l.id) ? 'Again' : 'Start'}</button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
