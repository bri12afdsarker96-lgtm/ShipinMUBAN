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
  mainTitle: string;
  mainAuthor: string;
  mainCoverPath: string;
  mainZh: string;
  mainEn: string;
  flashBooksText: string;
  flashCutFramesText: string;
  introMode: 'generated' | 'video';
  showSubtitles: boolean;
  subZh: string;
  subEn: string;
};

const INITIAL: Form = {
  template: 'classic',
  audio: 'sample-beat.wav',
  mainTitle: '月亮与六便士',
  mainAuthor: '毛姆',
  mainCoverPath: '',
  mainZh: '满地都是六便士，他却抬头看见了月亮',
  mainEn: 'Everyone has sixpence, he looked up at the moon',
  flashBooksText: ['了不起的盖茨比 | 菲茨杰拉德', '简爱 | 夏洛蒂', '瓦尔登湖 | 梭罗', '傲慢与偏见 | 奥斯汀', '白鲸 | 麦尔维尔'].join('\n'),
  flashCutFramesText: '',
  introMode: 'generated',
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

type BatchRecord = {index: number; id: string; status: string; qc?: {warnings: string[]; infos: string[]}; url?: string; ms?: number; error?: string};
const STATUS_LABEL: Record<string, string> = {queued: '排队中', rendering: '渲染中', rendered: '完成', failed: '失败', 'qc-failed': '质检未过'};

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

const buildRaw = (form: Form): RawConfigInput => {
  const flashBooks = form.flashBooksText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [title, author] = line.split('|').map((s) => s.trim());
      return {title: title || '未命名', author: author || undefined, isbn: null, coverPath: null};
    });

  const tracks = form.subZh || form.subEn
    ? [{id: 's1', startFrame: 8, endFrame: 60, zh: form.subZh || undefined, en: form.subEn || undefined, position: 'lower'}]
    : [];

  return {
    template: form.template,
    audio: form.audio || undefined,
    books: {
      flashCutFrames: parseFrameList(form.flashCutFramesText) || defaultCutFrames(flashBooks.length),
      flashBooks,
      mainBook: {
        title: form.mainTitle,
        author: form.mainAuthor || undefined,
        isbn: null,
        coverPath: form.mainCoverPath || null,
        backgroundPath: null,
        zhLine: form.mainZh || undefined,
        enLine: form.mainEn || undefined,
      },
    },
    subtitles: {tracks},
    intro: {mode: form.introMode, videoPath: null, trimStart: 0, trimEnd: null, volume: 1, muted: false, showSubtitles: form.showSubtitles},
  };
};

const labelStyle: React.CSSProperties = {display: 'block', fontSize: 12, color: '#5b6472', marginBottom: 4, marginTop: 14, fontWeight: 600};
const inputStyle: React.CSSProperties = {width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #d3d9e0', borderRadius: 8, fontSize: 14, background: '#fff'};

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

// 支持通过 URL 预填初始表单，便于分享带预设的编辑器链接（如 ?template=drama&title=...）。
const initialForm = (): Form => {
  if (typeof location === 'undefined') return INITIAL;
  const p = new URLSearchParams(location.search);
  return {
    ...INITIAL,
    template: p.get('template') || INITIAL.template,
    mainTitle: p.get('title') || INITIAL.mainTitle,
    mainAuthor: p.get('author') || INITIAL.mainAuthor,
    mainCoverPath: p.get('cover') || INITIAL.mainCoverPath,
    flashCutFramesText: p.get('cuts') || INITIAL.flashCutFramesText,
    mainZh: p.get('zh') || INITIAL.mainZh,
    mainEn: p.get('en') || INITIAL.mainEn,
  };
};

export const App: React.FC = () => {
  const [form, setForm] = useState<Form>(initialForm);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({...f, [key]: value}));

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
  const [upload, setUpload] = useState<{status: 'idle' | 'uploading' | 'done' | 'error'; error?: string}>({status: 'idle'});
  const [beats, setBeats] = useState<{status: 'idle' | 'detecting' | 'done' | 'error'; count?: number; error?: string}>({status: 'idle'});
  const [coverLookup, setCoverLookup] = useState<{status: 'idle' | 'querying' | 'done' | 'placeholder' | 'error'; message?: string}>({status: 'idle'});
  useEffect(() => {
    fetch('/api/health')
      .then((r) => setApiOk(r.ok))
      .catch(() => setApiOk(false));
  }, []);
  const renderNow = async () => {
    setRender({status: 'rendering'});
    try {
      const res = await fetch('/api/render', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({id: form.mainTitle, ...raw})});
      const data = await res.json();
      if (data.ok) setRender({status: 'done', url: data.url});
      else setRender({status: 'error', error: data.error || '渲染失败'});
    } catch (e) {
      setRender({status: 'error', error: String(e)});
    }
  };

  const uploadMainCover = async (file: File | null | undefined) => {
    if (!file) return;
    if (!apiOk) {
      setUpload({status: 'error', error: '本地服务未连接'});
      return;
    }
    setUpload({status: 'uploading'});
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await fetch('/api/assets/upload', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({kind: 'covers', fileName: file.name, dataUrl}),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '上传失败');
      set('mainCoverPath', data.path);
      setUpload({status: 'done'});
    } catch (error) {
      setUpload({status: 'error', error: String(error)});
    }
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
  const [view, setView] = useState<'edit' | 'batch'>(() =>
    typeof location !== 'undefined' && new URLSearchParams(location.search).get('view') === 'batch' ? 'batch' : 'edit',
  );
  const [batchText, setBatchText] = useState(SAMPLE_BATCH);
  const [batch, setBatch] = useState<{jobId?: string; records: BatchRecord[]; running: boolean}>({records: [], running: false});
  useEffect(() => {
    if (!batch.jobId || !batch.running) return undefined;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/batch/${batch.jobId}`);
        const data = await res.json();
        setBatch((b) => ({...b, records: data.records || [], running: data.running}));
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
      if (data.jobId) setBatch({jobId: data.jobId, records: [], running: true});
      else alert(data.error || '启动失败');
    } catch (e) {
      alert(String(e));
    }
  };
  const useCurrentInBatch = () => {
    setBatchText(JSON.stringify([{id: form.mainTitle || 'video', ...raw}], null, 2));
  };
  const doneCount = batch.records.filter((r) => r && ['rendered', 'failed', 'qc-failed'].includes(r.status)).length;

  // 批量历史（服务端归档，重启后仍可见）
  const [batches, setBatches] = useState<{jobId: string; total?: number; summary?: Record<string, number>; running?: boolean; createdAt?: string}[]>([]);
  useEffect(() => {
    if (view !== 'batch' || !apiOk) return;
    fetch('/api/batches')
      .then((r) => r.json())
      .then((d) => setBatches(d.batches || []))
      .catch(() => undefined);
  }, [view, apiOk, batch.running]);

  const batchView = (
    <div style={{padding: 24, width: '100%', maxWidth: 960, margin: '0 auto', boxSizing: 'border-box'}}>
      <h2 style={{fontSize: 17, margin: '0 0 6px'}}>批量渲染队列</h2>
      <div style={{fontSize: 13, color: '#8a93a0', marginBottom: 10}}>
        粘贴批量数据（JSON 数组，字段同 <code>config/batch/sample.json</code>），逐条排队渲染并显示进度与质检。
      </div>
      <textarea value={batchText} onChange={(e) => setBatchText(e.target.value)} style={{width: '100%', height: 150, boxSizing: 'border-box', padding: 10, border: '1px solid #d3d9e0', borderRadius: 8, fontFamily: 'ui-monospace, monospace', fontSize: 12}} />
      <div style={{display: 'flex', gap: 10, alignItems: 'center', margin: '10px 0 18px'}}>
        <button onClick={startBatch} disabled={!apiOk || batch.running} style={{padding: '9px 16px', border: 'none', borderRadius: 8, background: !apiOk || batch.running ? '#9bb4e8' : '#16a34a', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer'}}>
          {batch.running ? `渲染中… ${doneCount}/${batch.records.length}` : '开始批量渲染'}
        </button>
        <button onClick={useCurrentInBatch} style={{padding: '9px 14px', border: '1px solid #cdd5df', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer'}}>
          用当前编辑配置
        </button>
        {!apiOk ? <span style={{fontSize: 12, color: '#8a93a0'}}>需本地服务（npm run server）</span> : null}
      </div>

      {batch.records.length > 0 ? (
        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 13}}>
          <thead>
            <tr style={{textAlign: 'left', color: '#6b7480', borderBottom: '2px solid #e6eaf0'}}>
              <th style={{padding: '8px 6px'}}>#</th>
              <th style={{padding: '8px 6px'}}>ID</th>
              <th style={{padding: '8px 6px'}}>状态</th>
              <th style={{padding: '8px 6px'}}>质检</th>
              <th style={{padding: '8px 6px'}}>产物</th>
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
                <td style={{padding: '8px 6px', color: '#b07d2b'}}>{r?.qc && r.qc.warnings.length ? `${r.qc.warnings.length} 警告` : r?.error ? r.error : '—'}</td>
                <td style={{padding: '8px 6px'}}>{r?.url ? (<a href={r.url} target="_blank" rel="noreferrer" style={{color: '#2f6bff'}}>播放</a>) : '—'}</td>
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
              <span>{b.running ? '进行中…' : b.summary ? Object.entries(b.summary).map(([k, v]) => `${k}:${v}`).join('  ') : '—'}</span>
              <span style={{color: '#9aa4b0', marginLeft: 'auto'}}>{b.createdAt ? b.createdAt.slice(0, 19).replace('T', ' ') : ''}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  const tabBtn = (v: 'edit' | 'batch', label: string) => (
    <button onClick={() => setView(v)} style={{padding: '10px 16px', border: 'none', borderBottom: view === v ? '2px solid #2f6bff' : '2px solid transparent', background: 'transparent', fontSize: 14, fontWeight: 600, color: view === v ? '#2f6bff' : '#6b7480', cursor: 'pointer'}}>
      {label}
    </button>
  );

  return (
    <div style={{display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif', color: '#1b2430'}}>
      <div style={{display: 'flex', gap: 4, padding: '0 16px', borderBottom: '1px solid #e6eaf0', background: '#fff', flexShrink: 0}}>
        {tabBtn('edit', '编辑器')}
        {tabBtn('batch', '批量队列')}
      </div>
      <div style={{display: view === 'edit' ? 'flex' : 'none', flex: 1, minHeight: 0}}>
      {/* 编辑面板 */}
      <div style={{width: 380, padding: '20px 22px', overflowY: 'auto', borderRight: '1px solid #e6eaf0', background: '#f7f9fc'}}>
        <h1 style={{fontSize: 18, margin: '0 0 4px'}}>书籍短视频编辑器</h1>
        <div style={{fontSize: 12, color: '#8a93a0'}}>编辑 → 实时预览 → 导出配置给批量引擎</div>

        <Field label="模板风格">
          <select style={inputStyle} value={form.template} onChange={(e) => set('template', e.target.value)}>
            {templateIds().map((id) => (
              <option key={id} value={id}>
                {id} · {getTemplate(id).label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="背景音乐（相对 public / 或 asset 引用）">
          <input style={inputStyle} value={form.audio} onChange={(e) => set('audio', e.target.value)} />
        </Field>
        <Field label="快闪切点帧">
          <div style={{display: 'flex', gap: 8}}>
            <input style={{...inputStyle, flex: 1}} value={form.flashCutFramesText} onChange={(e) => set('flashCutFramesText', e.target.value)} placeholder="134, 142, 146..." />
            <button type="button" onClick={detectBeats} disabled={!apiOk || beats.status === 'detecting'} style={{padding: '8px 11px', borderRadius: 8, border: '1px solid #cdd5df', background: apiOk ? '#fff' : '#eef2f7', fontSize: 13, cursor: apiOk ? 'pointer' : 'default', whiteSpace: 'nowrap'}}>
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
            <input style={{...inputStyle, flex: 1}} value={form.mainCoverPath} onChange={(e) => set('mainCoverPath', e.target.value)} placeholder="covers/book.jpg" />
            <label style={{padding: '8px 11px', borderRadius: 8, border: '1px solid #cdd5df', background: apiOk ? '#fff' : '#eef2f7', fontSize: 13, cursor: apiOk ? 'pointer' : 'default', whiteSpace: 'nowrap'}}>
              {upload.status === 'uploading' ? '上传中' : '上传'}
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!apiOk || upload.status === 'uploading'} onChange={(e) => uploadMainCover(e.target.files?.[0])} style={{display: 'none'}} />
            </label>
            <button type="button" onClick={lookupMainCover} disabled={!apiOk || coverLookup.status === 'querying'} style={{padding: '8px 11px', borderRadius: 8, border: '1px solid #cdd5df', background: apiOk ? '#fff' : '#eef2f7', fontSize: 13, cursor: apiOk ? 'pointer' : 'default', whiteSpace: 'nowrap'}}>
              {coverLookup.status === 'querying' ? '查询中' : '查询'}
            </button>
          </div>
          {upload.status === 'error' ? <div style={{fontSize: 12, color: '#d33', marginTop: 6}}>{upload.error}</div> : null}
          {coverLookup.status === 'done' ? <div style={{fontSize: 12, color: '#16a34a', marginTop: 6}}>{coverLookup.message}</div> : null}
          {coverLookup.status === 'placeholder' ? <div style={{fontSize: 12, color: '#b07d2b', marginTop: 6}}>{coverLookup.message}</div> : null}
          {coverLookup.status === 'error' ? <div style={{fontSize: 12, color: '#d33', marginTop: 6}}>{coverLookup.message}</div> : null}
          {form.mainCoverPath ? <img src={publicAssetUrl(form.mainCoverPath)} alt="主书封面" style={{width: 68, height: 96, objectFit: 'cover', borderRadius: 6, marginTop: 8, border: '1px solid #d3d9e0'}} /> : null}
        </Field>
        <Field label="主书 · 中文金句">
          <input style={inputStyle} value={form.mainZh} onChange={(e) => set('mainZh', e.target.value)} />
        </Field>
        <Field label="主书 · 英文金句">
          <input style={inputStyle} value={form.mainEn} onChange={(e) => set('mainEn', e.target.value)} />
        </Field>

        <Field label="快闪书单（每行一本：书名 | 作者）">
          <textarea style={{...inputStyle, height: 110, resize: 'vertical', fontFamily: 'inherit'}} value={form.flashBooksText} onChange={(e) => set('flashBooksText', e.target.value)} />
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
      </div>

      {/* 预览 */}
      <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#11151c'}}>
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
      </div>

      {/* 渲染 + 导出 */}
      <div style={{width: 320, padding: '20px 18px', borderLeft: '1px solid #e6eaf0', background: '#f7f9fc', display: 'flex', flexDirection: 'column'}}>
        <h2 style={{fontSize: 15, margin: '0 0 8px'}}>渲染 MP4</h2>
        {apiOk ? (
          <button
            id="render-btn"
            onClick={renderNow}
            disabled={render.status === 'rendering'}
            style={{padding: '9px 12px', border: 'none', borderRadius: 8, background: render.status === 'rendering' ? '#9bb4e8' : '#16a34a', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 600}}
          >
            {render.status === 'rendering' ? '渲染中…（约 15s）' : '渲染此配置为 MP4'}
          </button>
        ) : (
          <div style={{fontSize: 12, color: '#8a93a0', lineHeight: 1.6}}>
            未连接本地服务。运行 <code>npm run gui:build</code> 后 <code>node scripts/server.mjs</code>，用 :4000 打开即可一键渲染。
          </div>
        )}
        {render.status === 'done' && render.url ? (
          <div id="render-result" style={{marginTop: 12}}>
            <video src={render.url} controls style={{width: '100%', borderRadius: 8, background: '#000'}} />
            <a href={render.url} download style={{fontSize: 13, color: '#2f6bff'}}>
              下载 MP4
            </a>
          </div>
        ) : null}
        {render.status === 'error' ? <div style={{marginTop: 10, fontSize: 12, color: '#d33'}}>渲染失败：{render.error}</div> : null}

        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20}}>
          <h2 style={{fontSize: 15, margin: 0}}>导出配置</h2>
          <button id="copy-btn" onClick={copyExport} style={{padding: '6px 12px', border: 'none', borderRadius: 8, background: '#2f6bff', color: '#fff', fontSize: 13, cursor: 'pointer'}}>
            复制
          </button>
        </div>
        <div style={{fontSize: 12, color: '#8a93a0', margin: '6px 0 10px'}}>把它作为批量数据的一项（JSON 数组元素）喂给 render-batch。</div>
        <pre id="export-json" style={{flex: 1, margin: 0, overflow: 'auto', background: '#0f1620', color: '#cfe3ff', padding: 12, borderRadius: 8, fontSize: 11, lineHeight: 1.5}}>
          {exportJson}
        </pre>
      </div>
      </div>
      <div style={{display: view === 'batch' ? 'block' : 'none', flex: 1, minHeight: 0, overflow: 'auto', background: '#f7f9fc'}}>
        {batchView}
      </div>
    </div>
  );
};
