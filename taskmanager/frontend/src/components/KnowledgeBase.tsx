import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { FileNode, FileRoot } from '../types';
import { FileGraph } from './FileGraph';
import { SmartViewer } from './SmartViewer';

const EXT_ICONS: Record<string, string> = {
  '.md': '📝', '.json': '{}', '.yml': '⚙️', '.yaml': '⚙️',
  '.ts': '🔷', '.tsx': '🔷', '.js': '🟡', '.jsx': '🟡',
  '.sh': '🐚', '.sql': '🗃️', '.prisma': '◆', '.env': '🔒',
  '.html': '🌐', '.css': '🎨', '.py': '🐍', '.txt': '📄',
};

function getIcon(node: FileNode): string {
  if (node.type === 'directory') return '📁';
  return EXT_ICONS[node.extension || ''] || '📄';
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── File Tree ───

function FileTreeNode({
  node,
  rootName,
  selectedPath,
  onSelect,
  depth,
}: {
  node: FileNode;
  rootName: string;
  selectedPath: string | null;
  onSelect: (rootName: string, path: string, name: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isSelected = selectedPath === `${rootName}:${node.path}`;

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-left text-sm hover:bg-slate-700/50 rounded transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span
            className="text-slate-500 text-xs w-4 text-center transition-transform"
            style={{ transform: expanded ? 'rotate(90deg)' : '' }}
          >
            ▶
          </span>
          <span className="text-xs">{getIcon(node)}</span>
          <span className="text-slate-300 truncate font-medium">{node.name}</span>
          {node.children && (
            <span className="text-slate-600 text-xs ml-auto">{node.children.length}</span>
          )}
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                rootName={rootName}
                selectedPath={selectedPath}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(rootName, node.path, node.name)}
      className={`w-full flex items-center gap-1.5 px-2 py-1 text-left text-sm rounded transition-colors ${
        isSelected
          ? 'bg-amber-600/20 text-amber-200 border-l-2 border-amber-500'
          : 'hover:bg-slate-700/50 text-slate-400'
      }`}
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
    >
      <span className="text-xs">{getIcon(node)}</span>
      <span className="truncate">{node.name}</span>
      <span className="text-slate-600 text-xs ml-auto flex-shrink-0">{formatSize(node.size)}</span>
    </button>
  );
}

function SearchableTree({
  roots,
  selectedPath,
  onSelect,
}: {
  roots: FileRoot[];
  selectedPath: string | null;
  onSelect: (rootName: string, path: string, name: string) => void;
}) {
  const [filter, setFilter] = useState('');

  function filterTree(nodes: FileNode[], query: string): FileNode[] {
    if (!query) return nodes;
    const lower = query.toLowerCase();
    return nodes
      .map((node) => {
        if (node.type === 'directory') {
          const filtered = filterTree(node.children || [], query);
          if (filtered.length > 0) return { ...node, children: filtered };
          if (node.name.toLowerCase().includes(lower)) return node;
          return null;
        }
        return node.name.toLowerCase().includes(lower) ? node : null;
      })
      .filter(Boolean) as FileNode[];
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-slate-700">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Keresés..."
          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {roots.map((root) => {
          const filtered = filterTree(root.children, filter);
          if (filter && filtered.length === 0) return null;
          return (
            <div key={root.name} className="mb-2">
              <div className="px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {root.name}
              </div>
              {filtered.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  rootName={root.name}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                  depth={0}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Knowledge Base ───

type ViewTab = 'tree' | 'graph';

export function KnowledgeBase() {
  const [roots, setRoots] = useState<FileRoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<ViewTab>('tree');

  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileEditable, setFileEditable] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(320);
  const resizing = useRef(false);

  useEffect(() => {
    api.files
      .tree()
      .then(setRoots)
      .catch((err) => setError(err.message || 'Hiba a fájlfa betöltésekor'))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = useCallback(async (rootName: string, filePath: string, name: string) => {
    if (activeTab === 'graph') setActiveTab('tree');
    setSelectedRoot(rootName);
    setSelectedFilePath(filePath);
    setSelectedFileName(name);
    setFileLoading(true);

    try {
      const res = await api.files.content(rootName, filePath);
      setFileContent(res.content);
      setFileEditable(res.editable);
    } catch (err) {
      setFileContent('');
      setError(err instanceof Error ? err.message : 'Hiba');
    } finally {
      setFileLoading(false);
    }
  }, [activeTab]);

  const handleSave = useCallback(
    async (newContent: string) => {
      if (!selectedRoot || !selectedFilePath) return;
      await api.files.save(selectedRoot, selectedFilePath, newContent);
      setFileContent(newContent);
    },
    [selectedRoot, selectedFilePath],
  );

  const handleMouseDown = () => {
    resizing.current = true;
    const move = (e: MouseEvent) => {
      if (!resizing.current) return;
      setSidebarWidth(Math.max(200, Math.min(600, e.clientX)));
    };
    const up = () => {
      resizing.current = false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const selectedKey = selectedRoot && selectedFilePath ? `${selectedRoot}:${selectedFilePath}` : null;

  const breadcrumbs = selectedFilePath
    ? [selectedRoot, ...selectedFilePath.split('/')].filter(Boolean)
    : [];

  const totalFiles = roots.reduce((sum, r) => {
    const count = (nodes: FileRoot['children']): number =>
      nodes.reduce((s, n) => s + (n.type === 'file' ? 1 : count(n.children || [])), 0);
    return sum + count(r.children);
  }, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Tudásbázis betöltése...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-slate-400 hover:text-slate-200 transition-colors">
              ← Projektlista
            </Link>
            <h1 className="text-lg font-semibold text-slate-100">Tudásbázis</h1>

            {/* Tabs */}
            <div className="flex bg-slate-800 rounded-lg overflow-hidden border border-slate-700 ml-4">
              <button
                onClick={() => setActiveTab('tree')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'tree' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🗂️</span> Fájlfa
              </button>
              <button
                onClick={() => setActiveTab('graph')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'graph' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🕸️</span> Gráf
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-500">{totalFiles} fájl</div>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Graph View */}
      {activeTab === 'graph' && (
        <div className="flex-1" style={{ height: 'calc(100vh - 60px)' }}>
          <FileGraph roots={roots} onSelectFile={handleSelect} />
        </div>
      )}

      {/* Tree View */}
      {activeTab === 'tree' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <aside
            className="bg-slate-900/70 border-r border-slate-700 flex-shrink-0 flex flex-col overflow-hidden"
            style={{ width: sidebarWidth }}
          >
            <SearchableTree roots={roots} selectedPath={selectedKey} onSelect={handleSelect} />
          </aside>

          {/* Resize handle */}
          <div
            className="w-1 bg-slate-700 hover:bg-amber-600/50 cursor-col-resize flex-shrink-0 transition-colors"
            onMouseDown={handleMouseDown}
          />

          {/* Content panel */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {selectedFilePath ? (
              <>
                {/* Breadcrumbs */}
                <div className="flex items-center px-4 py-2 border-b border-slate-700 bg-slate-900/40 text-sm text-slate-500 overflow-x-auto flex-shrink-0">
                  {breadcrumbs.map((part, i) => (
                    <span key={i} className="flex items-center gap-1 flex-shrink-0">
                      {i > 0 && <span className="text-slate-600 mx-1">/</span>}
                      <span className={i === breadcrumbs.length - 1 ? 'text-slate-200 font-medium' : ''}>
                        {part}
                      </span>
                    </span>
                  ))}
                </div>

                {fileLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="animate-pulse text-slate-500">Betöltés...</div>
                  </div>
                ) : (
                  <SmartViewer
                    content={fileContent}
                    fileName={selectedFileName}
                    editable={fileEditable}
                    onSave={handleSave}
                  />
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-3 opacity-30">📚</div>
                  <p className="text-slate-500 text-sm">Válassz egy fájlt a bal oldali fából</p>
                  <p className="text-slate-600 text-xs mt-1">
                    vagy váltsd a Gráf nézetre a topológia áttekintéséhez
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
