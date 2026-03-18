import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, type User } from '../api';
import type { Project, ProjectContact, ProjectMember } from '../types';

type Tab = 'general' | 'access' | 'contacts' | 'knowledge';

const PRESET_COLORS = [
  '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1',
  '#14b8a6', '#e11d48', '#a855f7', '#0ea5e9', '#d946ef',
];

const CONTACT_ROLES = [
  'Ügyfél', 'Partner', 'Fejlesztő', 'Tanácsadó', 'Menedzser',
  'Tervező', 'Beszállító', 'Kapcsolattartó', 'Egyéb',
];

function TabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
        active
          ? 'bg-amber-600/20 text-amber-400 border border-amber-600/40'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
      }`}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="px-1.5 py-0.5 text-xs rounded-full bg-slate-700 text-slate-300">
          {count}
        </span>
      )}
    </button>
  );
}

function GeneralTab({
  project,
  onSave,
  saving,
}: {
  project: Project;
  onSave: (data: Partial<Project>) => Promise<void>;
  saving: boolean;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [color, setColor] = useState(project.color || '#f59e0b');
  const [priority, setPriority] = useState(project.priority ?? 5);
  const [image, setImage] = useState(project.image || '');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      alert('A kép mérete max 512KB lehet.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSave({ name, description: description || null, color, priority, image: image || null } as Partial<Project>);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Projekt profilkép
        </label>
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-xl border-2 border-slate-600 flex items-center justify-center overflow-hidden cursor-pointer hover:border-amber-500/50 transition-colors"
            style={{ backgroundColor: color + '20' }}
            onClick={() => fileRef.current?.click()}
          >
            {image ? (
              <img
                src={image}
                alt={name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-3xl font-bold" style={{ color }}>
                {name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
            >
              Kép feltöltése
            </button>
            {image && (
              <button
                onClick={() => setImage('')}
                className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Kép eltávolítása
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Projekt neve
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Rövid leírás
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
          placeholder="Rövid projekt leírás..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Szín
        </label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-lg transition-all ${
                color === c
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110'
                  : 'hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded-lg cursor-pointer border border-slate-600"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Prioritás{' '}
          <span
            className={`ml-1 font-bold ${
              priority >= 8
                ? 'text-red-400'
                : priority >= 5
                  ? 'text-amber-400'
                  : 'text-slate-400'
            }`}
          >
            {priority}/10
          </span>
        </label>
        <p className="text-xs text-slate-500 mb-3">
          Magasabb érték = fontosabb projekt. A kártyák és a feladatok
          priorizálása ezen alapul.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-4">1</span>
          <input
            type="range"
            min={1}
            max={10}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-amber-500 bg-slate-700"
          />
          <span className="text-xs text-slate-500 w-6">10</span>
        </div>
        <div className="flex justify-between mt-1.5 px-4">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              onClick={() => setPriority(v)}
              className={`w-6 h-6 text-xs rounded transition-all ${
                v === priority
                  ? v >= 8
                    ? 'bg-red-600 text-white font-bold scale-110'
                    : v >= 5
                      ? 'bg-amber-600 text-white font-bold scale-110'
                      : 'bg-slate-600 text-white font-bold scale-110'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
      >
        {saving ? 'Mentés...' : 'Mentés'}
      </button>
    </div>
  );
}

function AccessTab({
  users,
  members,
  onSetMembers,
}: {
  users: User[];
  members: ProjectMember[];
  onSetMembers: (userIds: string[]) => Promise<void>;
}) {
  const memberIds = new Set(members.map((m) => m.userId));
  const agents = users.filter((u) => u.role === 'agent');
  const humans = users.filter((u) => u.role !== 'agent');

  const toggle = (userId: string) => {
    const next = new Set(memberIds);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    onSetMembers(Array.from(next));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-3">
          Felhasználók
        </h3>
        <div className="space-y-2">
          {humans.map((u) => (
            <label
              key={u.id}
              className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors"
            >
              <input
                type="checkbox"
                checked={memberIds.has(u.id)}
                onChange={() => toggle(u.id)}
                className="w-4 h-4 rounded border-slate-500 text-amber-500 focus:ring-amber-500/50 bg-slate-700"
              />
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-orange-900/40 border border-orange-600/40 flex items-center justify-center">
                  <span className="text-xs font-bold text-orange-300">
                    {(u.name || u.email).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="text-sm text-slate-200">
                    {u.name || u.email}
                  </div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {agents.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-300 mb-3">
            Ügynökök (agentek)
          </h3>
          <div className="space-y-2">
            {agents.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={memberIds.has(u.id)}
                  onChange={() => toggle(u.id)}
                  className="w-4 h-4 rounded border-slate-500 text-amber-500 focus:ring-amber-500/50 bg-slate-700"
                />
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-900/40 border border-emerald-600/40 flex items-center justify-center">
                    <span className="text-xs font-bold text-emerald-300">
                      {(u.name || u.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm text-slate-200">
                      {u.name || u.email}
                    </div>
                    <div className="text-xs text-slate-500">{u.role}</div>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {users.length === 0 && (
        <p className="text-slate-500 text-sm">Nincsenek elérhető felhasználók.</p>
      )}
    </div>
  );
}

function ContactsTab({
  contacts,
  onAdd,
  onUpdate,
  onRemove,
}: {
  contacts: ProjectContact[];
  onAdd: (data: Partial<ProjectContact>) => Promise<void>;
  onUpdate: (id: string, data: Partial<ProjectContact>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    role: '',
    email: '',
    phone: '',
    company: '',
    notes: '',
    isExternal: true,
  });

  const resetForm = () => {
    setForm({ name: '', role: '', email: '', phone: '', company: '', notes: '', isExternal: true });
    setEditId(null);
    setShowForm(false);
  };

  const startEdit = (c: ProjectContact) => {
    setForm({
      name: c.name,
      role: c.role || '',
      email: c.email || '',
      phone: c.phone || '',
      company: c.company || '',
      notes: c.notes || '',
      isExternal: c.isExternal,
    });
    setEditId(c.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const data = {
      name: form.name.trim(),
      role: form.role || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      company: form.company || undefined,
      notes: form.notes || undefined,
      isExternal: form.isExternal,
    };
    if (editId) {
      await onUpdate(editId, data);
    } else {
      await onAdd(data);
    }
    resetForm();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">
          Kapcsolattartók ({contacts.length})
        </h3>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
        >
          + Új kapcsolat
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-4 bg-slate-800/60 border border-slate-600 rounded-xl space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Név *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Szerep</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <option value="">— Válassz —</option>
                {CONTACT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Telefon</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Cég</label>
              <input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isExternal}
                  onChange={(e) =>
                    setForm({ ...form, isExternal: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-500 text-amber-500 focus:ring-amber-500/50 bg-slate-700"
                />
                <span className="text-sm text-slate-300">Külső kapcsolat</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Megjegyzés
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!form.name.trim()}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
            >
              {editId ? 'Mentés' : 'Hozzáadás'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm"
            >
              Mégse
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {contacts.map((c) => (
          <div
            key={c.id}
            className="p-4 bg-slate-800/40 border border-slate-700 rounded-xl flex items-start justify-between group"
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  c.isExternal
                    ? 'bg-blue-900/40 border border-blue-600/40'
                    : 'bg-emerald-900/40 border border-emerald-600/40'
                }`}
              >
                <span
                  className={`text-sm font-bold ${
                    c.isExternal ? 'text-blue-300' : 'text-emerald-300'
                  }`}
                >
                  {c.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">
                    {c.name}
                  </span>
                  {c.role && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-400">
                      {c.role}
                    </span>
                  )}
                  {c.isExternal && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-900/40 text-blue-400 border border-blue-700/30">
                      Külső
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                  {c.company && <span>{c.company}</span>}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="text-amber-500/70 hover:text-amber-400"
                    >
                      {c.email}
                    </a>
                  )}
                  {c.phone && <span>{c.phone}</span>}
                </div>
                {c.notes && (
                  <p className="mt-1 text-xs text-slate-500 italic">
                    {c.notes}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => startEdit(c)}
                className="p-1.5 text-slate-500 hover:text-amber-400 rounded transition-colors"
                title="Szerkesztés"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={() => {
                  if (confirm(`Biztosan törlöd: ${c.name}?`)) onRemove(c.id);
                }}
                className="p-1.5 text-slate-500 hover:text-red-400 rounded transition-colors"
                title="Törlés"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
        {contacts.length === 0 && !showForm && (
          <p className="text-sm text-slate-500 py-4 text-center">
            Még nincsenek kapcsolattartók.
          </p>
        )}
      </div>
    </div>
  );
}

function KnowledgeTab({
  project,
  onSave,
  saving,
  onReload,
}: {
  project: Project;
  onSave: (kb: string) => Promise<void>;
  saving: boolean;
  onReload: () => void;
}) {
  const [content, setContent] = useState(project.knowledgeBase || '');
  const [dirty, setDirty] = useState(false);
  const [syncStatus, setSyncStatus] = useState<import('../types').KbSyncStatus | null>(null);
  const [kbFiles, setKbFiles] = useState<string[]>([]);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setContent(project.knowledgeBase || '');
    setDirty(false);
  }, [project.knowledgeBase]);

  const loadSyncStatus = useCallback(async () => {
    if (!project.id) return;
    try {
      const status = await api.projects.kbStatus(project.id);
      setSyncStatus(status);
    } catch { /* ignore */ }
  }, [project.id]);

  useEffect(() => {
    loadSyncStatus();
    const iv = setInterval(loadSyncStatus, 30000);
    return () => clearInterval(iv);
  }, [loadSyncStatus]);

  const handleLink = async (fileName: string) => {
    try {
      await api.projects.linkKb(project.id, fileName);
      setShowLinkPicker(false);
      await loadSyncStatus();
      onReload();
    } catch { /* ignore */ }
  };

  const handleForceSync = async () => {
    setSyncing(true);
    try {
      await api.projects.syncKb();
      await loadSyncStatus();
      onReload();
    } catch { /* ignore */ }
    setSyncing(false);
  };

  const loadKbFiles = async () => {
    try {
      const files = await api.projects.kbFiles();
      setKbFiles(files);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Sync status bar */}
      <div className="flex items-center justify-between p-3 bg-slate-800/60 border border-slate-700 rounded-xl">
        <div className="flex items-center gap-3">
          {syncStatus?.linked ? (
            <>
              <div className={`w-2.5 h-2.5 rounded-full ${syncStatus.inSync ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-300">
                    Szinkronizálva:
                  </span>
                  <code className="text-xs px-1.5 py-0.5 bg-slate-700 rounded text-amber-300">
                    {syncStatus.kbFileName}
                  </code>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {syncStatus.inSync ? 'Fájl és DB szinkronban' : 'Eltérés — szinkronizálás szükséges'}
                  {syncStatus.kbSyncedAt && (
                    <> · Utolsó: {new Date(syncStatus.kbSyncedAt).toLocaleString('hu-HU')}</>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
              <span className="text-xs text-slate-500">
                Nincs fájlhoz kapcsolva — az agentek nem fogják látni a módosításokat
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {syncStatus?.linked && (
            <button
              onClick={handleForceSync}
              disabled={syncing}
              className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
              title="Szinkronizálás most"
            >
              {syncing ? '⟳ ...' : '⟳ Szinkron'}
            </button>
          )}
          <button
            onClick={() => {
              loadKbFiles();
              setShowLinkPicker(!showLinkPicker);
            }}
            className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
          >
            {syncStatus?.linked ? 'Fájl módosítás' : '+ Fájl kapcsolás'}
          </button>
        </div>
      </div>

      {showLinkPicker && (
        <div className="p-3 bg-slate-800 border border-slate-600 rounded-xl space-y-2">
          <p className="text-xs text-slate-400 mb-2">
            Válaszd ki a memory/projects/ mappából a fájlt:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {kbFiles.map((f) => (
              <button
                key={f}
                onClick={() => handleLink(f)}
                className={`text-left px-3 py-2 text-sm rounded-lg border transition-colors ${
                  syncStatus?.kbFileName === f
                    ? 'bg-amber-900/30 border-amber-700 text-amber-300'
                    : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-amber-600/50 hover:text-amber-300'
                }`}
              >
                <code className="text-xs">{f}</code>
                {syncStatus?.kbFileName === f && (
                  <span className="ml-2 text-[10px] text-amber-400">(aktív)</span>
                )}
              </button>
            ))}
          </div>
          {kbFiles.length === 0 && (
            <p className="text-xs text-slate-500">Nincsenek .md fájlok a mappában.</p>
          )}
          <button
            onClick={() => setShowLinkPicker(false)}
            className="text-xs text-slate-500 hover:text-slate-300 mt-1"
          >
            Mégse
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-slate-300">
            Projekt tudásbázis
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Markdown formátum — az agentek és te is szerkeszthetitek, a tartalom automatikusan szinkronizálódik
          </p>
        </div>
        <button
          onClick={() => onSave(content)}
          disabled={saving || !dirty}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Mentés...' : 'Mentés'}
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
        }}
        rows={24}
        className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-y leading-relaxed"
        placeholder={`# ${project.name} — Tudásbázis\n\n## Összefoglaló\n...\n\n## Döntések\n...\n\n## Kapcsolódó információk\n...`}
      />
    </div>
  );
}

export function ProjectSettings() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState<Tab>('general');

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setError('');
      const [proj, userList] = await Promise.all([
        api.projects.get(projectId),
        api.users.list(),
      ]);
      setProject(proj);
      setContacts(proj.contacts || []);
      setMembers(proj.members || []);
      setUsers(userList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 2500);
  };

  const handleSaveGeneral = async (data: Partial<Project>) => {
    if (!projectId) return;
    setSaving(true);
    try {
      const updated = await api.projects.update(projectId, data as any);
      setProject((p) => (p ? { ...p, ...updated } : p));
      flash('Projekt adatok mentve');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  const handleSetMembers = async (userIds: string[]) => {
    if (!projectId) return;
    try {
      const updated = await api.projects.setMembers(projectId, userIds);
      setMembers(updated);
      flash('Hozzáférések frissítve');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba');
    }
  };

  const handleAddContact = async (data: Partial<ProjectContact>) => {
    if (!projectId) return;
    try {
      const created = await api.projects.addContact(projectId, data as any);
      setContacts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      flash('Kapcsolat hozzáadva');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba');
    }
  };

  const handleUpdateContact = async (
    contactId: string,
    data: Partial<ProjectContact>,
  ) => {
    try {
      const updated = await api.projects.updateContact(contactId, data as any);
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, ...updated } : c)),
      );
      flash('Kapcsolat frissítve');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba');
    }
  };

  const handleRemoveContact = async (contactId: string) => {
    try {
      await api.projects.removeContact(contactId);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      flash('Kapcsolat törölve');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba');
    }
  };

  const handleSaveKnowledge = async (kb: string) => {
    if (!projectId) return;
    setSaving(true);
    try {
      await api.projects.update(projectId, { knowledgeBase: kb });
      setProject((p) => (p ? { ...p, knowledgeBase: kb } : p));
      flash('Tudásbázis mentve');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!projectId || !project) return;
    const confirmed = window.prompt(
      `A "${project.name}" projekt és minden hozzá tartozó adat (feladatok, kapcsolatok, stb.) véglegesen törlődik.\n\nA megerősítéshez írd be a projekt nevét:`,
    );
    if (confirmed !== project.name) {
      if (confirmed !== null) setError('A név nem egyezik. Törlés megszakítva.');
      return;
    }
    try {
      await api.projects.delete(projectId);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Törlési hiba');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Betöltés...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">Projekt nem található</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/50 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to={`/project/${projectId}`}
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              ← Tábla
            </Link>
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: (project.color || '#f59e0b') + '30' }}
              >
                {project.image ? (
                  <img
                    src={project.image}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span
                    className="text-sm font-bold"
                    style={{ color: project.color || '#f59e0b' }}
                  >
                    {project.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <h1 className="text-xl font-semibold text-slate-100">
                {project.name}{' '}
                <span className="text-slate-500 font-normal">— Beállítások</span>
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
            {error}
            <button
              onClick={() => setError('')}
              className="ml-2 text-red-400 hover:text-red-200"
            >
              ×
            </button>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-900/30 border border-emerald-800 rounded-lg text-emerald-300 text-sm animate-pulse">
            {success}
          </div>
        )}

        <div className="flex gap-2 mb-6 border-b border-slate-800 pb-4">
          <TabButton
            active={tab === 'general'}
            onClick={() => setTab('general')}
          >
            Általános
          </TabButton>
          <TabButton
            active={tab === 'access'}
            onClick={() => setTab('access')}
            count={members.length}
          >
            Hozzáférés
          </TabButton>
          <TabButton
            active={tab === 'contacts'}
            onClick={() => setTab('contacts')}
            count={contacts.length}
          >
            Kapcsolatok
          </TabButton>
          <TabButton
            active={tab === 'knowledge'}
            onClick={() => setTab('knowledge')}
          >
            Tudásbázis
          </TabButton>
        </div>

        {tab === 'general' && (
          <GeneralTab
            project={project}
            onSave={handleSaveGeneral}
            saving={saving}
          />
        )}
        {tab === 'access' && (
          <AccessTab
            users={users}
            members={members}
            onSetMembers={handleSetMembers}
          />
        )}
        {tab === 'contacts' && (
          <ContactsTab
            contacts={contacts}
            onAdd={handleAddContact}
            onUpdate={handleUpdateContact}
            onRemove={handleRemoveContact}
          />
        )}
        {tab === 'knowledge' && (
          <KnowledgeTab
            project={project}
            onSave={handleSaveKnowledge}
            saving={saving}
            onReload={load}
          />
        )}

        <div className="mt-12 pt-6 border-t border-red-900/30">
          <h3 className="text-sm font-medium text-red-400 mb-2">
            Veszélyzóna
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            A projekt törlése végleges. Minden feladat, kapcsolat és adat
            törlődik.
          </p>
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-900/30 border border-red-800/50 hover:bg-red-900/60 hover:border-red-700 text-red-400 hover:text-red-300 text-sm font-medium rounded-lg transition-colors"
          >
            Projekt törlése
          </button>
        </div>
      </main>
    </div>
  );
}
