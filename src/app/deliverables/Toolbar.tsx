import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquarePlus,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
} from 'lucide-react';
import { imageToDataURL } from '../../lib/deliverables';
import type { DocRules } from '../../lib/types';
import { useMenu, useToast } from '../../components/ui';

/* Formatting for whichever section is being edited. Buttons keep the focus
   in the editor (mousedown is cancelled) so the selection is not lost. */

function Btn({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void; children: ReactNode }) {
  return (
    <button type="button" className={`tb-btn ${active ? 'is-on' : ''}`} aria-label={label} title={label} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}

const Sep = () => <span className="tb-sep" aria-hidden="true" />;

export function Toolbar({ editor, rules, onComment, canWrite }: { editor: Editor | null; rules?: DocRules; onComment: () => void; canWrite: boolean }) {
  const [, setTick] = useState(0);
  const [linking, setLinking] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menu = useMenu();
  const toast = useToast();

  useEffect(() => {
    if (!editor) return;
    const f = () => setTick((n) => n + 1);
    editor.on('transaction', f);
    editor.on('focus', f);
    editor.on('blur', f);
    return () => {
      editor.off('transaction', f);
      editor.off('focus', f);
      editor.off('blur', f);
    };
  }, [editor]);

  const live = !!editor && !editor.isDestroyed && editor.isEditable && canWrite;
  const c = () => editor!.chain().focus();
  const is = (name: string, attrs?: Record<string, unknown>) => !!editor && !editor.isDestroyed && editor.isActive(name, attrs);
  const style = is('heading', { level: 1 }) ? 'h1' : is('heading', { level: 2 }) ? 'h2' : is('heading', { level: 3 }) ? 'h3' : 'p';
  const inTable = is('table');
  const inList = is('bulletList') || is('orderedList');
  const align = live ? (['center', 'right', 'justify'].find((a) => editor!.isActive({ textAlign: a })) ?? 'left') : '';

  const applyLink = (raw: string) => {
    const v = raw.trim();
    if (!v) c().extendMarkRange('link').unsetLink().run();
    else c().extendMarkRange('link').setLink({ href: /^(https?:|mailto:)/i.test(v) ? v : `https://${v}` }).run();
    setLinking(null);
  };

  return (
    <div className="doc-toolbar" role="toolbar" aria-label="Formatting">
      <div className="tb-row">
        <Btn label="Undo" disabled={!live || !editor!.can().undo()} onClick={() => c().undo().run()}>
          <Undo2 />
        </Btn>
        <Btn label="Redo" disabled={!live || !editor!.can().redo()} onClick={() => c().redo().run()}>
          <Redo2 />
        </Btn>
        <Sep />
        <select
          className="tb-select"
          aria-label="Text style"
          disabled={!live}
          value={style}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'p') c().setParagraph().run();
            else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
          }}
        >
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <Sep />
        <Btn label="Bold (Ctrl+B)" active={is('bold')} disabled={!live} onClick={() => c().toggleBold().run()}>
          <Bold />
        </Btn>
        <Btn label="Italic (Ctrl+I)" active={is('italic')} disabled={!live} onClick={() => c().toggleItalic().run()}>
          <Italic />
        </Btn>
        <Btn label="Underline (Ctrl+U)" active={is('underline')} disabled={!live} onClick={() => c().toggleUnderline().run()}>
          <Underline />
        </Btn>
        <Btn label="Strikethrough" active={is('strike')} disabled={!live} onClick={() => c().toggleStrike().run()}>
          <Strikethrough />
        </Btn>
        <Btn label="Highlight" active={is('highlight')} disabled={!live} onClick={() => c().toggleHighlight().run()}>
          <Highlighter />
        </Btn>
        <Sep />
        <Btn label="Align left" active={align === 'left'} disabled={!live} onClick={() => c().setTextAlign('left').run()}>
          <AlignLeft />
        </Btn>
        <Btn label="Center" active={align === 'center'} disabled={!live} onClick={() => c().setTextAlign('center').run()}>
          <AlignCenter />
        </Btn>
        <Btn label="Align right" active={align === 'right'} disabled={!live} onClick={() => c().setTextAlign('right').run()}>
          <AlignRight />
        </Btn>
        <Btn label="Justify" active={align === 'justify'} disabled={!live} onClick={() => c().setTextAlign('justify').run()}>
          <AlignJustify />
        </Btn>
        <Sep />
        <Btn label="Bulleted list" active={is('bulletList')} disabled={!live} onClick={() => c().toggleBulletList().run()}>
          <List />
        </Btn>
        <Btn label="Numbered list" active={is('orderedList')} disabled={!live} onClick={() => c().toggleOrderedList().run()}>
          <ListOrdered />
        </Btn>
        <Btn label="Indent list item" disabled={!live || !inList || !editor!.can().sinkListItem('listItem')} onClick={() => c().sinkListItem('listItem').run()}>
          <IndentIncrease />
        </Btn>
        <Btn label="Outdent list item" disabled={!live || !inList || !editor!.can().liftListItem('listItem')} onClick={() => c().liftListItem('listItem').run()}>
          <IndentDecrease />
        </Btn>
        <Btn label="Quote" active={is('blockquote')} disabled={!live} onClick={() => c().toggleBlockquote().run()}>
          <Quote />
        </Btn>
        <Sep />
        {!rules?.noLinks && (
          <Btn label="Link" active={is('link')} disabled={!live} onClick={() => setLinking(linking === null ? String(editor!.getAttributes('link').href ?? '') : null)}>
            <Link2 />
          </Btn>
        )}
        {!rules?.noImages && (
          <Btn label="Image or chart" disabled={!live} onClick={() => fileRef.current?.click()}>
            <ImagePlus />
          </Btn>
        )}
        {(!rules?.noTables || inTable) && (
          <Btn
            label={inTable ? 'Table options' : 'Insert table'}
            active={inTable}
            disabled={!live}
            onClick={(e) => {
              if (!inTable) {
                c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                return;
              }
              menu.open(e.currentTarget, [
                { label: 'Add row below', onSelect: () => c().addRowAfter().run() },
                { label: 'Add row above', onSelect: () => c().addRowBefore().run() },
                { label: 'Add column right', onSelect: () => c().addColumnAfter().run() },
                { label: 'Add column left', onSelect: () => c().addColumnBefore().run() },
                { label: 'Header row on or off', onSelect: () => c().toggleHeaderRow().run() },
                { label: 'Merge or split cells', onSelect: () => c().mergeOrSplit().run() },
                { label: 'Delete row', divider: true, danger: true, onSelect: () => c().deleteRow().run() },
                { label: 'Delete column', danger: true, onSelect: () => c().deleteColumn().run() },
                { label: 'Delete table', danger: true, onSelect: () => c().deleteTable().run() },
              ]);
            }}
          >
            <Table2 />
          </Btn>
        )}
        <Btn label="Horizontal line" disabled={!live} onClick={() => c().setHorizontalRule().run()}>
          <Minus />
        </Btn>
        <Btn label="Clear formatting" disabled={!live} onClick={() => c().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting />
        </Btn>
        <Sep />
        <button type="button" className="tb-btn tb-text" disabled={!editor} onMouseDown={(e) => e.preventDefault()} onClick={onComment} title="Comment on the selected text">
          <MessageSquarePlus /> <span>Comment</span>
        </button>
      </div>
      {linking !== null && (
        <form
          className="tb-link"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink(linking);
          }}
        >
          <input className="input" autoFocus value={linking} onChange={(e) => setLinking(e.target.value)} placeholder="Paste a link, or leave empty to remove it" aria-label="Link address" />
          <button className="btn btn-sm btn-primary" type="submit">
            Apply
          </button>
          <button className="btn btn-sm" type="button" onClick={() => setLinking(null)}>
            Cancel
          </button>
        </form>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file || !editor) return;
          try {
            const src = await imageToDataURL(file);
            editor.chain().focus().setImage({ src, alt: file.name.replace(/\.[^.]+$/, '') }).run();
          } catch (err) {
            toast((err as Error).message, { kind: 'error' });
          }
        }}
      />
      {menu.node}
    </div>
  );
}
