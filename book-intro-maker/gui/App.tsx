// 可视化编辑 + 预览界面（阶段三）。
//
// 纯前端 React 应用：左侧表单编辑三件套/模板/音乐，右侧 @remotion/player 实时预览，
// 底部导出可直接喂给批量引擎的配置 JSON。复用渲染层的 propsFromRaw / durationForProps
// 与模板注册表，界面与渲染保持一致。

import React, {useEffect, useMemo, useState} from 'react';
import {Player} from '@remotion/player';
import {BookIntroFromConfig} from '../src/BookIntroFromConfig';
import {durationForProps, propsFromRaw} from '../src/config';
import type {RawConfigInput} from '../src/config';
import {templateIds, getTemplate} from '../src/templates';

const FPS = 30;

type Form = {
  template: string;
  audio: string;
  flashBackgroundPath: string;
  mainTitle: string;
  mainAuthor: string;
  mainCoverPath: string;
  mainBackgroundPath: string;
  mainZh: string;
  mainEn: string;
  flashBooksText: string;
  flashCutFramesText: string;
  introMode: 'generated' | 'video';
  introVideoPath: string;
  introBackgroundPath: string;
  introBrandText: string;
  showSubtitles: boolean;
  subZh: string;
  subEn: string;
};

const INITIAL: Form = {
  template: 'classic',
  audio: 'sample-beat.wav',
  flashBackgroundPath: '',
  mainTitle: '月亮与六便士',
  mainAuthor: '毛姆',
  mainCoverPath: '',
  mainBackgroundPath: '',
  mainZh: '满地都是六便士，他却抬头看见了月亮',
  mainEn: 'Everyone has sixpence, he looked up at the moon',
  flashBooksText: ['了不起的盖茨比 | 菲茨杰拉德 | ', '简爱 | 夏洛蒂 | ', '瓦尔登湖 | 梭罗 | ', '傲慢与偏见 | 奥斯汀 | ', '白鲸 | 麦尔维尔 | '].join('\n'),
  flashCutFramesText: '',
  introMode: 'generated',
  introVideoPath: '',
  introBackgroundPath: '',
  introBrandText: '@BookIntroMaker',
  showSubtitles: true,
  subZh: '今天推荐五本世界名著',
  subEn: 'Five classics tonight',
};

const SAMPLE_BATCH = JSON.stringify(
  [
    {id: 'demo-classic', template: 'classic', mainTitle: '月亮与六便士', mainAuthor: '毛姆', mainZh: '满地都是六便士，他却抬头看见了月亮', flashBooks: '了不起的盖茨比~菲茨杰拉德 | 简爱~夏洛蒂 | 瓦尔登湖~梭罗'},
    {id: 'demo-drama', template: 'drama', mainTitle: '东方快车谋杀案', mainAuthor: '阿加莎', mainZh: '真相只有一个', flashBooks: '福尔摩斯探案集~柯南道尔 | 无人生还~阿加莎 | 白夜行~东野圭吾'},
  ],
  null,
  2,
);

type BatchRecord = {
  index: number;
  id: string;
  status: string;
  qc?: {errors?: string[]; warnings: string[]; infos: string[]};
  url?: string;
  ms?: number;
  error?: string;
  previousStatus?: string;
  previousError?: string;
  retriedAt?: string;
};
type BatchState = {
  jobId?: string;
  total?: number;
  records: BatchRecord[];
  running: boolean;
  paused: boolean;
  status?: string;
  error?: string;
  waitingIndex?: number | null;
  retrying: number[];
};

type View = 'edit' | 'assets' | 'tasks' | 'batch' | 'settings';
type AssetKind = 'covers' | 'backgrounds' | 'introVideos' | 'audio';
type AssetItem = {kind: AssetKind; name: string; path: string; url: string; bytes?: number; mtime?: number; mime?: string};
type AssetLibrary = Record<AssetKind, AssetItem[]>;
type RenderItem = {url: string; bytes?: number; mtime?: number};

const EMPTY_LIBRARY: AssetLibrary = {covers: [], backgrounds: [], introVideos: [], audio: []};
const ASSET_KIND_META: Record<AssetKind, {label: string; hint: string; accept: string}> = {
  covers: {label: '书籍封面', hint: '主书与快闪书单封面', accept: 'image/png,image/jpeg,image/webp'},
  backgrounds: {label: '背景图', hint: '快闪背景、主书背景、开场背景', accept: 'image/png,image/jpeg,image/webp'},
  introVideos: {label: '开场视频', hint: '视频开头可替换片段', accept: 'video/mp4,video/webm,video/quicktime'},
  audio: {label: '背景音乐', hint: '配乐与卡点检测音频', accept: 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg'},
};
const ASSET_KINDS: AssetKind[] = ['covers', 'backgrounds', 'introVideos', 'audio'];
const STATUS_LABEL: Record<string, string> = {queued: '排队中', paused: '已暂停', rendering: '渲染中', rendered: '完成', failed: '失败', 'qc-failed': '质检未过'};
const RETRYABLE_BATCH_STATUSES = new Set(['failed', 'qc-failed']);

// 默认节奏卡点（与 scripts/batch/lib/row-to-config.mjs 的 defaultCutFrames 一致）。
const defaultCutFrames = (count: number): number[] => {
  const start = 134;
  const beat = 5;
  const beats = Math.max(count, 3) + 1;
  return Array.from({length: beats}, (_, i) => start + i * beat);
};

const parseFrameList = (value: string): number[] | null => {
  const frames = value
    .split(/[\s,，;；]+/)
    .map((item) => Number(item.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .map((n) => Math.round(n));
  return frames.length > 0 ? Array.from(new Set(frames)).sort((a, b) => a - b) : null;
};

const normalizeBatchState = (data: any): BatchState => ({
  jobId: data.jobId,
  total: data.total,
  records: Array.isArray(data.records) ? data.records : [],
  running: Boolean(data.running),
  paused: Boolean(data.paused),
  status: data.status,
  error: data.error,
  waitingIndex: Number.isInteger(data.waitingIndex) ? data.waitingIndex : null,
  retrying: Array.isArray(data.retrying) ? data.retrying.filter((n: unknown) => Number.isInteger(n)) : [],
});

const batchProblemText = (record?: BatchRecord | null): string => {
  if (!record) return '—';
  const errors = record.qc?.errors || [];
  const warnings = record.qc?.warnings || [];
  if (record.error) return record.error;
  if (errors.length > 0) return errors.join('；');
  if (warnings.length > 0) return `${warnings.length} 条警告：${warnings.slice(0, 2).join('；')}`;
  if (record.previousError) return `上次失败：${record.previousError}`;
  return '—';
};

type FlashBookForm = {title: string; author?: string; coverPath?: string};

const parseFlashBooksText = (value: string): FlashBookForm[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [title, author, coverPath] = line.split('|').map((s) => s.trim());
      return {title: title || '未命名', author: author || undefined, coverPath: coverPath || undefined};
    });

const formatFlashBooksText = (books: FlashBookForm[]): string =>
  books.map((book) => [book.title, book.author || '', book.coverPath || ''].join(' | ')).join('\n');

const buildRaw = (form: Form): RawConfigInput => {
  const flashBooks = parseFlashBooksText(form.flashBooksText).map((book) => ({
    title: book.title,
    author: book.author,
    isbn: null,
    coverPath: book.coverPath || null,
  }));

  const tracks = form.subZh || form.subEn
    ? [{id: 's1', startFrame: 8, endFrame: 60, zh: form.subZh || undefined, en: form.subEn || undefined, position: 'lower'}]
    : [];

  return {
    template: form.template,
    audio: form.audio || undefined,
    visualAssets: {
      flashBackgroundPath: form.flashBackgroundPath || null,
    },
    books: {
      flashCutFrames: parseFrameList(form.flashCutFramesText) || defaultCutFrames(flashBooks.length),
      flashBooks,
      mainBook: {
        title: form.mainTitle,
        author: form.mainAuthor || undefined,
        isbn: null,
        coverPath: form.mainCoverPath || null,
        backgroundPath: form.mainBackgroundPath || null,
        zhLine: form.mainZh || undefined,
        enLine: form.mainEn || undefined,
      },
    },
    subtitles: {tracks},
    intro: {
      mode: form.introMode,
      videoPath: form.introVideoPath || null,
      backgroundPath: form.introBackgroundPath || null,
      trimStart: 0,
      trimEnd: null,
      volume: 1,
      muted: false,
      showSubtitles: form.showSubtitles,
      brandText: form.introBrandText,
    },
  };
};

const labelStyle: React.CSSProperties = {display: 'block', fontSize: 12, color: '#5b6472', marginBottom: 4, marginTop: 14, fontWeight: 600};
const inputStyle: React.CSSProperties = {width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #d3d9e0', borderRadius: 8, fontSize: 14, background: '#fff'};
const softButtonStyle: React.CSSProperties = {padding: '8px 13px', borderRadius: 4, border: '1px solid #d7deea', background: '#eef2fb', color: '#2b3a67', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap'};
const sidebarButtonStyle = (active: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '16px 15px',
  border: 'none',
  borderRadius: 0,
  textAlign: 'left',
  background: active ? '#3c4778' : '#252d59',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1.55,
});

const Field: React.FC<{label: string; children: React.ReactNode}> = ({label, children}) => (
  <label>
    <span style={labelStyle}>{label}</span>
    {children}
  </label>
);

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });

const publicAssetUrl = (assetPath: string): string => {
  if (/^(https?:|data:|blob:)/i.test(assetPath)) return assetPath;
  return `/${assetPath.replace(/^public\//, '').replace(/^\/+/, '')}`;
};

const formatBytes = (bytes?: number): string => {
  if (!Number.isFinite(bytes)) return '';
  if ((bytes as number) >= 1048576) return `${((bytes as number) / 1048576).toFixed(1)} MB`;
  if ((bytes as number) >= 1024) return `${Math.round((bytes as number) / 1024)} KB`;
  return `${bytes} B`;
};

const viewFromUrl = (): View => {
  if (typeof location === 'undefined') return 'edit';
  const value = new URLSearchParams(location.search).get('view');
  return value === 'assets' || value === 'tasks' || value === 'batch' || value === 'settings' ? value : 'edit';
};

// 支持通过 URL 预填初始表单，便于分享带预设的编辑器链接（如 ?template=drama&title=...）。
const initialForm = (): Form => {
  if (typeof location === 'undefined') return INITIAL;
  const p = new URLSearchParams(location.search);
  return {
    ...INITIAL,
    template: p.get('template') || INITIAL.template,
    audio: p.get('audio') || INITIAL.audio,
    flashBackgroundPath: p.get('flashBg') || INITIAL.flashBackgroundPath,
    mainTitle: p.get('title') || INITIAL.mainTitle,
    mainAuthor: p.get('author') || INITIAL.mainAuthor,
    mainCoverPath: p.get('cover') || INITIAL.mainCoverPath,
    mainBackgroundPath: p.get('mainBg') || INITIAL.mainBackgroundPath,
    flashCutFramesText: p.get('cuts') || INITIAL.flashCutFramesText,
    introVideoPath: p.get('introVideo') || INITIAL.introVideoPath,
    introBackgroundPath: p.get('introBg') || INITIAL.introBackgroundPath,
    introBrandText: p.get('brand') ?? INITIAL.introBrandText,
    mainZh: p.get('zh') || INITIAL.mainZh,
    mainEn: p.get('en') || INITIAL.mainEn,
  };
};

export const App: React.FC = () => {
  const [form, setForm] = useState<Form>(initialForm);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({...f, [key]: value}));
  const flashBookRows = useMemo(() => parseFlashBooksText(form.flashBooksText), [form.flashBooksText]);

  const raw = useMemo(() => buildRaw(form), [form]);
  const duration = useMemo(() => durationForProps(propsFromRaw(raw)), [raw]);
  const lastCut = (raw.books as {flashCutFrames: number[]}).flashCutFrames.slice(-1)[0] ?? 0;
  const previewFrame = Math.min(duration - 1, lastCut + 12); // 预览默认停在主书页。

  const exportJson = useMemo(() => JSON.stringify({id: 'my-video', ...raw}, null, 2), [raw]);

  const copyExport = () => {
    navigator.clipboard?.writeText(exportJson).catch(() => undefined);
  };

  // 本地服务：探活 + 一键渲染 MP4。纯静态打开时按钮不可用。
  const [apiOk, setApiOk] = useState(false);
  const [render, setRender] = useState<{status: 'idle' | 'rendering' | 'done' | 'error'; url?: string; error?: string}>({status: 'idle'});
  const [upload, setUpload] = useState<{status: 'idle' | 'uploading' | 'done' | 'error'; message?: string}>({status: 'idle'});
  const [beats, setBeats] = useState<{status: 'idle' | 'detecting' | 'done' | 'error'; count?: number; error?: string}>({status: 'idle'});
  const [coverLookup, setCoverLookup] = useState<{status: 'idle' | 'querying' | 'done' | 'placeholder' | 'error'; message?: string}>({status: 'idle'});
  const [assetLibrary, setAssetLibrary] = useState<AssetLibrary>(EMPTY_LIBRARY);
  const [libraryStatus, setLibraryStatus] = useState<{status: 'idle' | 'loading' | 'ready' | 'error'; message?: string}>({status: 'idle'});
  useEffect(() => {
    fetch('/api/health')
      .then((r) => setApiOk(r.ok))
      .catch(() => setApiOk(false));
  }, []);

  const loadAssetLibrary = async () => {
    if (!apiOk) return;
    setLibraryStatus({status: 'loading'});
    try {
      const res = await fetch('/api/assets');
      const data = await res.json();
      const next = {...EMPTY_LIBRARY, ...(data.assets || {})} as AssetLibrary;
      setAssetLibrary(next);
      setLibraryStatus({status: 'ready'});
    } catch (error) {
      setLibraryStatus({status: 'error', message: String(error)});
    }
  };

  useEffect(() => {
    if (apiOk) void loadAssetLibrary();
  }, [apiOk]);

  const renderNow = async () => {
    setRender({status: 'rendering'});
    try {
      const res = await fetch('/api/render', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({id: form.mainTitle, ...raw})});
      const data = await res.json();
      if (data.ok) {
        setRender({status: 'done', url: data.url});
        void refreshTasks();
      } else setRender({status: 'error', error: data.error || '渲染失败'});
    } catch (e) {
      setRender({status: 'error', error: String(e)});
    }
  };

  const uploadAsset = async (kind: 'covers' | 'backgrounds' | 'introVideos' | 'audio', file: File | null | undefined): Promise<string | null> => {
    if (!file) return null;
    if (!apiOk) {
      setUpload({status: 'error', message: '本地服务未连接'});
      return null;
    }
    setUpload({status: 'uploading', message: file.name});
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await fetch('/api/assets/upload', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({kind, fileName: file.name, dataUrl}),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '上传失败');
      setUpload({status: 'done', message: data.path});
      void loadAssetLibrary();
      return data.path;
    } catch (error) {
      setUpload({status: 'error', message: String(error)});
      return null;
    }
  };

  const uploadManyAssets = async (kind: AssetKind, files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await uploadAsset(kind, file);
    }
    void loadAssetLibrary();
  };

  const uploadToField = async <K extends keyof Form>(kind: 'covers' | 'backgrounds' | 'introVideos' | 'audio', key: K, file: File | null | undefined) => {
    const assetPath = await uploadAsset(kind, file);
    if (assetPath) set(key, assetPath as Form[K]);
  };

  const updateFlashBook = (index: number, patch: Partial<FlashBookForm>) => {
    setForm((current) => {
      const books = parseFlashBooksText(current.flashBooksText);
      if (!books[index]) return current;
      books[index] = {...books[index], ...patch};
      return {...current, flashBooksText: formatFlashBooksText(books)};
    });
  };

  const uploadFlashCoverAt = async (index: number, file: File | null | undefined) => {
    const assetPath = await uploadAsset('covers', file);
    if (assetPath) updateFlashBook(index, {coverPath: assetPath});
  };

  const uploadFlashCovers = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const books = parseFlashBooksText(form.flashBooksText);
    for (let i = 0; i < files.length && i < books.length; i++) {
      const assetPath = await uploadAsset('covers', files[i]);
      if (assetPath) books[i] = {...books[i], coverPath: assetPath};
    }
    set('flashBooksText', formatFlashBooksText(books));
  };

  const lookupMainCover = async () => {
    if (!apiOk) {
      setCoverLookup({status: 'error', message: '本地服务未连接'});
      return;
    }
    setCoverLookup({status: 'querying'});
    try {
      const res = await fetch('/api/covers/lookup', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({title: form.mainTitle, author: form.mainAuthor, force: true}),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '查询失败');
      if (data.coverPath) {
        set('mainCoverPath', data.coverPath);
        setCoverLookup({status: 'done', message: `封面来源：${data.coverSource}`});
        void loadAssetLibrary();
      } else {
        setCoverLookup({status: 'placeholder', message: '未找到真实封面，已保持生成式封面降级'});
      }
    } catch (error) {
      setCoverLookup({status: 'error', message: String(error)});
    }
  };

  const detectBeats = async () => {
    if (!apiOk) {
      setBeats({status: 'error', error: '本地服务未连接'});
      return;
    }
    setBeats({status: 'detecting'});
    try {
      const res = await fetch('/api/beats/detect', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({audio: form.audio, start: 4, end: 7, max: 14, fps: FPS}),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '卡点失败');
      const frames = Array.isArray(data.flashCutFrames) ? data.flashCutFrames : [];
      set('flashCutFramesText', frames.join(', '));
      setBeats({status: 'done', count: frames.length});
    } catch (error) {
      setBeats({status: 'error', error: String(error)});
    }
  };

  // 批量队列
  const [view, setView] = useState<View>(viewFromUrl);
  const [batchText, setBatchText] = useState(SAMPLE_BATCH);
  const [batch, setBatch] = useState<BatchState>({records: [], running: false, paused: false, retrying: []});
  useEffect(() => {
    if (!batch.jobId || !batch.running) return undefined;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/batch/${batch.jobId}`);
        const data = await res.json();
        if (data.ok !== false) setBatch(normalizeBatchState(data));
      } catch {
        /* 忽略单次轮询失败 */
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [batch.jobId, batch.running]);
  const startBatch = async () => {
    let videos: unknown;
    try {
      videos = JSON.parse(batchText);
    } catch {
      alert('批量数据不是合法 JSON');
      return;
    }
    try {
      const res = await fetch('/api/batch', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({videos})});
      const data = await res.json();
      if (data.jobId) setBatch(normalizeBatchState(data));
      else alert(data.error || '启动失败');
    } catch (e) {
      alert(String(e));
    }
  };
  const controlBatch = async (action: 'pause' | 'resume') => {
    if (!batch.jobId) return;
    try {
      const res = await fetch(`/api/batch/${batch.jobId}/${action}`, {method: 'POST'});
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        alert(data.error || '队列控制失败');
        return;
      }
      setBatch(normalizeBatchState(data));
    } catch (error) {
      alert(String(error));
    }
  };
  const retryBatchRecord = async (index: number) => {
    if (!batch.jobId) return;
    try {
      const res = await fetch(`/api/batch/${batch.jobId}/retry`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({index})});
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        alert(data.error || '重试失败');
        return;
      }
      setBatch(normalizeBatchState(data));
    } catch (error) {
      alert(String(error));
    }
  };
  const useCurrentInBatch = () => {
    setBatchText(JSON.stringify([{id: form.mainTitle || 'video', ...raw}], null, 2));
  };
  const doneCount = batch.records.filter((r) => r && ['rendered', 'failed', 'qc-failed'].includes(r.status)).length;
  const batchTotal = batch.total || batch.records.length;
  const batchStatusText = batch.paused ? '已暂停' : batch.status === 'retrying' ? '单条重试中' : batch.running ? '进行中' : batch.jobId ? '已结束' : '未开始';

  // 批量历史（服务端归档，重启后仍可见）
  const [batches, setBatches] = useState<{jobId: string; total?: number; summary?: Record<string, number>; running?: boolean; paused?: boolean; status?: string; createdAt?: string}[]>([]);
  const [renders, setRenders] = useState<RenderItem[]>([]);
  const refreshTasks = async () => {
    if (!apiOk) return;
    try {
      const [renderRes, batchRes] = await Promise.all([fetch('/api/renders'), fetch('/api/batches')]);
      const renderData = await renderRes.json();
      const batchData = await batchRes.json();
      setRenders(Array.isArray(renderData.renders) ? renderData.renders : []);
      setBatches(Array.isArray(batchData.batches) ? batchData.batches : []);
    } catch {
      /* 任务中心刷新失败不影响编辑器 */
    }
  };
  useEffect(() => {
    if ((view === 'batch' || view === 'tasks') && apiOk) void refreshTasks();
  }, [view, apiOk, batch.running]);

  const assetItems = (kind: AssetKind) => assetLibrary[kind] || [];
  const assetLabel = (item: AssetItem) => `${item.name}${item.bytes ? ` · ${formatBytes(item.bytes)}` : ''}`;

  const assetPicker = (kind: AssetKind, value: string, onChange: (value: string) => void, emptyLabel = '不选择素材') => {
    const items = assetItems(kind);
    const hasCurrent = value && items.some((item) => item.path === value);
    return (
      <select style={{...inputStyle, flex: 1}} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {value && !hasCurrent ? <option value={value}>当前路径：{value}</option> : null}
        {items.map((item) => (
          <option key={item.path} value={item.path}>
            {assetLabel(item)}
          </option>
        ))}
      </select>
    );
  };

  const assetPreview = (item: AssetItem) => {
    if (item.kind === 'covers' || item.kind === 'backgrounds') {
      return <img src={item.url} alt={item.name} style={{width: '100%', height: '100%', objectFit: 'cover'}} />;
    }
    if (item.kind === 'introVideos') {
      return <video src={item.url} muted style={{width: '100%', height: '100%', objectFit: 'cover', background: '#101827'}} />;
    }
    return <div style={{fontSize: 22, color: '#6d7890'}}>♪</div>;
  };

  const libraryCount = ASSET_KINDS.reduce((total, kind) => total + assetItems(kind).length, 0);

  const assetLibraryView = (
    <div style={{padding: 24, overflow: 'auto', flex: 1}}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16}}>
        <div>
          <h2 style={{fontSize: 22, margin: '0 0 6px'}}>素材库</h2>
          <div style={{fontSize: 13, color: '#6d7890'}}>先把常用素材批量放进这里，再回到主界面从下拉框选择。</div>
        </div>
        <button type="button" onClick={loadAssetLibrary} disabled={!apiOk || libraryStatus.status === 'loading'} style={{...softButtonStyle, background: '#fff'}}>
          {libraryStatus.status === 'loading' ? '刷新中' : `刷新素材（${libraryCount}）`}
        </button>
      </div>
      {libraryStatus.status === 'error' ? <div style={{fontSize: 12, color: '#d33', marginBottom: 12}}>{libraryStatus.message}</div> : null}
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(320px, 1fr))', gap: 16}}>
        {ASSET_KINDS.map((kind) => {
          const meta = ASSET_KIND_META[kind];
          const items = assetItems(kind);
          return (
            <section key={kind} style={{background: '#fff', border: '1px solid #e5eaf3', padding: 16}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12}}>
                <div>
                  <h3 style={{fontSize: 18, margin: 0}}>{meta.label}</h3>
                  <div style={{fontSize: 12, color: '#6d7890', marginTop: 3}}>{meta.hint}</div>
                </div>
                <label style={{...softButtonStyle, marginLeft: 'auto'}}>
                  批量上传
                  <input type="file" multiple accept={meta.accept} disabled={!apiOk || upload.status === 'uploading'} onChange={(e) => uploadManyAssets(kind, e.target.files)} style={{display: 'none'}} />
                </label>
              </div>
              {items.length === 0 ? (
                <div style={{height: 122, border: '1px dashed #ccd5e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a93a0', fontSize: 13}}>暂无素材</div>
              ) : (
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 10}}>
                  {items.map((item) => (
                    <div key={item.path} style={{border: '1px solid #e1e6ee', background: '#fff'}}>
                      <div style={{height: 92, background: '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}}>{assetPreview(item)}</div>
                      <div style={{padding: 8}}>
                        <div title={item.name} style={{fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{item.name}</div>
                        <div style={{fontSize: 11, color: '#8a93a0', marginTop: 3}}>{formatBytes(item.bytes)}</div>
                        <button type="button" onClick={() => navigator.clipboard?.writeText(item.path).catch(() => undefined)} style={{...softButtonStyle, padding: '5px 8px', marginTop: 8, width: '100%'}}>
                          复制路径
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );

  const taskCenterView = (
    <div style={{padding: 24, overflow: 'auto', flex: 1}}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16}}>
        <div>
          <h2 style={{fontSize: 22, margin: '0 0 6px'}}>任务中心</h2>
          <div style={{fontSize: 13, color: '#6d7890'}}>集中查看单条生成结果、批量任务进度、失败原因和重试入口。</div>
        </div>
        <button type="button" onClick={refreshTasks} disabled={!apiOk} style={{...softButtonStyle, background: '#fff'}}>刷新任务</button>
      </div>
      <section style={{background: '#fff', border: '1px solid #e5eaf3', padding: 16, marginBottom: 16}}>
        <h3 style={{fontSize: 18, margin: '0 0 10px'}}>最近生成的视频</h3>
        {renders.length === 0 ? (
          <div style={{fontSize: 13, color: '#8a93a0'}}>暂无生成记录。</div>
        ) : (
          <div style={{display: 'grid', gap: 8}}>
            {renders.slice(0, 20).map((item) => (
              <div key={item.url} style={{display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #eef1f5', padding: '7px 0', fontSize: 13}}>
                <a href={item.url} target="_blank" rel="noreferrer" style={{color: '#2f6bff', fontWeight: 700}}>播放视频</a>
                <span style={{color: '#6d7890', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{item.url}</span>
                <span style={{marginLeft: 'auto', color: '#8a93a0'}}>{formatBytes(item.bytes)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section style={{background: '#fff', border: '1px solid #e5eaf3', padding: 16}}>
        <h3 style={{fontSize: 18, margin: '0 0 10px'}}>批量任务</h3>
        {batches.length === 0 ? (
          <div style={{fontSize: 13, color: '#8a93a0'}}>暂无批量任务。</div>
        ) : (
          <div style={{display: 'grid', gap: 8}}>
            {batches.map((b) => (
              <div key={b.jobId} style={{display: 'flex', gap: 12, fontSize: 13, color: '#6b7480', padding: '8px 0', borderBottom: '1px solid #eef1f5'}}>
                <span style={{fontFamily: 'ui-monospace, monospace', color: '#101a36'}}>{b.jobId}</span>
                <span>{b.running ? (b.paused ? '已暂停' : '进行中') : b.summary ? Object.entries(b.summary).map(([k, v]) => `${k}:${v}`).join('  ') : b.status || '—'}</span>
                <span style={{color: '#9aa4b0', marginLeft: 'auto'}}>{b.createdAt ? b.createdAt.slice(0, 19).replace('T', ' ') : ''}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const settingsView = (
    <div style={{padding: 24, overflow: 'auto', flex: 1}}>
      <section style={{background: '#fff', border: '1px solid #e5eaf3', padding: 18, maxWidth: 900}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
          <div>
            <h2 style={{fontSize: 22, margin: '0 0 6px'}}>高级配置</h2>
            <div style={{fontSize: 13, color: '#6d7890'}}>导出当前视频配置，供批量生产或排查问题使用。</div>
          </div>
          <button id="copy-btn" onClick={copyExport} style={{padding: '8px 16px', border: 'none', borderRadius: 6, background: '#2f6bff', color: '#fff', fontSize: 13, cursor: 'pointer'}}>
            复制配置
          </button>
        </div>
        <pre id="export-json" style={{height: 560, margin: '16px 0 0', overflow: 'auto', background: '#0f1620', color: '#cfe3ff', padding: 14, borderRadius: 8, fontSize: 11, lineHeight: 1.5}}>
          {exportJson}
        </pre>
      </section>
    </div>
  );

  const batchView = (
    <div style={{padding: 24, width: '100%', maxWidth: 960, margin: '0 auto', boxSizing: 'border-box'}}>
      <h2 style={{fontSize: 17, margin: '0 0 6px'}}>批量渲染队列</h2>
      <div style={{fontSize: 13, color: '#8a93a0', marginBottom: 10}}>
        粘贴批量数据（JSON 数组，字段同 <code>config/batch/sample.json</code>），逐条排队渲染并显示进度与失败原因。
      </div>
      <textarea value={batchText} onChange={(e) => setBatchText(e.target.value)} style={{width: '100%', height: 150, boxSizing: 'border-box', padding: 10, border: '1px solid #d3d9e0', borderRadius: 8, fontFamily: 'ui-monospace, monospace', fontSize: 12}} />
      <div style={{display: 'flex', gap: 10, alignItems: 'center', margin: '10px 0 18px'}}>
        <button onClick={startBatch} disabled={!apiOk || batch.running} style={{padding: '9px 16px', border: 'none', borderRadius: 8, background: !apiOk || batch.running ? '#9bb4e8' : '#16a34a', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer'}}>
          {batch.running ? `渲染中… ${doneCount}/${batchTotal || batch.records.length}` : '开始批量渲染'}
        </button>
        <button onClick={() => controlBatch('pause')} disabled={!apiOk || !batch.jobId || !batch.running || batch.paused} style={{padding: '9px 14px', border: '1px solid #cdd5df', borderRadius: 8, background: !apiOk || !batch.jobId || !batch.running || batch.paused ? '#eef2f6' : '#fff', fontSize: 13, cursor: 'pointer'}}>
          暂停
        </button>
        <button onClick={() => controlBatch('resume')} disabled={!apiOk || !batch.jobId || !batch.running || !batch.paused} style={{padding: '9px 14px', border: '1px solid #cdd5df', borderRadius: 8, background: !apiOk || !batch.jobId || !batch.running || !batch.paused ? '#eef2f6' : '#fff', fontSize: 13, cursor: 'pointer'}}>
          恢复
        </button>
        <button onClick={useCurrentInBatch} style={{padding: '9px 14px', border: '1px solid #cdd5df', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer'}}>
          用当前编辑配置
        </button>
        {batch.jobId ? <span style={{fontSize: 12, color: '#6b7480'}}>任务：{batchStatusText}</span> : null}
        {!apiOk ? <span style={{fontSize: 12, color: '#8a93a0'}}>需本地服务（npm run server）</span> : null}
      </div>
      {batch.error ? <div style={{fontSize: 12, color: '#d33', margin: '-8px 0 14px'}}>队列错误：{batch.error}</div> : null}

      {batch.records.length > 0 ? (
        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 13}}>
          <thead>
            <tr style={{textAlign: 'left', color: '#6b7480', borderBottom: '2px solid #e6eaf0'}}>
              <th style={{padding: '8px 6px'}}>#</th>
              <th style={{padding: '8px 6px'}}>ID</th>
              <th style={{padding: '8px 6px'}}>状态</th>
              <th style={{padding: '8px 6px'}}>问题</th>
              <th style={{padding: '8px 6px'}}>产物</th>
              <th style={{padding: '8px 6px'}}>操作</th>
            </tr>
          </thead>
          <tbody>
            {batch.records.map((r, i) => (
              <tr key={i} style={{borderBottom: '1px solid #eef1f5'}}>
                <td style={{padding: '8px 6px', color: '#9aa4b0'}}>{i + 1}</td>
                <td style={{padding: '8px 6px'}}>{r?.id ?? '—'}</td>
                <td style={{padding: '8px 6px', color: r?.status === 'rendered' ? '#16a34a' : r?.status === 'failed' || r?.status === 'qc-failed' ? '#d33' : '#2f6bff'}}>
                  {r ? STATUS_LABEL[r.status] || r.status : '等待'}
                  {r?.ms ? <span style={{color: '#9aa4b0'}}> · {(r.ms / 1000).toFixed(1)}s</span> : null}
                </td>
                <td style={{padding: '8px 6px', color: r?.error || (r?.qc?.errors || []).length ? '#d33' : '#b07d2b'}}>{batchProblemText(r)}</td>
                <td style={{padding: '8px 6px'}}>{r?.url ? (<a href={r.url} target="_blank" rel="noreferrer" style={{color: '#2f6bff'}}>播放</a>) : '—'}</td>
                <td style={{padding: '8px 6px'}}>
                  {r && RETRYABLE_BATCH_STATUSES.has(r.status) ? (
                    <button onClick={() => retryBatchRecord(i)} disabled={!apiOk || batch.running || batch.retrying.includes(i)} style={{padding: '5px 9px', border: '1px solid #cdd5df', borderRadius: 8, background: !apiOk || batch.running || batch.retrying.includes(i) ? '#eef2f6' : '#fff', fontSize: 12, cursor: 'pointer'}}>
                      {batch.retrying.includes(i) ? '重试中' : '重试'}
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {batches.length > 0 ? (
        <div style={{marginTop: 28}}>
          <h3 style={{fontSize: 14, margin: '0 0 8px', color: '#5b6472'}}>历史任务</h3>
          {batches.map((b) => (
            <div key={b.jobId} style={{display: 'flex', gap: 12, fontSize: 12, color: '#6b7480', padding: '5px 0', borderBottom: '1px solid #eef1f5'}}>
              <span style={{fontFamily: 'ui-monospace, monospace'}}>{b.jobId}</span>
              <span>{b.running ? (b.paused ? '已暂停' : '进行中…') : b.summary ? Object.entries(b.summary).map(([k, v]) => `${k}:${v}`).join('  ') : b.status || '—'}</span>
              <span style={{color: '#9aa4b0', marginLeft: 'auto'}}>{b.createdAt ? b.createdAt.slice(0, 19).replace('T', ' ') : ''}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  const viewCopy: Record<View, {title: string; subtitle: string}> = {
    edit: {title: '书籍短视频模板', subtitle: '填写书籍内容，从素材库选择素材，预览并生成竖屏 MP4。'},
    assets: {title: '素材库', subtitle: '批量上传和管理封面、背景、开场视频与音乐素材。'},
    tasks: {title: '任务中心', subtitle: '查看生成记录、批量任务、失败原因与重试入口。'},
    batch: {title: '批量生产', subtitle: '导入批量数据，排队渲染并查看每条任务状态。'},
    settings: {title: '设置', subtitle: '管理高级配置、导出 JSON 和后续客户端参数。'},
  };
  const primaryAction = view === 'batch' ? startBatch : view === 'edit' ? renderNow : undefined;
  const primaryDisabled = view === 'batch' ? !apiOk || batch.running : view === 'edit' ? !apiOk || render.status === 'rendering' : true;
  const stopDisabled = !apiOk || !batch.jobId || !batch.running || batch.paused;

  return (
    <div style={{display: 'flex', height: '100vh', fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif', color: '#101a36', background: '#f1f4fa'}}>
      <aside style={{width: 300, flexShrink: 0, background: '#151b36', color: '#fff', display: 'flex', flexDirection: 'column', padding: '34px 23px 22px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 22, marginBottom: 36}}>
          <div style={{width: 78, height: 78, borderRadius: 18, background: 'linear-gradient(135deg, #25bcd3, #7652ff)', position: 'relative', boxShadow: '0 14px 30px rgba(0,0,0,0.22)'}}>
            <div style={{position: 'absolute', inset: 18, border: '5px solid #fff', borderRadius: 999}} />
            <div style={{position: 'absolute', left: 36, top: 18, width: 7, height: 37, background: '#fff'}} />
            <div style={{position: 'absolute', left: 28, top: 48, width: 24, height: 7, background: '#fff', transform: 'rotate(45deg)', transformOrigin: 'right center'}} />
            <div style={{position: 'absolute', left: 28, top: 48, width: 24, height: 7, background: '#fff', transform: 'rotate(-45deg)', transformOrigin: 'right center'}} />
            <div style={{position: 'absolute', left: 12, right: 12, top: 35, height: 8, borderTop: '4px solid #fff', borderBottom: '4px solid #fff', borderRadius: 999, opacity: 0.95}} />
          </div>
          <div>
            <div style={{fontSize: 24, fontWeight: 800, letterSpacing: 0}}>水星视频模板</div>
            <div style={{fontSize: 12, color: '#9fc5ff', marginTop: 4}}>MERCURY VIDEO TEMPLATE</div>
          </div>
        </div>

        <div style={{fontSize: 13, color: '#73c7ff', margin: '0 0 10px'}}>模板入口</div>
        <div style={{display: 'grid', gap: 8}}>
          <button type="button" onClick={() => setView('edit')} style={sidebarButtonStyle(view === 'edit')}>
            <div style={{fontWeight: 700}}>视频模板制作</div>
            <div style={{fontSize: 12, color: '#dbe7ff'}}>内容填写、素材选择、预览生成</div>
          </button>
          <button type="button" onClick={() => setView('batch')} style={sidebarButtonStyle(view === 'batch')}>
            <div style={{fontWeight: 700}}>批量生产</div>
            <div style={{fontSize: 12, color: '#dbe7ff'}}>读取 JSON/CSV 批量渲染</div>
          </button>
        </div>

        <div style={{fontSize: 13, color: '#73c7ff', margin: '30px 0 10px'}}>通用操作</div>
        <div style={{display: 'grid', gap: 8}}>
          <button type="button" onClick={() => setView('assets')} style={sidebarButtonStyle(view === 'assets')}>
            <div style={{fontWeight: 700}}>素材库</div>
            <div style={{fontSize: 12, color: '#dbe7ff'}}>批量上传、预览、复制路径</div>
          </button>
          <button type="button" onClick={() => setView('tasks')} style={sidebarButtonStyle(view === 'tasks')}>
            <div style={{fontWeight: 700}}>任务中心</div>
            <div style={{fontSize: 12, color: '#dbe7ff'}}>进度、失败原因、重试</div>
          </button>
          <button type="button" onClick={() => setView('settings')} style={sidebarButtonStyle(view === 'settings')}>
            <div style={{fontWeight: 700}}>设置</div>
            <div style={{fontSize: 12, color: '#dbe7ff'}}>导出配置、高级选项</div>
          </button>
        </div>

        <div style={{height: 1, background: '#303963', margin: '26px 0'}} />
        <div style={{marginTop: 'auto', fontSize: 13, lineHeight: 1.9}}>
          <div style={{color: '#9fc5ff'}}>当前状态</div>
          <div style={{fontWeight: 700}}>{apiOk ? '本地服务运行中' : '等待本地服务'}</div>
          <div style={{color: '#9aa7d7'}}>v0.2.1</div>
        </div>
      </aside>

      <main style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
      <div style={{height: 118, padding: '28px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0}}>
        <div>
          <h1 style={{fontSize: 30, margin: '0 0 8px', color: '#101a36'}}>{viewCopy[view].title}</h1>
          <div style={{fontSize: 13, color: '#52607a'}}>{viewCopy[view].subtitle}</div>
        </div>
        {primaryAction ? (
          <div style={{display: 'flex', gap: 10}}>
            <button type="button" onClick={primaryAction} disabled={primaryDisabled} style={{padding: '12px 34px', border: 'none', borderRadius: 0, background: primaryDisabled ? '#9bb4e8' : '#6d45f5', color: '#fff', fontSize: 14, fontWeight: 700, cursor: primaryDisabled ? 'default' : 'pointer'}}>
              {view === 'batch' ? (batch.running ? '批量生成中' : '开始批量') : render.status === 'rendering' ? '生成中' : '生成当前视频'}
            </button>
            {view === 'batch' ? (
              <button type="button" onClick={() => controlBatch('pause')} disabled={stopDisabled} style={{padding: '12px 34px', border: 'none', borderRadius: 0, background: stopDisabled ? '#f7dfdd' : '#ffd9d6', color: '#b53027', fontSize: 14, fontWeight: 700, cursor: stopDisabled ? 'default' : 'pointer'}}>
                暂停批量
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div style={{display: view === 'edit' ? 'flex' : 'none', flex: 1, minHeight: 0, gap: 14, padding: '0 24px 22px'}}>
      {/* 编辑面板 */}
      <div style={{width: 390, padding: '20px 20px', overflowY: 'auto', border: '1px solid #e5eaf3', background: '#fff'}}>
        <h2 style={{fontSize: 24, margin: '0 0 6px'}}>输入内容</h2>
        <div style={{fontSize: 12, color: '#6d7890'}}>模板、素材、书单与字幕</div>
        {upload.status === 'uploading' ? <div style={{fontSize: 12, color: '#2f6bff', marginTop: 8}}>正在上传：{upload.message}</div> : null}
        {upload.status === 'done' ? <div style={{fontSize: 12, color: '#16a34a', marginTop: 8}}>已上传：{upload.message}</div> : null}
        {upload.status === 'error' ? <div style={{fontSize: 12, color: '#d33', marginTop: 8}}>{upload.message}</div> : null}

        <Field label="模板风格">
          <select style={inputStyle} value={form.template} onChange={(e) => set('template', e.target.value)}>
            {templateIds().map((id) => (
              <option key={id} value={id}>
                {id} · {getTemplate(id).label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="背景音乐">
          <div style={{display: 'flex', gap: 8}}>
            {assetPicker('audio', form.audio, (value) => set('audio', value), '不使用音乐')}
            <label style={softButtonStyle}>
              上传
              <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg" disabled={!apiOk || upload.status === 'uploading'} onChange={(e) => uploadToField('audio', 'audio', e.target.files?.[0])} style={{display: 'none'}} />
            </label>
          </div>
        </Field>
        <Field label="快闪段背景图">
          <div style={{display: 'flex', gap: 8}}>
            {assetPicker('backgrounds', form.flashBackgroundPath, (value) => set('flashBackgroundPath', value), '使用模板默认背景')}
            <label style={softButtonStyle}>
              上传
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!apiOk || upload.status === 'uploading'} onChange={(e) => uploadToField('backgrounds', 'flashBackgroundPath', e.target.files?.[0])} style={{display: 'none'}} />
            </label>
          </div>
          {form.flashBackgroundPath ? <img src={publicAssetUrl(form.flashBackgroundPath)} alt="快闪背景" style={{width: '100%', height: 70, objectFit: 'cover', borderRadius: 6, marginTop: 8, border: '1px solid #d3d9e0'}} /> : null}
        </Field>
        <Field label="快闪切点帧">
          <div style={{display: 'flex', gap: 8}}>
            <input style={{...inputStyle, flex: 1}} value={form.flashCutFramesText} onChange={(e) => set('flashCutFramesText', e.target.value)} placeholder="134, 142, 146..." />
            <button type="button" onClick={detectBeats} disabled={!apiOk || beats.status === 'detecting'} style={softButtonStyle}>
              {beats.status === 'detecting' ? '检测中' : '自动卡点'}
            </button>
          </div>
          {beats.status === 'done' ? <div style={{fontSize: 12, color: '#16a34a', marginTop: 6}}>已生成 {beats.count} 个切点</div> : null}
          {beats.status === 'error' ? <div style={{fontSize: 12, color: '#d33', marginTop: 6}}>{beats.error}</div> : null}
        </Field>

        <Field label="主书 · 书名">
          <input style={inputStyle} value={form.mainTitle} onChange={(e) => set('mainTitle', e.target.value)} />
        </Field>
        <Field label="主书 · 作者">
          <input style={inputStyle} value={form.mainAuthor} onChange={(e) => set('mainAuthor', e.target.value)} />
        </Field>
        <Field label="主书 · 本地封面">
          <div style={{display: 'flex', gap: 8}}>
            {assetPicker('covers', form.mainCoverPath, (value) => set('mainCoverPath', value), '使用生成式封面')}
            <label style={softButtonStyle}>
              {upload.status === 'uploading' ? '上传中' : '上传'}
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!apiOk || upload.status === 'uploading'} onChange={(e) => uploadToField('covers', 'mainCoverPath', e.target.files?.[0])} style={{display: 'none'}} />
            </label>
            <button type="button" onClick={lookupMainCover} disabled={!apiOk || coverLookup.status === 'querying'} style={softButtonStyle}>
              {coverLookup.status === 'querying' ? '查询中' : '查询'}
            </button>
          </div>
          {coverLookup.status === 'done' ? <div style={{fontSize: 12, color: '#16a34a', marginTop: 6}}>{coverLookup.message}</div> : null}
          {coverLookup.status === 'placeholder' ? <div style={{fontSize: 12, color: '#b07d2b', marginTop: 6}}>{coverLookup.message}</div> : null}
          {coverLookup.status === 'error' ? <div style={{fontSize: 12, color: '#d33', marginTop: 6}}>{coverLookup.message}</div> : null}
          {form.mainCoverPath ? <img src={publicAssetUrl(form.mainCoverPath)} alt="主书封面" style={{width: 68, height: 96, objectFit: 'cover', borderRadius: 6, marginTop: 8, border: '1px solid #d3d9e0'}} /> : null}
        </Field>
        <Field label="主书 · 背景图">
          <div style={{display: 'flex', gap: 8}}>
            {assetPicker('backgrounds', form.mainBackgroundPath, (value) => set('mainBackgroundPath', value), '使用模板默认背景')}
            <label style={softButtonStyle}>
              上传
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!apiOk || upload.status === 'uploading'} onChange={(e) => uploadToField('backgrounds', 'mainBackgroundPath', e.target.files?.[0])} style={{display: 'none'}} />
            </label>
          </div>
          {form.mainBackgroundPath ? <img src={publicAssetUrl(form.mainBackgroundPath)} alt="主书背景" style={{width: '100%', height: 70, objectFit: 'cover', borderRadius: 6, marginTop: 8, border: '1px solid #d3d9e0'}} /> : null}
        </Field>
        <Field label="主书 · 中文金句">
          <input style={inputStyle} value={form.mainZh} onChange={(e) => set('mainZh', e.target.value)} />
        </Field>
        <Field label="主书 · 英文金句">
          <input style={inputStyle} value={form.mainEn} onChange={(e) => set('mainEn', e.target.value)} />
        </Field>

        <Field label="快闪书单（每行一本：书名 | 作者 | 封面路径）">
          <textarea style={{...inputStyle, height: 110, resize: 'vertical', fontFamily: 'inherit'}} value={form.flashBooksText} onChange={(e) => set('flashBooksText', e.target.value)} />
          <div style={{display: 'flex', gap: 8, alignItems: 'center', marginTop: 8}}>
            <label style={softButtonStyle}>
              按行上传封面
              <input type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={!apiOk || upload.status === 'uploading'} onChange={(e) => uploadFlashCovers(e.target.files)} style={{display: 'none'}} />
            </label>
            <span style={{fontSize: 12, color: '#8a93a0'}}>第 1 张对应第 1 行，依次写入第三列</span>
          </div>
          {flashBookRows.length > 0 ? (
            <div style={{display: 'grid', gap: 8, marginTop: 10}}>
              {flashBookRows.map((book, index) => (
                <div key={`${book.title}-${index}`} style={{display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', padding: 8, border: '1px solid #e1e6ee', borderRadius: 8, background: '#fff'}}>
                  <div style={{width: 52, height: 72, borderRadius: 6, overflow: 'hidden', background: '#eef2f7', border: '1px solid #d3d9e0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a93a0', fontSize: 11}}>
                    {book.coverPath ? <img src={publicAssetUrl(book.coverPath)} alt={`${book.title}封面`} style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : '封面'}
                  </div>
                  <div style={{minWidth: 0}}>
                    <div style={{fontSize: 12, fontWeight: 700, color: '#1b2430', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                      {index + 1}. {book.title}
                    </div>
                    <div style={{marginTop: 6}}>{assetPicker('covers', book.coverPath || '', (value) => updateFlashBook(index, {coverPath: value}), '使用生成式封面')}</div>
                  </div>
                  <label style={softButtonStyle}>
                    上传
                    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!apiOk || upload.status === 'uploading'} onChange={(e) => uploadFlashCoverAt(index, e.target.files?.[0])} style={{display: 'none'}} />
                  </label>
                </div>
              ))}
            </div>
          ) : null}
        </Field>

        <Field label="开场字幕 · 中文">
          <input style={inputStyle} value={form.subZh} onChange={(e) => set('subZh', e.target.value)} />
        </Field>
        <Field label="开场字幕 · 英文">
          <input style={inputStyle} value={form.subEn} onChange={(e) => set('subEn', e.target.value)} />
        </Field>

        <div style={{display: 'flex', gap: 16, marginTop: 14, alignItems: 'center'}}>
          <label style={{fontSize: 13}}>
            <input type="checkbox" checked={form.showSubtitles} onChange={(e) => set('showSubtitles', e.target.checked)} /> 显示字幕
          </label>
          <label style={{fontSize: 13}}>
            开场
            <select style={{marginLeft: 6, padding: '3px 6px'}} value={form.introMode} onChange={(e) => set('introMode', e.target.value as Form['introMode'])}>
              <option value="generated">生成式</option>
              <option value="video">本地视频</option>
            </select>
          </label>
        </div>
        <Field label="开场视频">
          <div style={{display: 'flex', gap: 8}}>
            {assetPicker('introVideos', form.introVideoPath, (value) => set('introVideoPath', value), '不使用本地开场视频')}
            <label style={softButtonStyle}>
              上传
              <input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={!apiOk || upload.status === 'uploading'} onChange={(e) => uploadToField('introVideos', 'introVideoPath', e.target.files?.[0])} style={{display: 'none'}} />
            </label>
          </div>
        </Field>
        <Field label="开场生成背景图">
          <div style={{display: 'flex', gap: 8}}>
            {assetPicker('backgrounds', form.introBackgroundPath, (value) => set('introBackgroundPath', value), '使用生成式默认背景')}
            <label style={softButtonStyle}>
              上传
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!apiOk || upload.status === 'uploading'} onChange={(e) => uploadToField('backgrounds', 'introBackgroundPath', e.target.files?.[0])} style={{display: 'none'}} />
            </label>
          </div>
          {form.introBackgroundPath ? <img src={publicAssetUrl(form.introBackgroundPath)} alt="开场背景" style={{width: '100%', height: 70, objectFit: 'cover', borderRadius: 6, marginTop: 8, border: '1px solid #d3d9e0'}} /> : null}
        </Field>
        <Field label="开场角标">
          <input style={inputStyle} value={form.introBrandText} onChange={(e) => set('introBrandText', e.target.value)} placeholder="留空则不显示" />
        </Field>
      </div>

      {/* 预览 */}
      <div style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#101827', border: '1px solid #e5eaf3', padding: 18}}>
        <div style={{boxShadow: '0 20px 60px rgba(0,0,0,0.5)', borderRadius: 12, overflow: 'hidden'}}>
          <Player
            component={BookIntroFromConfig}
            inputProps={raw as Record<string, unknown>}
            durationInFrames={duration}
            compositionWidth={720}
            compositionHeight={1280}
            fps={FPS}
            initialFrame={previewFrame}
            style={{width: 288, height: 512}}
            controls
            loop
          />
        </div>
        {render.status === 'done' && render.url ? (
          <div id="render-result" style={{display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 6, padding: '8px 12px', fontSize: 13}}>
            <span style={{color: '#16a34a', fontWeight: 700}}>生成完成</span>
            <a href={render.url} target="_blank" rel="noreferrer" style={{color: '#2f6bff'}}>播放</a>
            <a href={render.url} download style={{color: '#2f6bff'}}>下载 MP4</a>
          </div>
        ) : null}
        {render.status === 'error' ? <div style={{background: '#fff', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#d33'}}>渲染失败：{render.error}</div> : null}
        {!apiOk ? <div style={{background: '#fff', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#8a93a0'}}>本地服务未连接，暂不能生成视频。</div> : null}
      </div>
      </div>
        <div style={{display: view === 'assets' ? 'flex' : 'none', flex: 1, minHeight: 0}}>
        {assetLibraryView}
      </div>
        <div style={{display: view === 'tasks' ? 'flex' : 'none', flex: 1, minHeight: 0}}>
        {taskCenterView}
      </div>
        <div style={{display: view === 'batch' ? 'block' : 'none', flex: 1, minHeight: 0, overflow: 'auto', background: '#f1f4fa', padding: '0 24px 22px'}}>
        {batchView}
      </div>
        <div style={{display: view === 'settings' ? 'flex' : 'none', flex: 1, minHeight: 0}}>
        {settingsView}
      </div>
      </main>
    </div>
  );
};
