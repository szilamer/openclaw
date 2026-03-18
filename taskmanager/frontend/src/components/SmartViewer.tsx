import { useState, useCallback, useMemo } from 'react';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

// ─── Value Formatters ───

function isIsoDate(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (isIsoDate(v)) return new Date(v as string).toLocaleString('hu-HU');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ─── JSON Table (array of objects) ───

function JsonTable({
  data,
  editing,
  onDataChange,
}: {
  data: Record<string, unknown>[];
  editing: boolean;
  onDataChange: (newData: Record<string, unknown>[]) => void;
}) {
  const headers = useMemo(() => {
    const keys = new Set<string>();
    for (const row of data) Object.keys(row).forEach((k) => keys.add(k));
    return Array.from(keys);
  }, [data]);

  const updateCell = (rowIdx: number, key: string, value: string) => {
    const newData = data.map((row, i) => {
      if (i !== rowIdx) return row;
      const orig = row[key];
      let parsed: unknown = value;
      if (typeof orig === 'number') parsed = Number(value) || 0;
      else if (typeof orig === 'boolean') parsed = value === 'true' || value === '✓';
      else if (orig === null && value === '—') parsed = null;
      return { ...row, [key]: parsed };
    });
    onDataChange(newData);
  };

  const deleteRow = (idx: number) => {
    onDataChange(data.filter((_, i) => i !== idx));
  };

  const addRow = () => {
    const empty: Record<string, unknown> = {};
    headers.forEach((h) => (empty[h] = ''));
    onDataChange([...data, empty]);
  };

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {editing && <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-500 bg-slate-800/50 border-b border-slate-700 w-8" />}
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-1.5 text-left text-xs font-medium text-slate-400 bg-slate-800/50 border-b border-slate-700 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={ri} className="border-b border-slate-800 hover:bg-slate-800/30">
              {editing && (
                <td className="px-1 py-1">
                  <button
                    onClick={() => deleteRow(ri)}
                    className="text-red-500/50 hover:text-red-400 text-xs"
                    title="Sor törlése"
                  >
                    ✕
                  </button>
                </td>
              )}
              {headers.map((h) => (
                <td key={h} className="px-3 py-1.5 border-b border-slate-800">
                  {editing ? (
                    <input
                      value={formatCell(row[h])}
                      onChange={(e) => updateCell(ri, h, e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                    />
                  ) : (
                    <CellValue value={row[h]} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <button
          onClick={addRow}
          className="mt-2 px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
        >
          + Új sor
        </button>
      )}
    </div>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-slate-600 italic">null</span>;
  if (typeof value === 'boolean')
    return <span className={value ? 'text-emerald-400' : 'text-red-400'}>{value ? '✓ true' : '✗ false'}</span>;
  if (typeof value === 'number')
    return <span className="text-amber-300 font-mono">{value}</span>;
  if (isIsoDate(value))
    return <span className="text-sky-300">{new Date(value as string).toLocaleString('hu-HU')}</span>;
  if (typeof value === 'object')
    return <code className="text-xs text-slate-400 bg-slate-800 px-1 rounded">{JSON.stringify(value)}</code>;
  const s = String(value);
  if (s.length > 120) return <span className="text-slate-300" title={s}>{s.slice(0, 120)}…</span>;
  return <span className="text-slate-300">{s}</span>;
}

// ─── JSON Object (key-value tree) ───

function JsonObject({
  data,
  editing,
  onDataChange,
  depth = 0,
}: {
  data: Record<string, unknown>;
  editing: boolean;
  onDataChange: (newData: Record<string, unknown>) => void;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => setCollapsed((p) => ({ ...p, [key]: !p[key] }));

  const updateValue = (key: string, value: string) => {
    const orig = data[key];
    let parsed: unknown = value;
    if (typeof orig === 'number') parsed = Number(value) || 0;
    else if (typeof orig === 'boolean') parsed = value === 'true';
    else if (orig === null && value === '') parsed = null;
    onDataChange({ ...data, [key]: parsed });
  };

  const updateNestedObject = (key: string, newChild: Record<string, unknown>) => {
    onDataChange({ ...data, [key]: newChild });
  };

  const updateNestedArray = (key: string, newArr: unknown[]) => {
    onDataChange({ ...data, [key]: newArr });
  };

  return (
    <div className={depth > 0 ? 'ml-4 border-l border-slate-700/50 pl-3' : ''}>
      {Object.entries(data).map(([key, value]) => {
        const isObj = value !== null && typeof value === 'object' && !Array.isArray(value);
        const isArr = Array.isArray(value);
        const isArrOfObjects = isArr && value.length > 0 && typeof value[0] === 'object' && value[0] !== null;
        const isCollapsed = collapsed[key];

        return (
          <div key={key} className="py-1">
            <div className="flex items-start gap-2">
              {(isObj || isArr) ? (
                <button
                  onClick={() => toggle(key)}
                  className="text-slate-500 hover:text-slate-300 text-xs mt-0.5 w-4 flex-shrink-0"
                >
                  {isCollapsed ? '▶' : '▼'}
                </button>
              ) : (
                <span className="w-4 flex-shrink-0" />
              )}
              <span className="text-amber-400/80 text-sm font-mono flex-shrink-0">{key}</span>
              <span className="text-slate-600 text-sm flex-shrink-0">:</span>

              {isObj || isArr ? (
                <span className="text-slate-500 text-xs">
                  {isObj
                    ? `{${Object.keys(value as object).length}}`
                    : `[${(value as unknown[]).length}]`}
                </span>
              ) : editing ? (
                <input
                  value={value === null ? '' : String(value)}
                  onChange={(e) => updateValue(key, e.target.value)}
                  placeholder={value === null ? 'null' : ''}
                  className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                />
              ) : (
                <CellValue value={value} />
              )}
            </div>

            {!isCollapsed && isArrOfObjects && (
              <div className="mt-1 ml-6">
                <JsonTable
                  data={value as Record<string, unknown>[]}
                  editing={editing}
                  onDataChange={(newArr) => updateNestedArray(key, newArr)}
                />
              </div>
            )}

            {!isCollapsed && isArr && !isArrOfObjects && (
              <div className="ml-6 mt-1 space-y-0.5">
                {(value as unknown[]).map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-slate-600 font-mono text-xs w-6 text-right">{i}</span>
                    {editing ? (
                      <input
                        value={item === null ? '' : String(item)}
                        onChange={(e) => {
                          const newArr = [...(value as unknown[])];
                          newArr[i] = e.target.value;
                          updateNestedArray(key, newArr);
                        }}
                        className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                      />
                    ) : (
                      <CellValue value={item} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {!isCollapsed && isObj && (
              <JsonObject
                data={value as Record<string, unknown>}
                editing={editing}
                onDataChange={(newChild) => updateNestedObject(key, newChild)}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Markdown Viewer ───

function MarkdownViewer({ content }: { content: string }) {
  const html = marked.parse(content) as string;
  return (
    <div
      className="prose prose-invert prose-sm max-w-none
        prose-headings:text-slate-100 prose-headings:border-b prose-headings:border-slate-700 prose-headings:pb-2
        prose-p:text-slate-300 prose-a:text-amber-400 prose-strong:text-slate-200
        prose-code:text-amber-300 prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
        prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700
        prose-li:text-slate-300 prose-blockquote:border-amber-500/50 prose-blockquote:text-slate-400
        prose-hr:border-slate-700"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── Main SmartViewer ───

interface SmartViewerProps {
  content: string;
  fileName: string;
  editable: boolean;
  onSave: (newContent: string) => Promise<void>;
}

export function SmartViewer({ content, fileName, editable, onSave }: SmartViewerProps) {
  const isMarkdown = fileName.endsWith('.md');
  const isJson = fileName.endsWith('.json');

  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
  const [editing, setEditing] = useState(false);
  const [rawContent, setRawContent] = useState(content);
  const [visualData, setVisualData] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const parsedJson = useMemo(() => {
    if (!isJson) return null;
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }, [content, isJson]);

  const isArrayOfObjects =
    Array.isArray(parsedJson) &&
    parsedJson.length > 0 &&
    typeof parsedJson[0] === 'object' &&
    parsedJson[0] !== null;

  const isObject =
    parsedJson !== null && typeof parsedJson === 'object' && !Array.isArray(parsedJson);

  const canShowVisual = isMarkdown || (isJson && (isArrayOfObjects || isObject));

  const startEdit = () => {
    setEditing(true);
    setRawContent(content);
    if (parsedJson !== null) {
      setVisualData(structuredClone(parsedJson));
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setSaveMsg('');
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      let toSave: string;
      if (viewMode === 'raw' || !isJson) {
        toSave = rawContent;
      } else {
        toSave = JSON.stringify(visualData, null, 2);
      }
      await onSave(toSave);
      setEditing(false);
      setSaveMsg('Mentve!');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Mentési hiba');
    } finally {
      setSaving(false);
    }
  }, [viewMode, rawContent, visualData, isJson, onSave]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700 bg-slate-900/40 flex-shrink-0">
        <div className="flex items-center gap-2">
          {canShowVisual && (
            <div className="flex bg-slate-800 rounded overflow-hidden border border-slate-700">
              <button
                onClick={() => setViewMode('visual')}
                className={`px-2.5 py-1 text-xs transition-colors ${
                  viewMode === 'visual' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Vizuális
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`px-2.5 py-1 text-xs transition-colors ${
                  viewMode === 'raw' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Nyers
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && (
            <span className={`text-xs ${saveMsg === 'Mentve!' ? 'text-emerald-400' : 'text-red-400'}`}>
              {saveMsg}
            </span>
          )}
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors"
              >
                {saving ? 'Mentés...' : 'Mentés'}
              </button>
              <button onClick={cancelEdit} className="px-3 py-1 text-slate-400 hover:text-slate-200 text-xs">
                Mégse
              </button>
            </>
          ) : (
            editable && (
              <button
                onClick={startEdit}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium rounded transition-colors"
              >
                Szerkesztés
              </button>
            )
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {viewMode === 'raw' || !canShowVisual ? (
          editing ? (
            <textarea
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              className="w-full h-full min-h-[500px] bg-slate-900 border border-slate-700 rounded-lg p-4 text-sm font-mono text-slate-200 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              spellCheck={false}
            />
          ) : (
            <pre className="text-sm font-mono text-slate-300 bg-slate-900 border border-slate-700 rounded-lg p-4 overflow-auto whitespace-pre-wrap">
              {content}
            </pre>
          )
        ) : isMarkdown ? (
          editing ? (
            <textarea
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              className="w-full h-full min-h-[500px] bg-slate-900 border border-slate-700 rounded-lg p-4 text-sm font-mono text-slate-200 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              spellCheck={false}
            />
          ) : (
            <MarkdownViewer content={content} />
          )
        ) : isJson && isArrayOfObjects ? (
          <JsonTable
            data={(editing ? visualData : parsedJson) as Record<string, unknown>[]}
            editing={editing}
            onDataChange={(newData) => setVisualData(newData)}
          />
        ) : isJson && isObject ? (
          <JsonObject
            data={(editing ? visualData : parsedJson) as Record<string, unknown>}
            editing={editing}
            onDataChange={(newData) => setVisualData(newData)}
          />
        ) : (
          <pre className="text-sm font-mono text-slate-300 bg-slate-900 border border-slate-700 rounded-lg p-4 overflow-auto whitespace-pre-wrap">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
