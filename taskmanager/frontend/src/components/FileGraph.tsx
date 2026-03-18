import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { FileRoot, FileNode } from '../types';

const WORKSPACE_COLORS: Record<string, string> = {
  'workspace-sophon': '#f59e0b',
  'workspace-main': '#f59e0b',
  'workspace-dingyi': '#3b82f6',
  'workspace-luoji': '#8b5cf6',
  'workspace-dashi': '#ef4444',
  cron: '#10b981',
  agents: '#06b6d4',
  logs: '#6b7280',
  memory: '#ec4899',
  canvas: '#14b8a6',
};

const EXT_COLORS: Record<string, string> = {
  '.md': '#60a5fa',
  '.json': '#fbbf24',
  '.yml': '#a78bfa',
  '.yaml': '#a78bfa',
  '.ts': '#3b82f6',
  '.js': '#eab308',
  '.sh': '#22c55e',
  '.sql': '#f97316',
};

interface GraphNode {
  id: string;
  name: string;
  type: 'root' | 'directory' | 'file';
  fileCount: number;
  depth: number;
  color: string;
  rootName: string;
  filePath: string;
  val: number;
}

interface GraphLink {
  source: string;
  target: string;
}

function countFiles(node: FileNode): number {
  if (node.type === 'file') return 1;
  return (node.children || []).reduce((s, c) => s + countFiles(c), 0);
}

function getWorkspaceColor(path: string): string {
  for (const [key, color] of Object.entries(WORKSPACE_COLORS)) {
    if (path.startsWith(key)) return color;
  }
  return '#64748b';
}

function buildGraph(roots: FileRoot[], maxDepth: number) {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  function traverse(node: FileNode, parentId: string, rootName: string, depth: number) {
    const id = `${rootName}:${node.path}`;

    if (node.type === 'directory') {
      const fc = countFiles(node);
      nodes.push({
        id,
        name: node.name,
        type: 'directory',
        fileCount: fc,
        depth,
        color: getWorkspaceColor(node.path),
        rootName,
        filePath: node.path,
        val: Math.max(3, Math.min(20, Math.sqrt(fc) * 2)),
      });
      links.push({ source: parentId, target: id });

      if (depth < maxDepth && node.children) {
        for (const child of node.children) {
          traverse(child, id, rootName, depth + 1);
        }
      }
    } else if (depth <= maxDepth) {
      const ext = node.extension || '';
      nodes.push({
        id,
        name: node.name,
        type: 'file',
        fileCount: 0,
        depth,
        color: EXT_COLORS[ext] || '#94a3b8',
        rootName,
        filePath: node.path,
        val: 1.5,
      });
      links.push({ source: parentId, target: id });
    }
  }

  for (const root of roots) {
    const rootId = `root:${root.name}`;
    const totalFiles = root.children.reduce((s, c) => s + countFiles(c), 0);
    nodes.push({
      id: rootId,
      name: root.name,
      type: 'root',
      fileCount: totalFiles,
      depth: 0,
      color: root.name === 'OpenClaw' ? '#f59e0b' : '#3b82f6',
      rootName: root.name,
      filePath: '',
      val: 25,
    });

    for (const child of root.children) {
      traverse(child, rootId, root.name, 1);
    }
  }

  return { nodes, links };
}

interface FileGraphProps {
  roots: FileRoot[];
  onSelectFile: (rootName: string, filePath: string, fileName: string) => void;
}

export function FileGraph({ roots, onSelectFile }: FileGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [maxDepth, setMaxDepth] = useState(2);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge').strength(-80);
      fgRef.current.d3Force('link').distance((link: any) => {
        const src = link.source;
        const tgt = link.target;
        const srcDepth = typeof src === 'object' ? src.depth : 0;
        const tgtDepth = typeof tgt === 'object' ? tgt.depth : 0;
        return 30 + Math.max(srcDepth, tgtDepth) * 10;
      });
    }
  }, [maxDepth]);

  const graphData = useMemo(() => buildGraph(roots, maxDepth), [roots, maxDepth]);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n = node as GraphNode;
    const size = n.val;
    const x = node.x!;
    const y = node.y!;
    const isHovered = hoveredNode?.id === n.id;

    if (n.type === 'root') {
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (n.type === 'directory') {
      const s = size * 1.5;
      ctx.fillStyle = isHovered ? '#fff' : n.color;
      ctx.globalAlpha = isHovered ? 1 : 0.85;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.globalAlpha = 1;
      if (isHovered) {
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      }
    } else {
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fillStyle = isHovered ? '#fff' : n.color;
      ctx.globalAlpha = isHovered ? 1 : 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const fontSize = n.type === 'root' ? 14 / globalScale : n.type === 'directory' ? 10 / globalScale : 8 / globalScale;
    if (globalScale > (n.type === 'file' ? 2 : 0.8)) {
      ctx.font = `${n.type === 'root' ? 'bold ' : ''}${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isHovered ? '#fbbf24' : '#e2e8f0';
      const label = n.type === 'directory' && n.fileCount > 0
        ? `${n.name} (${n.fileCount})`
        : n.name;
      ctx.fillText(label, x, y + size + 2);
    }
  }, [hoveredNode]);

  const handleClick = useCallback((node: any) => {
    const n = node as GraphNode;
    if (n.type === 'file') {
      onSelectFile(n.rootName, n.filePath, n.name);
    }
  }, [onSelectFile]);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950">
      {/* Controls */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-3 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2">
        <span className="text-xs text-slate-400">Mélység:</span>
        {[1, 2, 3, 4].map((d) => (
          <button
            key={d}
            onClick={() => setMaxDepth(d)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              maxDepth === d
                ? 'bg-amber-600 text-white'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
          >
            {d}
          </button>
        ))}
        <span className="text-xs text-slate-600 ml-2">{graphData.nodes.length} elem</span>
      </div>

      {/* Legend */}
      <div className="absolute top-3 right-3 z-10 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-xs space-y-1">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Gyökér</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-slate-400 inline-block" /> Mappa</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> .md</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> .json</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> .sh</div>
      </div>

      {/* Hover info */}
      {hoveredNode && (
        <div className="absolute bottom-3 left-3 z-10 bg-slate-900/95 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 max-w-xs">
          <div className="font-medium text-slate-100">{hoveredNode.name}</div>
          <div className="text-slate-500">{hoveredNode.rootName}/{hoveredNode.filePath}</div>
          {hoveredNode.type === 'directory' && (
            <div className="text-slate-400 mt-0.5">{hoveredNode.fileCount} fájl</div>
          )}
          {hoveredNode.type === 'file' && (
            <div className="text-amber-400 mt-0.5">Kattints a megnyitáshoz</div>
          )}
        </div>
      )}

      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#020617"
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          const size = (node as GraphNode).val * 2;
          ctx.fillStyle = color;
          ctx.fillRect(node.x! - size / 2, node.y! - size / 2, size, size);
        }}
        onNodeHover={(node: any) => setHoveredNode(node as GraphNode | null)}
        onNodeClick={handleClick}
        linkColor={() => '#334155'}
        linkWidth={0.5}
        linkDirectionalParticles={0}
        cooldownTicks={100}
        warmupTicks={50}
      />
    </div>
  );
}
