import { useStudyStore } from '../../store/useStudyStore';

function finishSession(subject: string, note?: string): string {
  const store = useStudyStore.getState();
  store.start({ focusMinutes: 25, breakMinutes: 5, subject, appBlockingEnabled: true, ambientSound: 'rain', presetLabel: 'Classic 25/5' });
  store.tick();
  store.endEarly();
  useStudyStore.getState().finish(note);
  return useStudyStore.getState().sessions[0].id;
}

const session = (id: string) => useStudyStore.getState().sessions.find((s) => s.id === id);

describe('study session detail', () => {
  it('records what the detail page shows', () => {
    const id = finishSession('Chemistry', 'Went well');
    const s = session(id)!;
    expect(s.subject).toBe('Chemistry');
    expect(s.notes).toBe('Went well');
    expect(s.presetLabel).toBe('Classic 25/5');
    expect(s.ambientSound).toBe('rain');
    expect(s.appBlockingEnabled).toBe(true);
    expect(s.startedAt).toBeDefined();
    expect(s.endedAt).toBeDefined();
    expect(s.comments).toEqual([]);
  });

  it('persists, edits and deletes comments', () => {
    const id = finishSession('History');
    useStudyStore.getState().addComment(id, '  Chapter 3 was hard  ');
    useStudyStore.getState().addComment(id, '   '); // blank is ignored
    let comments = session(id)!.comments!;
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe('Chapter 3 was hard');
    expect(comments[0].createdAt).toBeDefined();

    useStudyStore.getState().editComment(id, comments[0].id, 'Chapter 3 clicked on review');
    comments = session(id)!.comments!;
    expect(comments[0].text).toBe('Chapter 3 clicked on review');
    expect(comments[0].editedAt).toBeDefined();

    useStudyStore.getState().deleteComment(id, comments[0].id);
    expect(session(id)!.comments).toHaveLength(0);
  });

  it('edits the subject and note in place', () => {
    const id = finishSession('Maths', 'first');
    useStudyStore.getState().updateSession(id, { subject: 'Algebra', notes: '' });
    expect(session(id)!.subject).toBe('Algebra');
    expect(session(id)!.notes).toBeUndefined();
  });

  it('deletes a session and can undo it', () => {
    const id = finishSession('Biology');
    const previous = useStudyStore.getState().sessions;
    useStudyStore.getState().deleteSession(id);
    expect(session(id)).toBeUndefined();
    useStudyStore.getState().restoreSessions(previous);
    expect(session(id)).toBeDefined();
  });
});
