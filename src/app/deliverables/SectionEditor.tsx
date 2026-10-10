import { memo, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { lockedBy, repo } from '../../lib/deliverables';
import { countWords } from '../../lib/docModel';
import type { DocSection } from '../../lib/types';

/* One section of a deliverable: its own editor, autosave and soft lock.
   While someone types in a section, it is theirs; others see it read-only
   until they stop for LOCK_MS. */

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export function makeExtensions(placeholder: string) {
  return [
    StarterKit.configure({ codeBlock: false, code: false, heading: { levels: [1, 2, 3] } }),
    Underline,
    Highlight,
    Link.configure({ openOnClick: false, autolink: true, protocols: ['mailto'], HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder }),
    Image.configure({ inline: false, allowBase64: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
  ];
}

const parse = (s: string) => {
  try {
    return JSON.parse(s || '{"type":"doc","content":[]}');
  } catch {
    return { type: 'doc', content: [] };
  }
};

const MAX_BYTES = 900_000; // Firestore documents stop at 1 MB

interface Props {
  deliverableId: string;
  section: DocSection;
  me: string;
  canWrite: boolean;
  nameOf: (email: string) => string;
  onActive: (editor: Editor, sectionId: string) => void;
  onWords: (sectionId: string, words: number) => void;
  onState: (sectionId: string, state: SaveState, info?: string) => void;
  /** registry so the page can flush everything before leaving */
  registerFlush: (sectionId: string, flush: (() => Promise<void>) | null) => void;
}

function SectionEditorInner({ deliverableId, section, me, canWrite, nameOf, onActive, onWords, onState, registerFlush }: Props) {
  const baseRev = useRef(section.rev);
  const dirty = useRef(false);
  const focused = useRef(false);
  const saving = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const firstDirtyAt = useRef(0);
  const releaseTimer = useRef<number | undefined>(undefined);
  const [conflict, setConflict] = useState<DocSection | null>(null);
  const [heldBy, setHeldBy] = useState('');
  const [, tick] = useState(0);
  const stateRef = useRef<SaveState>('saved');
  // the editor's callbacks are bound once, so everything they read goes through refs
  const edRef = useRef<Editor | null>(null);
  const canWriteRef = useRef(canWrite);
  canWriteRef.current = canWrite;
  const setState = (s: SaveState, info?: string) => {
    stateRef.current = s;
    onState(section.id, s, info);
  };

  const editor = useEditor(
    {
      extensions: makeExtensions(section.hint || 'Start writing'),
      content: parse(section.content),
      editable: canWrite,
      shouldRerenderOnTransaction: false,
      editorProps: { attributes: { class: 'doc-prose', spellcheck: 'true', 'aria-label': section.title } },
      onCreate: ({ editor }) => {
        edRef.current = editor;
        onWords(section.id, countWords(editor.getText({ blockSeparator: '\n' })));
      },
      onUpdate: ({ editor }) => {
        onWords(section.id, countWords(editor.getText({ blockSeparator: '\n' })));
        if (!dirty.current) firstDirtyAt.current = Date.now();
        dirty.current = true;
        setState('dirty');
        schedule();
      },
      onFocus: ({ editor }) => {
        focused.current = true;
        window.clearTimeout(releaseTimer.current);
        onActive(editor, section.id);
        if (canWriteRef.current) void claim();
      },
      onBlur: () => {
        focused.current = false;
        void flush();
        // let go of the section shortly after leaving it, unless they come straight back
        releaseTimer.current = window.setTimeout(() => {
          if (!focused.current) void repo.unlock(deliverableId, section.id, me);
        }, 4000);
      },
    },
    [section.id],
  );

  const claim = async () => {
    const who = await repo.lock(deliverableId, section.id, me).catch(() => '');
    if (who) {
      setHeldBy(who);
      edRef.current?.setEditable(false);
      edRef.current?.commands.blur();
    }
  };

  const save = async (force = false) => {
    const editor = edRef.current;
    if (!editor || editor.isDestroyed || !dirty.current) return;
    const content = JSON.stringify(editor.getJSON());
    if (content.length > MAX_BYTES) {
      setState('error', 'This section is too big to save. Remove an image or move some text to another section.');
      return;
    }
    const words = countWords(editor.getText({ blockSeparator: '\n' }));
    dirty.current = false;
    setState('saving');
    try {
      const r = await repo.saveContent(deliverableId, section.id, content, words, baseRev.current, me, force);
      if (r.ok) {
        baseRev.current = r.rev;
        setConflict(null);
        setState(dirty.current ? 'dirty' : 'saved');
      } else {
        dirty.current = true;
        setConflict(r.theirs);
        setState('conflict');
      }
    } catch (e) {
      dirty.current = true;
      setState('error', navigator.onLine ? (e as Error).message || 'Could not save.' : 'You are offline. It will save when you are back online.');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 8000);
    }
  };

  const flush = async () => {
    window.clearTimeout(timer.current);
    if (saving.current) await saving.current;
    if (!dirty.current || stateRef.current === 'conflict') return;
    saving.current = save().finally(() => {
      saving.current = null;
    });
    await saving.current;
  };

  // save 2.5 s after typing stops, and at least every 15 s while typing
  const schedule = () => {
    window.clearTimeout(timer.current);
    const waited = Date.now() - firstDirtyAt.current;
    timer.current = window.setTimeout(() => void flush(), waited > 15_000 ? 0 : 2500);
  };

  // someone else's changes arrive while we are not editing
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (section.rev !== baseRev.current && !dirty.current && !focused.current) {
      editor.commands.setContent(parse(section.content), false);
      baseRev.current = section.rev;
      onWords(section.id, countWords(editor.getText({ blockSeparator: '\n' })));
    }
  }, [editor, section.rev, section.content, section.id, onWords]);

  // read-only while another person holds the section
  const other = lockedBy(section, me);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const can = canWrite && !other && !conflict;
    if (editor.isEditable !== can) editor.setEditable(can);
    if (!other) setHeldBy('');
  }, [editor, canWrite, other, conflict]);

  // keep our hold fresh while typing, and notice when someone else's hold expires
  useEffect(() => {
    const h = window.setInterval(() => {
      if (focused.current && canWrite && Date.now() - (section.lock?.at ?? 0) > 20_000) void repo.lock(deliverableId, section.id, me).catch(() => {});
      tick((n) => n + 1);
    }, 10_000);
    return () => window.clearInterval(h);
  }, [deliverableId, section.id, section.lock?.at, me, canWrite]);

  useEffect(() => {
    registerFlush(section.id, flush);
    return () => {
      registerFlush(section.id, null);
      window.clearTimeout(timer.current);
      window.clearTimeout(releaseTimer.current);
      void flush().then(() => repo.unlock(deliverableId, section.id, me));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id]);

  const holder = other || heldBy;
  return (
    <div className={`dsec-editor ${holder ? 'is-held' : ''}`}>
      {holder && (
        <p className="dsec-held" role="status">
          {nameOf(holder)} is writing this section. You can edit it when they stop.
        </p>
      )}
      {conflict && (
        <div className="dsec-conflict" role="alert">
          <span>{nameOf(conflict.updatedBy || '')} changed this section while you were editing. Pick which version to keep.</span>
          <span className="dsec-conflict-actions">
            <button
              className="btn btn-sm"
              onClick={() => {
                if (!editor) return;
                editor.commands.setContent(parse(conflict.content), false);
                baseRev.current = conflict.rev;
                dirty.current = false;
                setConflict(null);
                setState('saved');
              }}
            >
              Use theirs
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                setConflict(null);
                dirty.current = true;
                stateRef.current = 'dirty';
                void save(true);
              }}
            >
              Keep mine
            </button>
          </span>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

export const SectionEditor = memo(SectionEditorInner);
